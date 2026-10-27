import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  claimStoreTicket,
  createStoreTicket,
  type EffortSnapshot,
  nextSteps,
  nodeProcessRunner,
  RECOMMENDED_SKILLS,
  readProjectState,
  resolveStoreTicket,
  type RepoSnapshot,
  seedStore,
  TICKET_TYPES,
  TRIAGE_ROLES,
  type Ticket,
  type TicketType,
  whyNot,
} from "../src/index.ts";

/**
 * A ticket from header lines as the skills wrote them (`Type: task`, `Status: claimed`, `Blocked by: 01, 02`,
 * `Spec: path`); the first other line starts the Report.
 */
function ticket(map: string, id: string, fields: string[] = [], title = `Ticket ${id}`): Ticket {
  const header = new Map<string, string>();
  let bodyAt = fields.length;
  for (const [i, line] of fields.entries()) {
    const match = /^(Type|Status|Blocked by|Spec|Claimed by):\s*(.*)$/.exec(line);
    if (match?.[1] === undefined) {
      if (line.trim() === "") continue;
      bodyAt = i;
      break;
    }
    header.set(match[1].toLowerCase(), match[2] ?? "");
  }
  const status = header.get("status");
  const state = status === "claimed" || status === "resolved" ? status : "open";
  const role = TRIAGE_ROLES.find((known) => known === status);
  const type = TICKET_TYPES.find((known) => known === header.get("type"));
  const blockers = header.get("blocked by")?.match(/\d+/g) ?? [];
  const spec = header.get("spec");
  return {
    id,
    map,
    title,
    type: (type ?? "none") satisfies TicketType,
    state,
    claimant: state === "claimed" ? (header.get("claimed by") ?? null) : null,
    blockers,
    triageRole: state === "open" && role !== undefined ? role : null,
    body: fields.slice(bodyAt).join("\n").trim(),
    answer: state === "resolved" ? "Done." : null,
    comments: [],
    ...(spec === undefined ? {} : { spec: "spec.md" }),
  };
}

function effort(name: string, options: { fog?: string[]; spec?: boolean; map?: boolean } = {}): EffortSnapshot {
  return {
    name,
    map: options.map === false ? null : { name, title: name, destination: "", fog: options.fog ?? [], decisions: [] },
    hasSpec: options.spec ?? false,
  };
}

function snapshot(efforts: EffortSnapshot[], tickets: Ticket[], overrides: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return {
    hasStore: true,
    efforts,
    tickets,
    hasGlossary: true,
    adrCount: 0,
    git: null,
    sessions: null,
    ...overrides,
  };
}

