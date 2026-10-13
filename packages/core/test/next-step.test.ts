import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type EffortSnapshot,
  nextSteps,
  nodeProcessRunner,
  parseMap,
  RECOMMENDED_SKILLS,
  parseTicketFile,
  readLocalMarkdownTickets,
  readRepoSnapshot,
  type RepoSnapshot,
  type Ticket,
  whyNot,
} from "../src/index.ts";

function ticket(map: string, id: string, fields: string[] = [], title = `Ticket ${id}`): Ticket {
  return parseTicketFile(map, id, [`# ${title}`, "", ...fields, ""].join("\n"));
}

function effort(name: string, options: { fog?: string[]; spec?: boolean; map?: boolean } = {}): EffortSnapshot {
  const fog = (options.fog ?? []).map((item) => `- ${item}`).join("\n") || "Nothing.";
  return {
    name,
    map: options.map === false ? null : parseMap(name, `# Map: ${name}\n\n## Not yet specified\n\n${fog}\n`),
    hasSpec: options.spec ?? false,
  };
}

function snapshot(efforts: EffortSnapshot[], tickets: Ticket[], overrides: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return {
    setupConfigPresent: true,
    efforts,
    tickets,
    hasGlossary: true,
    adrCount: 0,
    git: null,
    sessions: null,
    skillSetup: null,
    ...overrides,
  };
}

