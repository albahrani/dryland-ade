import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  blockTicket,
  claimTicket,
  commentOnTicket,
  createTicket,
  indexMap,
  nodeProcessRunner,
  type ProcessResult,
  type ProcessRunner,
  releaseTicket,
  resolveTicket,
  triageTicket,
} from "../src/index.ts";

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "dryland-github-write-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n",
    "docs/agents/triage-labels.md": "| Role | Label |\n| `needs-triage` | `triage` |\n",
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

const ok = (stdout = ""): ProcessResult => ({ stdout, stderr: "", exitCode: 0 });
const pages = (...items: unknown[]) => JSON.stringify([items]);
const issue = (number: number, fields: Record<string, unknown> = {}) => ({
  number,
  id: number * 1000,
  title: `Issue ${number}`,
  body: "",
  state: "open",
  labels: [],
  assignees: [],
  ...fields,
});

const MAP_BODY = "# Map: Shop\n\n## Not yet specified\n\n- Checkout\n\n## Decisions so far\n\n- Use Stripe\n";

interface World {
  issues: Record<number, ReturnType<typeof issue>>;
  user?: string;
  /** Exact `gh` command lines that fail. */
  failing?: string[];
  /** Replaces the assignees a claim's POST reports back, to simulate losing a race. */
  claimReturns?: unknown;
}

const API = "repos/{owner}/{repo}";

/** A fake `gh` over a few issues: reads answer from `issues`, every call is recorded in order. */
function fakeGh(world: World, calls: string[]): ProcessRunner {
  return {
    async run(command, args, options) {
      if (command === "git") return nodeProcessRunner.run(command, args, options);
      const line = args.join(" ");
      calls.push(line);
      if (world.failing?.includes(line)) return { stdout: "", stderr: "HTTP 500", exitCode: 1 };
      if (line === "--version" || line === "auth status") return ok("gh");
      if (line === "api user --jq .login") return ok(`${world.user ?? "me"}\n`);
      if (line.startsWith("issue list"))
        return ok(
          JSON.stringify(
            Object.values(world.issues).filter((i) => i.labels.some((l: { name: string }) => l.name === "map")),
          ),
        );
      const sub =
        /^api --paginate --slurp repos\/\{owner\}\/\{repo\}\/issues\/(\d+)\/(sub_issues|dependencies\/blocked_by|comments)$/.exec(
          line,
        );
      if (sub !== null) {
        if (sub[2] === "sub_issues")
          return ok(
            pages(
              ...Object.values(world.issues).filter((i) => !i.labels.some((l: { name: string }) => l.name === "map")),
            ),
          );
        return ok(pages());
      }
      const one = /^api repos\/\{owner\}\/\{repo\}\/issues\/(\d+)$/.exec(line);
      if (one !== null) return ok(JSON.stringify(world.issues[Number(one[1])]));
      if (line.includes("/assignees") && !line.includes("DELETE") && world.claimReturns !== undefined) {
        return ok(JSON.stringify(world.claimReturns));
      }
      if (line.startsWith(`api ${API}/issues title=`) || line.startsWith(`api ${API}/issues -f title=`)) {
        return ok(JSON.stringify(issue(9)));
      }
      return ok(JSON.stringify(issue(0)));
    },
  };
}

const MAP = issue(1, { title: "Shop", body: MAP_BODY, labels: [{ name: "map" }] });
const baseWorld = (): World => ({
  issues: {
    1: MAP,
    2: issue(2, { labels: [{ name: "type:task" }] }),
    3: issue(3, { labels: [{ name: "type:task" }, { name: "triage" }] }),
    4: issue(4, { assignees: [{ login: "ada" }] }),
    5: issue(5, { state: "closed" }),
  },
});

const writes = (calls: string[]) =>
  calls.filter((call) => /(-X |-f |-F )/.test(call) && !call.startsWith("api --paginate"));