describe("nextSteps rules", () => {
  it("no setup config: recommends `dryland init` for the repo", () => {
    expect(nextSteps(snapshot([], [], { hasStore: false }))).toEqual([
      {
        ruleId: "no-setup-config",
        command: "dryland init",
        target: { kind: "repo" },
        reason: "The repo has no Dryland state store, so there is nowhere to keep tickets and maps.",
        evidence: [{ artifact: "state store", field: "presence", value: "missing" }],
      },
    ]);
  });

  it("map with a frontier ticket: recommends /wayfinder <map> naming the ticket", () => {
    const steps = nextSteps(
      snapshot(
        [effort("shop", { fog: ["Payments"] })],
        [
          ticket("shop", "01", ["Type: research", "Status: resolved"]),
          ticket("shop", "02", ["Type: grilling", "Blocked by: 01"], "Pick a gateway"),
        ],
      ),
    );

    expect(steps).toEqual([
      {
        ruleId: "map-frontier",
        command: "/wayfinder shop",
        target: { kind: "ticket", map: "shop", id: "02" },
        reason: 'Ticket 02 "Pick a gateway" is open, unblocked and unclaimed on map shop.',
        evidence: [
          { artifact: "shop/02", field: "Status", value: "open, unclaimed" },
          { artifact: "shop/02", field: "Blocked by", value: "01 (all resolved)" },
        ],
      },
    ]);
  });

  it("cleared map: recommends /to-spec <map>", () => {
    const steps = nextSteps(snapshot([effort("shop")], [ticket("shop", "01", ["Type: research", "Status: resolved"])]));

    expect(steps).toEqual([
      {
        ruleId: "map-cleared",
        command: "/to-spec shop",
        target: { kind: "map", map: "shop" },
        reason: "Map shop is cleared: no open ticket and no fog remain, so its decisions can become a spec.",
        evidence: [
          { artifact: "map shop", field: "Not yet specified", value: "empty" },
          { artifact: "shop tickets", field: "open tickets", value: "0" },
        ],
      },
    ]);
  });

  it("map with only fog: the step targets the map itself", () => {
    const steps = nextSteps(
      snapshot(
        [effort("shop", { fog: ["Payments", "Shipping"] })],
        [ticket("shop", "01", ["Type: research", "Status: resolved"])],
      ),
    );

    expect(steps).toEqual([
      {
        ruleId: "map-fog-only",
        command: "/wayfinder shop",
        target: { kind: "map", map: "shop" },
        reason: "Map shop has no open ticket left and 2 items of fog, so the map itself is next.",
        evidence: [
          { artifact: "map shop", field: "Not yet specified", value: "2 items" },
          { artifact: "shop tickets", field: "open tickets", value: "0" },
        ],
      },
    ]);
  });

  it("spec without tickets: recommends /to-tickets for the spec", () => {
    const steps = nextSteps(
      snapshot([effort("shop", { spec: true })], [ticket("shop", "01", ["Type: grilling", "Status: resolved"])]),
    );

    expect(steps).toEqual([
      {
        ruleId: "spec-without-tickets",
        command: "/to-tickets",
        target: { kind: "spec", map: "shop" },
        reason: "The spec of shop has not been sliced into tickets yet.",
        evidence: [
          { artifact: ".scratch/shop/spec.md", field: "presence", value: "present" },
          { artifact: "shop tickets", field: "implementation tickets", value: "0" },
        ],
      },
    ]);
  });
});