describe("nextSteps rules", () => {
  it("no setup config: recommends /setup-matt-pocock-skills for the repo", () => {
    expect(nextSteps(snapshot([], [], { setupConfigPresent: false }))).toEqual([
      {
        ruleId: "no-setup-config",
        command: "/setup-matt-pocock-skills",
        target: { kind: "repo" },
        reason: "The repo has no skill setup config, so the skills do not know its issue tracker or triage labels.",
        evidence: [{ artifact: "docs/agents/issue-tracker.md", field: "presence", value: "missing" }],
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
          { artifact: ".scratch/shop/map.md", field: "Not yet specified", value: "empty" },
          { artifact: ".scratch/shop/issues", field: "open tickets", value: "0" },
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
          { artifact: ".scratch/shop/map.md", field: "Not yet specified", value: "2 items" },
          { artifact: ".scratch/shop/issues", field: "open tickets", value: "0" },
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
          { artifact: ".scratch/shop/issues", field: "implementation tickets", value: "0" },
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
        reason: "Ticket shop/02 is claimed, possibly stale: no live Dryland session holds it.",
        evidence: [
          { artifact: "shop/02", field: "Status", value: "claimed" },
          { artifact: "sessions", field: "live sessions on shop/02", value: "0" },
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
          { artifact: ".scratch/shop/issues", field: "ready-for-agent tickets", value: "20" },
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
          worktrees: [{ map: "done", id: "01", exists: true, aheadOfDefault: true, merged: false, prExists: false }],
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

  it("a rule the compatibility verdict calls broken produces no steps, and an override re-enables it", () => {
    const base = snapshot([effort("shop", { fog: ["x"] })], [ticket("shop", "01", ["Type: research"])]);
    const broken = { setup: "modified" as const, verdict: { "map-frontier": "broken" as const }, overrides: [] };

    expect(nextSteps({ ...base, skillSetup: broken })).toEqual([]);
    expect(nextSteps({ ...base, skillSetup: { ...broken, overrides: ["map-frontier"] } }).map((s) => s.ruleId)).toEqual(
      ["map-frontier"],
    );
    expect(
      nextSteps({ ...base, skillSetup: { ...broken, verdict: { "map-frontier": "degraded" } } }).map((s) => s.ruleId),
    ).toEqual(["map-frontier"]);
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
        { setupConfigPresent: false },
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

describe("nextSteps on this repo's real .scratch state", () => {
  it("yields /to-tickets for the spec once the wayfinding tickets are resolved", async () => {
    // The state the repo was in when its spec was written: the 19 wayfinding tickets, a spec, no slices yet.
    const fixtures = join(import.meta.dirname, "../../cli/test/fixtures/real-scratch/mattpocock-ade");
    const root = mkdtempSync(join(tmpdir(), "dryland-next-step-"));
    const write = (file: string, content: string) => {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), content);
    };
    write("docs/agents/issue-tracker.md", "# Issue tracker: Local Markdown\n");
    write(".scratch/mattpocock-ade/map.md", readFileSync(join(fixtures, "map.md"), "utf8"));
    write(".scratch/mattpocock-ade/spec.md", "# Spec\n");
    for (const name of readdirSync(join(fixtures, "issues"))) {
      if (Number(name.slice(0, 2)) <= 19) {
        write(`.scratch/mattpocock-ade/issues/${name}`, readFileSync(join(fixtures, "issues", name), "utf8"));
      }
    }

    const steps = nextSteps(await readRepoSnapshot(nodeProcessRunner, root, await readLocalMarkdownTickets(root)));

    expect(steps.map((s) => [s.ruleId, s.command, s.target])).toEqual([
      ["spec-without-tickets", "/to-tickets", { kind: "spec", map: "mattpocock-ade" }],
    ]);
  });
});

describe("readRepoSnapshot git state", () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });

  function repoWithResolvedTicket(): string {
    const root = mkdtempSync(join(tmpdir(), "dryland-snapshot-git-"));
    git(root, "init", "-q", "-b", "main");
    mkdirSync(join(root, "docs/agents"), { recursive: true });
    mkdirSync(join(root, ".scratch/m/issues"), { recursive: true });
    writeFileSync(join(root, "docs/agents/issue-tracker.md"), "# Issue tracker: Local Markdown\n");
    writeFileSync(join(root, ".scratch/m/map.md"), "# Map: m\n");
    writeFileSync(join(root, ".scratch/m/issues/01-a.md"), "# A\n\nType: task\nStatus: resolved\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "init");
    return root;
  }

  const read = async (root: string) => readRepoSnapshot(nodeProcessRunner, root, await readLocalMarkdownTickets(root));

  it("yields review-before-pr and open-pr for a Linked worktree ahead of main", async () => {
    const root = repoWithResolvedTicket();
    const tree = join(mkdtempSync(join(tmpdir(), "dryland-wt-")), "wt");
    git(root, "worktree", "add", "-q", "-b", "m/01-a", tree);
    writeFileSync(join(tree, "work.txt"), "x");
    git(tree, "add", "-A");
    git(tree, "commit", "-q", "-m", "work");

    const snapshot = await read(root);

    expect(snapshot.git?.worktrees).toEqual([
      { map: "m", id: "01", exists: true, aheadOfDefault: true, merged: false, prExists: null },
    ]);
    expect(nextSteps(snapshot).map((s) => s.ruleId)).toEqual(["map-cleared", "review-before-pr", "open-pr"]);
  });

  it("calls a branch merged once its work is in the default branch", async () => {
    const root = repoWithResolvedTicket();
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
    const root = repoWithResolvedTicket();
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
    const root = repoWithResolvedTicket();
    const tree = join(mkdtempSync(join(tmpdir(), "dryland-wt-")), "wt");
    git(root, "worktree", "add", "-q", "-b", "m/01-a", tree);
    writeFileSync(join(root, "later.txt"), "y");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "later");

    const snapshot = await read(root);

    expect(snapshot.git?.worktrees[0]).toMatchObject({ aheadOfDefault: false, merged: false });
  });

  it("leaves git unknown outside a git repo, and sessions and skill setup unknown", async () => {
    const root = mkdtempSync(join(tmpdir(), "dryland-snapshot-nogit-"));

    const snapshot = await read(root);

    expect(snapshot.git).toBeNull();
    expect(snapshot.sessions).toBeNull();
    expect(snapshot.skillSetup).toBeNull();
  });
});