describe("GitHub backend writes", () => {
  it("claims an unassigned issue by assigning the gh user", async () => {
    const calls: string[] = [];
    const cwd = repo();

    const result = await claimTicket(fakeGh(baseWorld(), calls), cwd, "1/2", { holder: "branch" });

    expect(result).toMatchObject({ alreadyHeld: false, ticket: { id: "2", state: "claimed", claimant: "me" } });
    expect(writes(calls)).toEqual([`api ${API}/issues/2/assignees -f assignees[]=me`]);
  });

  it("claiming an issue its user already holds changes nothing", async () => {
    const calls: string[] = [];
    const world = { ...baseWorld(), user: "ada" };

    const result = await claimTicket(fakeGh(world, calls), repo(), "1/4", { holder: "branch" });

    expect(result.alreadyHeld).toBe(true);
    expect(writes(calls)).toEqual([]);
  });

  it("fails to claim an issue held by someone else, naming the holder", async () => {
    const calls: string[] = [];
    const error = await claimTicket(fakeGh(baseWorld(), calls), repo(), "1/4", { holder: "branch" }).catch(
      (e: unknown) => e,
    );

    expect(error).toMatchObject({ name: "DrylandError", message: expect.stringContaining("claimed by ada") });
    expect(writes(calls)).toEqual([]);
  });

  it("backs out when another user's claim landed first", async () => {
    const calls: string[] = [];
    const world = { ...baseWorld(), claimReturns: issue(2, { assignees: [{ login: "ada" }, { login: "me" }] }) };

    const error = await claimTicket(fakeGh(world, calls), repo(), "1/2", { holder: "branch" }).catch((e: unknown) => e);

    expect(error).toMatchObject({ message: expect.stringContaining("claimed by ada at the same moment") });
    expect(writes(calls)).toContain(`api -X DELETE ${API}/issues/2/assignees -f assignees[]=me`);
  });

  it("releases by clearing the assignees", async () => {
    const calls: string[] = [];

    const { ticket } = await releaseTicket(fakeGh(baseWorld(), calls), repo(), "1/4");

    expect(ticket).toMatchObject({ state: "open", claimant: null });
    expect(writes(calls)).toEqual([`api -X DELETE ${API}/issues/4/assignees -f assignees[]=ada`]);
  });

  it("resolves by writing the answer into the body and closing in one call", async () => {
    const calls: string[] = [];
    const world = baseWorld();
    world.issues[2] = issue(2, { body: "Do it.", labels: [{ name: "type:task" }] });

    const { ticket } = await resolveTicket(fakeGh(world, calls), repo(), "1/2", "Built it.");

    expect(ticket).toMatchObject({ state: "resolved", answer: "Built it." });
    expect(writes(calls)).toEqual([
      `api -X PATCH ${API}/issues/2 -f body=Do it.\n\n## Answer\n\nBuilt it.\n -f state=closed`,
    ]);
  });

  it("refuses to resolve a closed issue", async () => {
    await expect(resolveTicket(fakeGh(baseWorld(), []), repo(), "1/5", "x")).rejects.toThrow(/already resolved/);
  });

  it("blocks and unblocks through native dependencies, using issue ids", async () => {
    const calls: string[] = [];
    const world = baseWorld();

    await blockTicket(fakeGh(world, calls), repo(), "1/3", { add: ["2"] });

    expect(writes(calls)).toEqual([`api ${API}/issues/3/dependencies/blocked_by -F issue_id=2000`]);
  });

  it("unblocks by deleting the dependency", async () => {
    const calls: string[] = [];
    const base = fakeGh(baseWorld(), []);
    const runner: ProcessRunner = {
      async run(command, args, options) {
        if (args.join(" ") === `api --paginate --slurp ${API}/issues/3/dependencies/blocked_by`) {
          return ok(pages(issue(2)));
        }
        calls.push(args.join(" "));
        return base.run(command, args, options);
      },
    };

    await blockTicket(runner, repo(), "1/3", { remove: ["2"] });

    expect(writes(calls)).toEqual([`api -X DELETE ${API}/issues/3/dependencies/blocked_by/2000`]);
  });

  it("comments as an issue comment", async () => {
    const calls: string[] = [];

    const { ticket } = await commentOnTicket(fakeGh(baseWorld(), calls), repo(), "1/2", "Hello");

    expect(ticket.comments).toEqual(["Hello"]);
    expect(writes(calls)).toEqual([`api ${API}/issues/2/comments -f body=Hello`]);
  });

  it("triages by adding the role's label and removing the other role labels", async () => {
    const calls: string[] = [];

    const { ticket } = await triageTicket(fakeGh(baseWorld(), calls), repo(), "1/3", "needs-info");

    expect(ticket.triageRole).toBe("needs-info");
    expect(writes(calls)).toEqual([
      `api ${API}/issues/3/labels -f labels[]=needs-info`,
      `api -X DELETE ${API}/issues/3/labels/triage`,
    ]);
  });

  it("creates an issue under a map as a sub-issue, blocked as asked, labelled by type", async () => {
    const calls: string[] = [];
    const world = baseWorld();

    const { ticket } = await createTicket(fakeGh(world, calls), repo(), {
      map: "1",
      title: "New thing",
      type: "task",
      question: "Why?",
      blockedBy: ["2"],
    });

    expect(ticket).toMatchObject({ id: "9", map: "1", type: "task", state: "open", blockers: ["2"] });
    expect(writes(calls)).toEqual([
      `api ${API}/issues -f title=New thing -f body=## Question\n\nWhy? -f labels[]=type:task`,
      `api ${API}/issues/1/sub_issues -F sub_issue_id=9000`,
      `api ${API}/issues/9/dependencies/blocked_by -F issue_id=2000`,
    ]);
  });

  it("refuses to create under an issue that is not a map", async () => {
    await expect(createTicket(fakeGh(baseWorld(), []), repo(), { map: "2", title: "x", type: "task" })).rejects.toThrow(
      /not a map/,
    );
  });

  it("indexes by changing only Decisions-so-far in the map body", async () => {
    const calls: string[] = [];

    const { value } = await indexMap(fakeGh(baseWorld(), calls), repo(), "1", {
      title: "Cart",
      link: "issues/3",
      gist: "Use sessions",
    });

    const expected = MAP_BODY.replace("- Use Stripe\n", "- Use Stripe\n- [Cart](issues/3): Use sessions\n");
    expect(writes(calls)).toEqual([`api -X PATCH ${API}/issues/1 -f body=${expected}`]);
    expect(value.decisions).toEqual(["Use Stripe", "[Cart](issues/3): Use sessions"]);
  });

  it("keeps a CRLF map body's line endings when indexing", async () => {
    const calls: string[] = [];
    const world = baseWorld();
    const crlf = MAP_BODY.replace(/\n/g, "\r\n");
    world.issues[1] = issue(1, { title: "Shop", body: crlf, labels: [{ name: "map" }] });

    await indexMap(fakeGh(world, calls), repo(), "1", { title: "Cart", link: "issues/3", gist: "Use sessions" });

    const expected = crlf.replace("- Use Stripe\r\n", "- Use Stripe\r\n- [Cart](issues/3): Use sessions\r\n");
    expect(writes(calls)).toEqual([`api -X PATCH ${API}/issues/1 -f body=${expected}`]);
  });

  it("reports a failed gh call with the next action and claims no success", async () => {
    const calls: string[] = [];
    const world = { ...baseWorld(), failing: [`api ${API}/issues/2/comments -f body=Hello`] };

    const error = await commentOnTicket(fakeGh(world, calls), repo(), "1/2", "Hello").catch((e: unknown) => e);

    expect(error).toMatchObject({
      name: "DrylandError",
      message: expect.stringContaining("HTTP 500"),
      nextAction: expect.any(String),
    });
  });

  it("says which issue exists when a step after creating it fails", async () => {
    const world = { ...baseWorld(), failing: [`api ${API}/issues/1/sub_issues -F sub_issue_id=9000`] };

    const error = await createTicket(fakeGh(world, []), repo(), { map: "1", title: "T", type: "task" }).catch(
      (e: unknown) => e,
    );

    expect(error).toMatchObject({
      message: expect.stringContaining("Issue #9 was created, but making it a sub-issue"),
    });
  });

  it("makes no local commit", async () => {
    const cwd = repo();
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-m", "init", "--quiet"],
      { cwd },
    );

    await commentOnTicket(fakeGh(baseWorld(), []), cwd, "1/2", "Hello");
    await claimTicket(fakeGh(baseWorld(), []), cwd, "1/2", { holder: "b" });

    expect(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd, encoding: "utf8" }).trim()).toBe("1");
    expect(execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).replace(/\r/g, "")).toMatch(
      /^\?\? docs\/\s*$/,
    );
  });
});