describe("nextSteps session and claim rules", () => {
  it("a session waiting for input is a next step with no skill command", () => {
    const steps = nextSteps(
      snapshot([effort("shop")], [ticket("shop", "02", ["Type: task", "Status: claimed"])], {
        sessions: [{ id: "s1", ticket: { map: "shop", id: "02" }, state: "waiting" }],
      }),
    );

    expect(steps).toEqual([
      {
        ruleId: "waiting-session",
        command: null,
        target: { kind: "session", id: "s1", ticket: { map: "shop", id: "02" } },
        reason: "Session s1 on shop/02 is waiting for input.",
        evidence: [{ artifact: "session s1", field: "state", value: "waiting" }],
      },
    ]);
  });

  it("a claim with no live session is flagged possibly stale and never released", () => {
    const steps = nextSteps(
      snapshot([effort("shop")], [ticket("shop", "02", ["Type: task", "Status: claimed"])], {
        sessions: [{ id: "s1", ticket: { map: "shop", id: "02" }, state: "ended" }],
      }),
    );

    expect(steps).toEqual([
      {
        ruleId: "stale-claim",
        command: null,
        target: { kind: "ticket", map: "shop", id: "02" },
        reason:
          "Ticket shop/02 is claimed, possibly stale: no live Dryland session works on it and no ticket worktree is on its holder's branch.",
        evidence: [
          { artifact: "shop/02", field: "Status", value: "claimed" },
          { artifact: "shop/02", field: "claimant", value: "unknown" },
          { artifact: "sessions", field: "live sessions on shop/02", value: "0" },
          { artifact: "worktrees", field: "ticket worktrees on the claimant's branch", value: "0" },
        ],
      },
    ]);
  });

  it("does not flag a claim a live session holds, or when sessions are unknown", () => {
    const claimed = [ticket("shop", "02", ["Type: task", "Status: claimed"])];
    const live = snapshot([effort("shop")], claimed, {
      sessions: [{ id: "s1", ticket: { map: "shop", id: "02" }, state: "running" }],
    });

    expect(nextSteps(live)).toEqual([]);
    expect(nextSteps(snapshot([effort("shop")], claimed))).toEqual([]);
  });

  it("does not flag a claim whose session is paused, however it was left", () => {
    const claimed = [ticket("shop", "02", ["Type: task", "Status: claimed"])];
    const pausedWas = (was: "waiting" | "interrupted" | null) =>
      snapshot([effort("shop")], claimed, {
        sessions: [{ id: "c1", ticket: { map: "shop", id: "02" }, state: "paused", was }],
      });

    expect(nextSteps(pausedWas(null))).toEqual([]);
    expect(nextSteps(pausedWas("interrupted"))).toEqual([]);
  });

  it("a paused session that was waiting on you is a next step on its ticket, with no skill command", () => {
    const steps = nextSteps(
      snapshot([effort("shop")], [ticket("shop", "02", ["Type: task", "Status: claimed"])], {
        sessions: [{ id: "c1", ticket: { map: "shop", id: "02" }, state: "paused", was: "waiting" }],
      }),
    );

    expect(steps).toEqual([
      {
        ruleId: "paused-was-waiting",
        command: null,
        target: { kind: "ticket", map: "shop", id: "02" },
        reason: "Ticket shop/02 has a paused session (c1) that was waiting on you.",
        evidence: [
          { artifact: "session c1", field: "state", value: "paused" },
          { artifact: "session c1", field: "was", value: "waiting" },
        ],
      },
    ]);
  });

  it("ranks a paused session that was waiting after live waiting sessions and before stale claims", () => {
    const claimed = ["01", "02", "03"].map((id) => ticket("shop", id, ["Type: task", "Status: claimed"]));
    const steps = nextSteps(
      snapshot([effort("shop")], claimed, {
        sessions: [
          { id: "c2", ticket: { map: "shop", id: "02" }, state: "paused", was: "waiting" },
          { id: "s3", ticket: { map: "shop", id: "03" }, state: "waiting" },
        ],
      }),
    );

    expect(steps.map((s) => [s.ruleId, s.target.kind === "ticket" ? s.target.id : s.target.kind])).toEqual([
      ["waiting-session", "session"],
      ["paused-was-waiting", "02"],
      ["stale-claim", "01"],
    ]);
  });

  /** Ticket shop/02 claimed by `holder`, with no live session, and the given ticket worktree branches on disk. */
  function heldBy(holder: string, branches: string[]): RepoSnapshot {
    return snapshot(
      [effort("shop")],
      [ticket("shop", "02", ["Type: task", "Status: claimed", `Claimed by: ${holder}`])],
      {
        sessions: [],
        git: {
          worktrees: [
            { map: "shop", id: "02", exists: true, branches, aheadOfDefault: false, merged: false, prExists: null },
          ],
        },
      },
    );
  }
  const ruleIds = (input: RepoSnapshot) => nextSteps(input).map((s) => s.ruleId);

  it("does not flag a claim held by the branch of an existing ticket worktree, with no live session", () => {
    expect(nextSteps(heldBy("shop/02-grill", ["shop/02-grill"]))).toEqual([]);
  });

  it("flags a claim held by the default branch, or by a name no ticket worktree has checked out", () => {
    expect(ruleIds(heldBy("main", ["shop/02-grill"]))).toEqual(["stale-claim"]);
    expect(ruleIds(heldBy("shop/02-gone", ["shop/02-grill"]))).toEqual(["stale-claim"]);
    expect(nextSteps(heldBy("main", []))[0]?.evidence).toContainEqual({
      artifact: "shop/02",
      field: "claimant",
      value: "main",
    });
  });

  it("flags a claim an earlier build made for a session id, even while that session runs on another ticket", () => {
    const stillRunning = heldBy("s1", ["shop/02-grill"]);
    stillRunning.sessions = [{ id: "s1", ticket: { map: "shop", id: "05" }, state: "running" }];

    expect(ruleIds(heldBy("4f1c2a3e-0000-4000-8000-000000000000", []))).toEqual(["stale-claim"]);
    expect(ruleIds(stillRunning)).toEqual(["stale-claim"]);
  });
});

