import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type EffortSnapshot,
  nextSteps,
  parseMap,
  parseTicketFile,
  readLocalMarkdownTickets,
  readRepoSnapshot,
  type RepoSnapshot,
  type Ticket,
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

    expect(steps).toEqual([]);
  });

  it("leaves implementation tickets to /implement rules, not /wayfinder", () => {
    const steps = nextSteps(
      snapshot([effort("a", { spec: true })], [ticket("a", "20", ["Type: task", "Status: ready-for-agent"])]),
    );

    expect(steps.map((s) => s.ruleId)).toEqual([]);
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

    const steps = nextSteps(await readRepoSnapshot(root, await readLocalMarkdownTickets(root)));

    expect(steps.map((s) => [s.ruleId, s.command, s.target])).toEqual([
      ["spec-without-tickets", "/to-tickets", { kind: "spec", map: "mattpocock-ade" }],
    ]);
  });
});
