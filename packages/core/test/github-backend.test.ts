import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  claimTicket,
  DrylandError,
  listTickets,
  mapFrontier,
  nextSteps,
  nodeProcessRunner,
  parseTicketFile,
  type ProcessResult,
  type ProcessRunner,
  readTickets,
  showMap,
  showTicket,
  specsWithoutTickets,
  type Ticket,
} from "../src/index.ts";

function repo(tracker = "GitHub"): string {
  const root = mkdtempSync(join(tmpdir(), "dryland-github-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": `# Issue tracker: ${tracker}\n`,
    "docs/agents/triage-labels.md": "| Role | Label |\n| `needs-triage` | `triage` |\n",
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

const issue = (number: number, fields: Record<string, unknown> = {}) => ({
  number,
  title: `Issue ${number}`,
  body: "",
  state: "open",
  labels: [],
  assignees: [],
  ...fields,
});

const MAP_ISSUE = issue(1, {
  title: "Shop",
  body: "# Map: Shop\n\n## Not yet specified\n\n- Checkout\n\n## Decisions so far\n\n- Use Stripe\n",
  labels: [{ name: "map" }],
});

/** What `gh api --paginate --slurp` prints: one array holding each page. */
const pages = (...items: unknown[]) => JSON.stringify([items]);

/** Recorded `gh` output for one map (#1) with five sub-issues, keyed by the command line. */
const RECORDED: Record<string, ProcessResult> = {
  "issue list --label map --state all --limit 1000 --json number,title,body,state,labels,assignees": ok(
    JSON.stringify([{ ...MAP_ISSUE, state: "OPEN", labels: [{ name: "map" }] }]),
  ),
  "api --paginate --slurp repos/{owner}/{repo}/issues/1/sub_issues": ok(
    pages(
      issue(2, { title: "Schema", labels: [{ name: "type:task" }] }),
      issue(3, { title: "Cart", labels: [{ name: "type:task" }, { name: "triage" }] }),
      issue(4, { title: "Pay", labels: [{ name: "type:research" }], assignees: [{ login: "ada" }] }),
      issue(5, { title: "Spike", state: "closed", body: "Try it.\n\n## Answer\n\nIt works." }),
      issue(6, { title: "Mystery" }),
    ),
  ),
  "api --paginate --slurp repos/{owner}/{repo}/issues/2/dependencies/blocked_by": ok(pages()),
  "api --paginate --slurp repos/{owner}/{repo}/issues/3/dependencies/blocked_by": ok(pages(issue(2))),
  "api --paginate --slurp repos/{owner}/{repo}/issues/4/dependencies/blocked_by": ok(
    pages(issue(5, { state: "closed" })),
  ),
  "api --paginate --slurp repos/{owner}/{repo}/issues/5/dependencies/blocked_by": ok(pages()),
  "api --paginate --slurp repos/{owner}/{repo}/issues/6/dependencies/blocked_by": {
    stdout: "",
    stderr: "gh: Not Found (HTTP 404)",
    exitCode: 1,
  },
  "api --paginate --slurp repos/{owner}/{repo}/issues/3/comments": ok(pages({ body: "Waiting on schema." })),
};

function ok(stdout: string): ProcessResult {
  return { stdout, stderr: "", exitCode: 0 };
}

/** Real git, recorded `gh`: any `gh` call not recorded returns an empty page. */
function ghRunner(recorded: Record<string, ProcessResult> = RECORDED, calls: string[] = []): ProcessRunner {
  return {
    async run(command, args, options) {
      if (command === "git") return nodeProcessRunner.run(command, args, options);
      calls.push([command, ...args].join(" "));
      const key = args.join(" ");
      return (
        recorded[key] ?? (key.startsWith("api ") ? ok(pages()) : { stdout: "", stderr: "unrecorded", exitCode: 1 })
      );
    },
  };
}

describe("GitHub backend read", () => {
  it("lists normalized tickets with state, claimant, blockers, parent map and triage role", async () => {
    const tickets = await listTickets(ghRunner(), repo());

    expect(tickets.map((t) => [t.map, t.id, t.title, t.type, t.state, t.claimant, t.blockers, t.triageRole])).toEqual([
      ["1", "2", "Schema", "task", "open", null, [], null],
      ["1", "3", "Cart", "task", "open", null, ["2"], "needs-triage"],
      ["1", "4", "Pay", "research", "claimed", "ada", ["5"], null],
      ["1", "5", "Spike", "none", "resolved", null, [], null],
      ["1", "6", "Mystery", "none", "open", null, "unknown", null],
    ]);
  });

  it("reports an assigned issue as claimed by the assignee", async () => {
    const ticket = await showTicket(ghRunner(), repo(), "1/4");

    expect(ticket).toMatchObject({ state: "claimed", claimant: "ada" });
    expect(ticket.raw).toMatchObject({ assignees: "ada" });
  });

  it("reports blockers as unknown, not empty, when dependencies cannot be read", async () => {
    expect((await showTicket(ghRunner(), repo(), "1/6")).blockers).toBe("unknown");
  });

  it("shows the answer separately from the body, and the comments", async () => {
    const runner = ghRunner();
    const spike = await showTicket(runner, repo(), "5");
    const cart = await showTicket(runner, repo(), "3");

    expect(spike).toMatchObject({ body: "Try it.", answer: "It works." });
    expect(cart.comments).toEqual(["Waiting on schema."]);
  });

  it("shows a map from its issue body, with its tickets", async () => {
    const map = await showMap(ghRunner(), repo(), "1");

    expect(map).toMatchObject({ name: "1", title: "Shop", fog: ["Checkout"], decisions: ["Use Stripe"] });
    expect(map.tickets.map((t) => t.id)).toEqual(["2", "3", "4", "5", "6"]);
  });

  it("returns only open, unblocked, unclaimed tickets on the frontier; unknown blockers keep a ticket off it", async () => {
    const frontier = await mapFrontier(ghRunner(), repo(), "1");

    expect(frontier.map((t) => t.id)).toEqual(["2"]);
  });

  it("fails for a map that is not an issue labelled map", async () => {
    await expect(showMap(ghRunner(), repo(), "99")).rejects.toThrow(/no map "99"/);
  });

  it("finds no specs without tickets for a remote tracker", async () => {
    expect(await specsWithoutTickets(ghRunner(), repo())).toEqual([]);
  });

  it("gives the rule engine the same steps as the same tickets from local markdown", async () => {
    const fields: Record<string, string[]> = {
      "2": ["Type: task", "Status: resolved"],
      "3": ["Type: task", "Blocked by: 2"],
    };
    const local = ["2", "3"].map((id) =>
      parseTicketFile("1", id, [`# Ticket ${id}`, "", ...(fields[id] ?? []), ""].join("\n")),
    );
    const recorded: Record<string, ProcessResult> = {
      ...RECORDED,
      "api --paginate --slurp repos/{owner}/{repo}/issues/1/sub_issues": ok(
        pages(
          issue(2, { title: "Ticket 2", state: "closed", labels: [{ name: "type:task" }] }),
          issue(3, { title: "Ticket 3", labels: [{ name: "type:task" }] }),
        ),
      ),
    };
    const remote = await listTickets(ghRunner(recorded), repo());
    const snapshot = (tickets: Ticket[]) => ({
      setupConfigPresent: true,
      efforts: [{ name: "1", map: null, hasSpec: false }],
      tickets,
      hasGlossary: true,
      adrCount: 0,
      git: null,
      sessions: null,
      skillSetup: null,
    });

    expect(nextSteps(snapshot(remote))).toEqual(nextSteps(snapshot(local)));
  });
});

describe("GitHub backend failures", () => {
  const failing = (version: ProcessResult, auth: ProcessResult): ProcessRunner =>
    ghRunner({
      "issue list --label map --state all --limit 1000 --json number,title,body,state,labels,assignees": {
        stdout: "",
        stderr: "boom",
        exitCode: 1,
      },
      "--version": version,
      "auth status": auth,
    });

  it("tells the user to install gh when it is missing", async () => {
    const error = await listTickets(failing({ stdout: "", stderr: "not found", exitCode: 127 }, ok("")), repo()).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(DrylandError);
    expect(error).toMatchObject({
      message: expect.stringContaining("not installed"),
      nextAction: expect.stringContaining("https://cli.github.com"),
    });
  });

  it("tells the user to log in when gh is logged out", async () => {
    const error = await listTickets(
      failing(ok("gh 2.0"), { stdout: "", stderr: "not logged in", exitCode: 1 }),
      repo(),
    ).catch((e: unknown) => e);

    expect(error).toMatchObject({
      message: expect.stringContaining("not logged in"),
      nextAction: "Run `gh auth login`.",
    });
  });

  it("reports gh's own message when gh works but the call fails", async () => {
    const error = await listTickets(failing(ok("gh 2.0"), ok("")), repo()).catch((e: unknown) => e);

    expect(error).toMatchObject({ message: expect.stringContaining("boom") });
  });

  it("never asks for or passes a token", async () => {
    const calls: string[] = [];
    await listTickets(ghRunner(RECORDED, calls), repo());

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.join("\n")).not.toMatch(/token|auth login|GH_TOKEN|GITHUB_TOKEN/i);
  });

  it("refuses a write on the GitHub tracker, saying writes are not supported yet", async () => {
    const calls: string[] = [];
    const error = await claimTicket(ghRunner(RECORDED, calls), repo(), "1/2", {
      holder: "me",
      autoCommit: false,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DrylandError);
    expect(error).toMatchObject({ message: expect.stringContaining("not supported on the github tracker") });
    expect(calls).toEqual([]);
  });

  it("still refuses GitLab, and reads local markdown without gh", async () => {
    await expect(readTickets(repo("GitLab"), ghRunner())).rejects.toThrow(/not supported/);
    expect(await readTickets(repo("Local Markdown"), ghRunner({}))).toEqual([]);
  });
});