describe("nextSteps triage, implementation and unknown rules", () => {
  it("a needs-triage ticket: recommends /triage for it", () => {
    const steps = nextSteps(
      snapshot([effort("shop")], [ticket("shop", "04", ["Type: task", "Status: needs-triage"], "Odd bug")]),
    );

    expect(steps).toEqual([
      {
        ruleId: "needs-triage",
        command: "/triage",
        target: { kind: "ticket", map: "shop", id: "04" },
        reason: 'Ticket shop/04 "Odd bug" carries the needs-triage role.',
        evidence: [{ artifact: "shop/04", field: "triage role", value: "needs-triage" }],
      },
    ]);
  });

  it("a ready-for-agent ticket of a spec: recommends /implement-spec, then /implement for the ticket", () => {
    const steps = nextSteps(
      snapshot(
        [effort("shop", { spec: true })],
        [
          ticket("shop", "20", ["Type: task", "Status: ready-for-agent", "Blocked by: 19"], "Add cart"),
          ticket("shop", "19", ["Status: resolved"]),
        ],
      ),
    );

    expect(steps).toEqual([
      {
        ruleId: "implement-spec",
        command: "/implement-spec",
        target: { kind: "spec", map: "shop" },
        reason: "The spec of shop has 1 ready-for-agent ticket.",
        evidence: [
          { artifact: ".scratch/shop/spec.md", field: "presence", value: "present" },
          { artifact: "shop tickets", field: "ready-for-agent tickets", value: "20" },
        ],
      },
      {
        ruleId: "implement-ticket",
        command: "/implement shop/20",
        target: { kind: "ticket", map: "shop", id: "20" },
        reason: 'Ticket shop/20 "Add cart" is ready-for-agent, unblocked and unclaimed.',
        evidence: [
          { artifact: "shop/20", field: "triage role", value: "ready-for-agent" },
          { artifact: "shop/20", field: "Blocked by", value: "19 (all resolved)" },
        ],
      },
    ]);
  });

  it("recommends /implement without /implement-spec when the effort has no spec", () => {
    const steps = nextSteps(
      snapshot([effort("shop")], [ticket("shop", "20", ["Type: task", "Status: ready-for-agent"])]),
    );

    expect(steps.map((s) => s.ruleId)).toEqual(["implement-ticket"]);
  });

  it("a blocked or claimed ready ticket is not recommended", () => {
    const steps = nextSteps(
      snapshot(
        [effort("shop")],
        [
          ticket("shop", "20", ["Type: task", "Status: ready-for-agent", "Blocked by: 21"]),
          ticket("shop", "21", ["Type: task", "Status: claimed"]),
        ],
      ),
    );

    expect(steps.map((s) => s.ruleId)).toEqual([]);
  });

  it("a ticket with unknown blockers is flagged blocking unknown and kept off the frontier", () => {
    const unknown = ticket("shop", "02", ["Type: research"]);
    unknown.blockers = "unknown";

    expect(nextSteps(snapshot([effort("shop", { fog: ["x"] })], [unknown]))).toEqual([
      {
        ruleId: "blocking-unknown",
        command: null,
        target: { kind: "ticket", map: "shop", id: "02" },
        reason: "Ticket shop/02 has blockers the tracker cannot report: blocking unknown.",
        evidence: [{ artifact: "shop/02", field: "Blocked by", value: "unknown" }],
      },
    ]);
  });
});

describe("nextSteps git rules", () => {
  const worktree = (
    over: Partial<{ exists: boolean; aheadOfDefault: boolean; merged: boolean; prExists: boolean | null }>,
  ) => ({
    map: "shop",
    id: "20",
    exists: true,
    branches: ["shop/20-add-cart"],
    aheadOfDefault: true,
    merged: false,
    prExists: null,
    ...over,
  });
  const done = ticket("shop", "20", ["Type: task", "Status: resolved"], "Add cart");

  it("branch ahead and ticket done: recommends /code-review, then /pr", () => {
    const steps = nextSteps(snapshot([effort("shop", { spec: true })], [done], { git: { worktrees: [worktree({})] } }));

    expect(steps).toEqual([
      {
        ruleId: "review-before-pr",
        command: "/code-review",
        target: { kind: "ticket", map: "shop", id: "20" },
        reason: "Ticket shop/20 is resolved and its branch is ahead of the default branch: review it before the PR.",
        evidence: [
          { artifact: "shop/20", field: "Status", value: "resolved" },
          { artifact: "worktree shop/20", field: "ahead of default branch", value: "yes" },
        ],
      },
      {
        ruleId: "open-pr",
        command: "/pr",
        target: { kind: "ticket", map: "shop", id: "20" },
        reason: "Ticket shop/20 is resolved and its branch is ahead of the default branch with no PR yet.",
        evidence: [
          { artifact: "shop/20", field: "Status", value: "resolved" },
          { artifact: "worktree shop/20", field: "ahead of default branch", value: "yes" },
          { artifact: "worktree shop/20", field: "PR exists", value: "no or unknown" },
        ],
      },
    ]);
  });

  it("recommends neither when a PR exists, the ticket is open or the branch is not ahead", () => {
    const withPr = snapshot([effort("shop", { spec: true })], [done], {
      git: { worktrees: [worktree({ prExists: true })] },
    });
    const open = snapshot([effort("shop", { spec: true })], [ticket("shop", "20", ["Type: task"])], {
      git: { worktrees: [worktree({})] },
    });
    const level = snapshot([effort("shop", { spec: true })], [done], {
      git: { worktrees: [worktree({ aheadOfDefault: false })] },
    });

    for (const input of [withPr, open, level]) {
      expect(nextSteps(input).filter((s) => s.command === "/pr" || s.command === "/code-review")).toEqual([]);
    }
  });

  it("merged feature: recommends /retro", () => {
    const steps = nextSteps(
      snapshot([effort("shop", { spec: true })], [done], {
        git: { worktrees: [worktree({ merged: true, aheadOfDefault: false })] },
      }),
    );

    expect(steps).toEqual([
      {
        ruleId: "retro",
        command: "/retro",
        target: { kind: "ticket", map: "shop", id: "20" },
        reason: "Ticket shop/20 is resolved and its branch is merged, so the feature can be reviewed in retrospect.",
        evidence: [
          { artifact: "shop/20", field: "Status", value: "resolved" },
          { artifact: "worktree shop/20", field: "merged", value: "yes" },
        ],
      },
    ]);
  });
});

describe("nextSteps priority, compatibility and why-not", () => {
  /** One candidate of every priority class. */
  function everyClass(): RepoSnapshot {
    const unknown = ticket("blk", "01", ["Type: research"]);
    unknown.blockers = "unknown";
    return snapshot(
      [
        effort("map", { fog: ["x"] }),
        effort("imp", { spec: true }),
        effort("tri"),
        effort("nospec", { spec: true }),
        effort("blk"),
        effort("done", { spec: true }),
      ],
      [
        ticket("map", "01", ["Type: research"]),
        ticket("imp", "01", ["Type: task", "Status: ready-for-agent"]),
        ticket("tri", "01", ["Type: task", "Status: needs-triage"]),
        ticket("nospec", "01", ["Type: grilling", "Status: resolved"]),
        unknown,
        ticket("done", "01", ["Type: task", "Status: resolved"]),
        ticket("tri", "02", ["Type: task", "Status: claimed"]),
      ],
      {
        sessions: [{ id: "s1", ticket: { map: "tri", id: "01" }, state: "waiting" }],
        git: {
          worktrees: [
            {
              map: "done",
              id: "01",
              exists: true,
              branches: ["done/01-x"],
              aheadOfDefault: true,
              merged: false,
              prExists: false,
            },
          ],
        },
      },
    );
  }

  it("orders waiting, stale, frontier, ready, untriaged or unspecified, then housekeeping", () => {
    const steps = nextSteps(everyClass());

    expect(steps.map((s) => s.ruleId)).toEqual([
      "waiting-session",
      "stale-claim",
      "map-frontier",
      "implement-spec",
      "implement-ticket",
      "needs-triage",
      "spec-without-tickets",
      "blocking-unknown",
      "review-before-pr",
      "open-pr",
    ]);
  });

  it("never recommends a skill outside the mechanically triggered set", () => {
    const commands = nextSteps(everyClass())
      .map((s) => s.command)
      .filter((c): c is string => c !== null)
      .map((c) => c.split(" ")[0]);

    for (const command of commands) expect(RECOMMENDED_SKILLS).toContain(command);
    expect(RECOMMENDED_SKILLS).not.toContain("/grill-with-docs");
  });

  it("why not X: a blocked ticket lists exactly its unresolved blockers", () => {
    const input = snapshot(
      [effort("shop")],
      [
        ticket("shop", "01", ["Type: research", "Status: resolved"]),
        ticket("shop", "02", ["Type: research"]),
        ticket("shop", "03", ["Type: research", "Blocked by: 01, 02"]),
      ],
    );

    expect(whyNot(input, { map: "shop", id: "03" })).toEqual({ blockers: ["02"], unknown: false });
    expect(whyNot(input, { map: "shop", id: "02" })).toEqual({ blockers: [], unknown: false });
  });

  it("why not X: a ticket with unknown blockers says so", () => {
    const unknown = ticket("shop", "03", ["Type: research"]);
    unknown.blockers = "unknown";

    expect(whyNot(snapshot([effort("shop")], [unknown]), { map: "shop", id: "03" })).toEqual({
      blockers: [],
      unknown: true,
    });
  });
});

describe("nextSteps ordering and edges", () => {
  it("orders frontier steps by map, then lowest ticket number first", () => {
    const steps = nextSteps(
      snapshot(
        [effort("b", { fog: ["x"] }), effort("a", { fog: ["x"] })],
        [
          ticket("b", "03", ["Type: research"]),
          ticket("a", "09", ["Type: research"]),
          ticket("a", "02", ["Type: grilling"]),
          ticket("b", "01", ["Type: prototype"]),
        ],
      ),
    );

    expect(steps.map((s) => (s.target.kind === "ticket" ? `${s.target.map}/${s.target.id}` : s.ruleId))).toEqual([
      "a/02",
      "a/09",
      "b/01",
      "b/03",
    ]);
  });

  it("returns the same list for the same snapshot", () => {
    const input = snapshot([effort("a", { fog: ["x"] })], [ticket("a", "01", ["Type: research"])]);

    expect(nextSteps(input)).toEqual(nextSteps(structuredClone(input)));
  });

  it("puts setup first, then frontier, then fog, then spec steps", () => {
    const steps = nextSteps(
      snapshot(
        [effort("a", { fog: ["x"] }), effort("b", { fog: ["x"] }), effort("c", { spec: true })],
        [ticket("a", "01", ["Type: research", "Status: resolved"]), ticket("b", "01", ["Type: research"])],
        { hasStore: false },
      ),
    );

    expect(steps.map((s) => s.ruleId)).toEqual([
      "no-setup-config",
      "map-frontier",
      "map-fog-only",
      "spec-without-tickets",
    ]);
  });

  it("leaves a claimed or blocked ticket off the frontier and does not call the map cleared", () => {
    const steps = nextSteps(
      snapshot(
        [effort("a")],
        [
          ticket("a", "01", ["Type: research", "Status: claimed"]),
          ticket("a", "02", ["Type: research", "Blocked by: 01"]),
        ],
      ),
    );

    expect(steps).toEqual([]);
  });

  it("does not call an empty map cleared", () => {
    expect(nextSteps(snapshot([effort("a")], []))).toEqual([]);
  });

  it("does not recommend /to-spec once the effort has a spec", () => {
    const steps = nextSteps(
      snapshot(
        [effort("a", { spec: true })],
        [
          ticket("a", "01", ["Type: research", "Status: resolved"]),
          ticket("a", "02", ["Type: task", "Status: ready-for-agent"]),
        ],
      ),
    );

    expect(steps.map((s) => s.ruleId)).toEqual(["implement-spec", "implement-ticket"]);
  });

  it("leaves implementation tickets to /implement rules, not /wayfinder", () => {
    const steps = nextSteps(
      snapshot([effort("a", { spec: true })], [ticket("a", "20", ["Type: task", "Status: ready-for-agent"])]),
    );

    expect(steps.map((s) => s.ruleId)).toEqual(["implement-spec", "implement-ticket"]);
  });

  it("keeps a resolved task that poses a question wayfinding work, even beside a spec", () => {
    const steps = nextSteps(
      snapshot(
        [effort("a", { spec: true })],
        [ticket("a", "01", ["Type: task", "Status: resolved", "", "## Question", "", "Does it work?"])],
      ),
    );

    expect(steps.map((s) => s.ruleId)).toEqual(["spec-without-tickets"]);
  });

  it("takes a Spec: header as a slice whatever the ticket type", () => {
    const steps = nextSteps(
      snapshot(
        [effort("a", { spec: true })],
        [ticket("a", "20", ["Type: research", "Status: resolved", "Spec: [spec](../spec.md)"])],
      ),
    );

    expect(steps).toEqual([]);
  });

  it("treats a task as wayfinding work until the effort has a spec", () => {
    const steps = nextSteps(snapshot([effort("a")], [ticket("a", "01", ["Type: task"])]));

    expect(steps.map((s) => s.ruleId)).toEqual(["map-frontier"]);
  });

  it("recommends /to-tickets for a spec whose effort has no map", () => {
    expect(nextSteps(snapshot([effort("a", { spec: true, map: false })], [])).map((s) => s.ruleId)).toEqual([
      "spec-without-tickets",
    ]);
  });
});

describe("readRepoSnapshot git state", () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });

  async function repoWithResolvedTicket(): Promise<string> {
    process.env["DRYLAND_DATA_DIR"] ??= mkdtempSync(join(tmpdir(), "dryland-data-"));
    const root = mkdtempSync(join(tmpdir(), "dryland-snapshot-git-"));
    git(root, "init", "-q", "-b", "main");
    git(root, "commit", "-q", "--allow-empty", "-m", "init");
    await seedStore(root, [{ effort: "m", map: { title: "m" }, tickets: [{ title: "A" }] }]);
    await resolveStoreTicket(root, "m/01", "Done.", { author: "engine" });
    return root;
  }

  const read = async (root: string) => (await readProjectState(nodeProcessRunner, root)).snapshot;

  it("yields review-before-pr and open-pr for a Linked worktree ahead of main", async () => {
    const root = await repoWithResolvedTicket();
    const tree = join(mkdtempSync(join(tmpdir(), "dryland-wt-")), "wt");
    git(root, "worktree", "add", "-q", "-b", "m/01-a", tree);
    writeFileSync(join(tree, "work.txt"), "x");
    git(tree, "add", "-A");
    git(tree, "commit", "-q", "-m", "work");

    const snapshot = await read(root);

    expect(snapshot.git?.worktrees).toEqual([
      { map: "m", id: "01", exists: true, branches: ["m/01-a"], aheadOfDefault: true, merged: false, prExists: null },
    ]);
    expect(nextSteps(snapshot).map((s) => s.ruleId)).toEqual(["map-cleared", "review-before-pr", "open-pr"]);
  });

  it("keeps a claim held by a ticket worktree's branch from reading stale while no session runs", async () => {
    const root = await repoWithResolvedTicket();
    await createStoreTicket(root, JSON.stringify({ effort: "m", title: "B", type: "task" }), { author: "engine" });
    await claimStoreTicket(root, "m/02", { author: "engine", holder: "m/02-b" });
    const staleWith = async () =>
      nextSteps((await readProjectState(nodeProcessRunner, root, [])).snapshot)
        .filter((s) => s.ruleId === "stale-claim")
        .map((s) => s.target);

    expect(await staleWith()).toEqual([{ kind: "ticket", map: "m", id: "02" }]);
    git(root, "worktree", "add", "-q", "-b", "m/02-b", join(mkdtempSync(join(tmpdir(), "dryland-wt-")), "wt"));
    expect(await staleWith()).toEqual([]);
  });

  it("calls a branch merged once its work is in the default branch", async () => {
    const root = await repoWithResolvedTicket();
    const tree = join(mkdtempSync(join(tmpdir(), "dryland-wt-")), "wt");
    git(root, "worktree", "add", "-q", "-b", "m/01-a", tree);
    writeFileSync(join(tree, "work.txt"), "x");
    git(tree, "add", "-A");
    git(tree, "commit", "-q", "-m", "work");
    git(root, "merge", "-q", "--no-edit", "m/01-a");
    writeFileSync(join(root, "later.txt"), "y");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "later");

    const snapshot = await read(root);

    expect(snapshot.git?.worktrees[0]).toMatchObject({ aheadOfDefault: false, merged: true });
    expect(nextSteps(snapshot).map((s) => s.ruleId)).toContain("retro");
  });

  it("calls a fast-forward-merged branch merged even before the default branch moves on", async () => {
    const root = await repoWithResolvedTicket();
    const tree = join(mkdtempSync(join(tmpdir(), "dryland-wt-")), "wt");
    git(root, "worktree", "add", "-q", "-b", "m/01-a", tree);
    writeFileSync(join(tree, "work.txt"), "x");
    git(tree, "add", "-A");
    git(tree, "commit", "-q", "-m", "work");
    git(root, "merge", "-q", "--ff-only", "m/01-a");

    const snapshot = await read(root);

    expect(snapshot.git?.worktrees[0]).toMatchObject({ aheadOfDefault: false, merged: true });
  });

  it("does not call a fresh empty branch merged", async () => {
    const root = await repoWithResolvedTicket();
    const tree = join(mkdtempSync(join(tmpdir(), "dryland-wt-")), "wt");
    git(root, "worktree", "add", "-q", "-b", "m/01-a", tree);
    writeFileSync(join(root, "later.txt"), "y");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "later");

    const snapshot = await read(root);

    expect(snapshot.git?.worktrees[0]).toMatchObject({ aheadOfDefault: false, merged: false });
  });

  it("folds the worktrees of one ticket, ignoring one that is gone from disk", async () => {
    const root = await repoWithResolvedTicket();
    const holder = mkdtempSync(join(tmpdir(), "dryland-wt-"));
    const gone = join(holder, "gone");
    git(root, "worktree", "add", "-q", "-b", "m/01-a", gone);
    writeFileSync(join(gone, "work.txt"), "x");
    git(gone, "add", "-A");
    git(gone, "commit", "-q", "-m", "work");
    const kept = join(holder, "kept");
    git(root, "worktree", "add", "-q", "-b", "m/01-a-2", kept);
    rmSync(gone, { recursive: true, force: true });

    const snapshot = await read(root);

    expect(snapshot.git?.worktrees).toEqual([
      {
        map: "m",
        id: "01",
        exists: true,
        branches: ["m/01-a-2"],
        aheadOfDefault: false,
        merged: false,
        prExists: null,
      },
    ]);
  });

  it("leaves git unknown when the repo has no default branch to compare against", async () => {
    const root = mkdtempSync(join(tmpdir(), "dryland-snapshot-nobase-"));
    git(root, "init", "-q", "-b", "trunk");

    const snapshot = await read(root);

    expect(snapshot.git).toBeNull();
  });

  it("leaves git unknown outside a git repo, and sessions unknown", async () => {
    const root = mkdtempSync(join(tmpdir(), "dryland-snapshot-nogit-"));

    const snapshot = await read(root);

    expect(snapshot.git).toBeNull();
    expect(snapshot.sessions).toBeNull();
  });
});
