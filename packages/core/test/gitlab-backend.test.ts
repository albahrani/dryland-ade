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
  DrylandError,
  indexMap,
  listTickets,
  nodeProcessRunner,
  type ProcessResult,
  type ProcessRunner,
  releaseTicket,
  resolveTicket,
  showTicket,
  triageTicket,
} from "../src/index.ts";

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "dryland-gitlab-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: GitLab\n",
    "docs/agents/triage-labels.md": "| Role | Label |\n| `needs-triage` | `triage` |\n",
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

interface Issue {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: string;
  labels: string[];
  assignees: { id: number; username: string }[];
}

const issue = (iid: number, fields: Partial<Issue> = {}): Issue => ({
  id: iid * 1000,
  iid,
  title: `Issue ${iid}`,
  description: "",
  state: "opened",
  labels: ["map:1"],
  assignees: [],
  ...fields,
});

const MAP_BODY = "# Map: Shop\n\n## Not yet specified\n\n- Checkout\n\n## Decisions so far\n\n- Use Stripe\n";

interface World {
  issues: Issue[];
  premium?: boolean;
  /** Premium links by issue: the issues it `is_blocked_by`. */
  links?: Record<number, number[]>;
  user?: { id: number; username: string };
  notes?: Record<number, { body: string; system?: boolean }[]>;
  missing?: boolean;
  loggedOut?: boolean;
  /** Calls that fail with an HTTP 500, as `glab api` argument lines. */
  failing?: string[];
}

const json = (value: unknown): ProcessResult => ({ stdout: JSON.stringify(value), stderr: "", exitCode: 0 });
const fail = (stderr: string): ProcessResult => ({ stdout: "", stderr, exitCode: 1 });

/** Reads the `-f name=value` pairs of a `glab api` call; `name[]` collects values. */
function fieldsOf(args: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-f") {
      const [name = "", ...value] = (args[i + 1] ?? "").split("=");
      fields[name] = value.join("=");
    }
  }
  return fields;
}

/** A fake `glab` over a few issues; reads answer from the world, writes change it, every call is recorded. */
function fakeGlab(world: World, calls: string[] = []): ProcessRunner {
  const nextLink = { id: 500 };
  return {
    async run(command, args, options) {
      if (command === "git") return nodeProcessRunner.run(command, args, options);
      const line = args.join(" ");
      calls.push(line);
      if (world.missing) return fail("glab: command not found");
      if (line === "--version") return { stdout: "glab 1.50", stderr: "", exitCode: 0 };
      if (line === "auth status") return world.loggedOut ? fail("not logged in") : { stdout: "ok", stderr: "", exitCode: 0 };
      if (world.loggedOut) return fail("401 Unauthorized");
      if (world.failing?.includes(line)) return fail("HTTP 500");

      const method = args[1] === "-X" ? args[2] : "GET";
      const path = (method === "GET" ? args[1] : args[3]) ?? "";
      const fields = fieldsOf(args);
      const found = (iid: number) => world.issues.find((i) => i.iid === iid);

      if (path === "projects/:id") return json({ id: 7, namespace: { id: 3 } });
      if (path === "namespaces/3") return json({ plan: world.premium ? "premium" : "free" });
      if (path === "user") return json(world.user ?? { id: 42, username: "me" });
      if (path.startsWith("projects/:id/issues?")) {
        return json(path.includes("page=1") ? world.issues : []);
      }
      if (path === "projects/:id/issues" && method === "POST") {
        const created = issue(Math.max(...world.issues.map((i) => i.iid)) + 1, {
          title: fields.title ?? "",
          description: fields.description ?? "",
          labels: (fields.labels ?? "").split(","),
        });
        world.issues.push(created);
        return json(created);
      }
      const match = /^projects\/:id\/issues\/(\d+)(?:\/(links|notes)(?:\/(\d+))?)?(\?.*)?$/.exec(path);
      if (match === null) return fail(`unrecorded: ${line}`);
      const target = found(Number(match[1]));
      if (target === undefined) return fail("404 Not Found");

      if (match[2] === "notes") {
        if (method === "POST") return json({});
        return json(world.notes?.[target.iid] ?? []);
      }
      if (match[2] === "links") {
        const blockers = world.links?.[target.iid] ?? [];
        if (method === "POST") {
          world.links ??= {};
          (world.links[target.iid] ??= []).push(Number(fields.target_issue_iid));
          return json({});
        }
        if (method === "DELETE") {
          const iid = blockers[Number(match[3]) - 500];
          world.links = { ...world.links, [target.iid]: blockers.filter((b) => b !== iid) };
          return json({});
        }
        return json(
          blockers.map((iid, index) => ({
            iid,
            project_id: 7,
            link_type: "is_blocked_by",
            issue_link_id: nextLink.id + index,
          })),
        );
      }
      if (method === "PUT") {
        if (fields.description !== undefined) target.description = fields.description;
        if (fields.state_event === "close") target.state = "closed";
        if ("assignee_ids[]" in fields) {
          target.assignees = fields["assignee_ids[]"] === "0" ? [] : [{ id: 42, username: "me" }];
        }
        if (fields.add_labels !== undefined) target.labels.push(fields.add_labels);
        if (fields.remove_labels !== undefined) {
          target.labels = target.labels.filter((l) => !fields.remove_labels?.split(",").includes(l));
        }
      }
      return json(target);
    },
  };
}

const writes = (calls: string[]) => calls.filter((c) => /-X (POST|PUT|DELETE)/.test(c));

function shop(extra: Issue[] = []): World {
  return {
    issues: [
      issue(1, { title: "Shop", description: MAP_BODY, labels: ["map"] }),
      issue(2, { title: "Schema", labels: ["map:1", "type:task"], description: "Blocked by: none\n\n## Question\n\nShape it." }),
      issue(3, { title: "Cart", labels: ["map:1", "type:task", "triage"], description: "Blocked by: 2" }),
      issue(4, { title: "Pay", labels: ["map:1", "type:research"], assignees: [{ id: 9, username: "ada" }] }),
      issue(5, { title: "Spike", state: "closed", description: "Try it.\n\n## Answer\n\nIt works." }),
      ...extra,
    ],
    notes: { 3: [{ body: "Waiting on schema." }, { body: "assigned to ada", system: true }] },
  };
}

describe("GitLab backend read", () => {
  it("lists normalized tickets with state, claimant, blockers, map and triage role", async () => {
    const tickets = await listTickets(fakeGlab(shop()), repo());

    expect(tickets.map((t) => [t.map, t.id, t.title, t.type, t.state, t.claimant, t.blockers, t.triageRole])).toEqual([
      ["1", "2", "Schema", "task", "open", null, [], null],
      ["1", "3", "Cart", "task", "open", null, ["2"], "needs-triage"],
      ["1", "4", "Pay", "research", "claimed", "ada", "unknown", null],
      ["1", "5", "Spike", "none", "resolved", null, "unknown", null],
    ]);
  });

  it("keeps the answer, the question and user comments, and drops the Blocked by line and system notes", async () => {
    const world = shop();
    const cart = await showTicket(fakeGlab(world), repo(), "1/3");
    const schema = await showTicket(fakeGlab(world), repo(), "1/2");
    const spike = await showTicket(fakeGlab(world), repo(), "1/5");

    expect(cart.comments).toEqual(["Waiting on schema."]);
    expect(cart.body).toBe("");
    expect(schema.body).toBe("## Question\n\nShape it.");
    expect(spike).toMatchObject({ answer: "It works.", body: "Try it." });
  });

  it("reads blockers from native links on a Premium namespace", async () => {
    const world = shop();
    world.premium = true;
    world.links = { 3: [2], 4: [5] };

    const tickets = await listTickets(fakeGlab(world), repo());

    expect(tickets.map((t) => [t.id, t.blockers])).toEqual([
      ["2", []],
      ["3", ["2"]],
      ["4", ["5"]],
      ["5", []],
    ]);
  });

  it("reports blockers as unknown when a non-Premium body has no Blocked by line", async () => {
    const [, , , pay] = await listTickets(fakeGlab(shop()), repo());

    expect(pay?.blockers).toBe("unknown");
  });

  it("reads a Blocked by line on a non-Premium namespace", async () => {
    const world = shop([issue(6, { description: "Blocked by: 2, 03" })]);

    expect((await showTicket(fakeGlab(world), repo(), "1/6")).blockers).toEqual(["2", "3"]);
  });

  it("states the next action when glab is missing", async () => {
    const error = await listTickets(fakeGlab({ ...shop(), missing: true }), repo()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DrylandError);
    expect((error as DrylandError).message).toContain("`glab`");
    expect((error as DrylandError).message).toContain("not installed");
    expect((error as DrylandError).nextAction).toContain("https://gitlab.com/gitlab-org/cli");
  });

  it("states the next action when glab is logged out", async () => {
    const error = await listTickets(fakeGlab({ ...shop(), loggedOut: true }), repo()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DrylandError);
    expect((error as DrylandError).message).toContain("not logged in");
    expect((error as DrylandError).nextAction).toBe("Run `glab auth login`.");
  });
});

describe("GitLab backend write", () => {
  it("claims by assigning the user's own id and reports the same result as on other trackers", async () => {
    const world = shop();
    const calls: string[] = [];

    const result = await claimTicket(fakeGlab(world, calls), repo(), "1/2", { holder: "branch-x" });

    expect(result).toMatchObject({ alreadyHeld: false, ticket: { state: "claimed", claimant: "me" } });
    expect(writes(calls)).toEqual(["api -X PUT projects/:id/issues/2 -f assignee_ids[]=42"]);
    expect(world.issues[1]?.assignees).toEqual([{ id: 42, username: "me" }]);
  });

  it("refuses to claim an issue another user holds, naming the holder", async () => {
    const calls: string[] = [];
    const error = await claimTicket(fakeGlab(shop(), calls), repo(), "1/4", { holder: "b" }).catch((e: unknown) => e);

    expect((error as DrylandError).message).toContain("already claimed by ada");
    expect(writes(calls)).toEqual([]);
  });

  it("releases the user's own claim and refuses another user's", async () => {
    const world = shop([issue(6, { assignees: [{ id: 42, username: "me" }] })]);
    const calls: string[] = [];

    await releaseTicket(fakeGlab(world, calls), repo(), "1/6");
    const error = await releaseTicket(fakeGlab(world, calls), repo(), "1/4").catch((e: unknown) => e);

    expect(writes(calls)).toEqual(["api -X PUT projects/:id/issues/6 -f assignee_ids[]=0"]);
    expect((error as DrylandError).message).toContain("claimed by ada");
  });

  it("resolves by writing the answer into the body and closing the issue in one call", async () => {
    const world = shop();
    const calls: string[] = [];

    const { ticket } = await resolveTicket(fakeGlab(world, calls), repo(), "1/2", "Done.");

    expect(ticket).toMatchObject({ state: "resolved", answer: "Done." });
    expect(writes(calls)).toHaveLength(1);
    expect(world.issues[1]).toMatchObject({ state: "closed" });
    expect(world.issues[1]?.description).toBe("Blocked by: none\n\n## Question\n\nShape it.\n\n## Answer\n\nDone.\n");
  });

  it("comments with an issue note", async () => {
    const calls: string[] = [];

    await commentOnTicket(fakeGlab(shop(), calls), repo(), "1/2", "Hello");

    expect(writes(calls)).toEqual(["api -X POST projects/:id/issues/2/notes -f body=Hello"]);
  });

  it("triages with one label call that adds the role label and removes the old one", async () => {
    const world = shop();
    const calls: string[] = [];

    await triageTicket(fakeGlab(world, calls), repo(), "1/3", "ready-for-agent");

    expect(writes(calls)).toEqual([
      "api -X PUT projects/:id/issues/3 -f add_labels=ready-for-agent -f remove_labels=triage",
    ]);
  });

  it("indexes the map by changing only the Decisions-so-far part of the map issue's body", async () => {
    const world = shop();

    await indexMap(fakeGlab(world), repo(), "1", { title: "Schema", link: "issues/02-schema.md", gist: "Done" });

    expect(world.issues[0]?.description).toBe(`${MAP_BODY}- [Schema](issues/02-schema.md): Done\n`);
  });

  it("creates an issue labelled with its map and type, with an explicit Blocked by line without Premium", async () => {
    const world = shop();
    const calls: string[] = [];

    const { ticket } = await createTicket(fakeGlab(world, calls), repo(), {
      map: "1",
      title: "Ship",
      type: "task",
      question: "How?",
      blockedBy: ["2"],
    });

    expect(ticket).toMatchObject({ id: "6", map: "1", blockers: ["2"] });
    expect(world.issues.at(-1)).toMatchObject({
      labels: ["map:1", "type:task"],
      description: "Blocked by: 2\n\n## Question\n\nHow?",
    });
    expect(writes(calls)).toHaveLength(1);
  });

  it("creates an issue with native links on Premium and no Blocked by line", async () => {
    const world = shop();
    world.premium = true;
    const calls: string[] = [];

    await createTicket(fakeGlab(world, calls), repo(), { map: "1", title: "Ship", type: "task", blockedBy: ["2"] });

    expect(world.issues.at(-1)?.description).toBe("");
    expect(writes(calls).at(-1)).toBe(
      "api -X POST projects/:id/issues/6/links -f target_project_id=7 -f target_issue_iid=2 -f link_type=is_blocked_by",
    );
  });

  it("blocks by rewriting the Blocked by body line without Premium", async () => {
    const world = shop();
    const calls: string[] = [];

    const { ticket } = await blockTicket(fakeGlab(world, calls), repo(), "1/3", { add: ["4"], remove: ["2"] });

    expect(ticket.blockers).toEqual(["4"]);
    expect(world.issues[2]?.description).toBe("Blocked by: 4");
    expect(writes(calls)).toHaveLength(1);
  });

  it("adds the first blocker to a body without the line", async () => {
    const world = shop();

    await blockTicket(fakeGlab(world), repo(), "1/4", { add: ["2"] });

    expect(world.issues[3]?.description).toBe("Blocked by: 2\n");
  });

  it("blocks and unblocks through native links on Premium", async () => {
    const world = shop();
    world.premium = true;
    world.links = { 3: [2] };
    const calls: string[] = [];

    await blockTicket(fakeGlab(world, calls), repo(), "1/3", { add: ["4"], remove: ["2"] });

    expect(writes(calls)).toEqual([
      "api -X POST projects/:id/issues/3/links -f target_project_id=7 -f target_issue_iid=4 -f link_type=is_blocked_by",
      "api -X DELETE projects/:id/issues/3/links/500",
    ]);
  });

  const link = (iid: number, blocker: number) =>
    `api -X POST projects/:id/issues/${iid}/links -f target_project_id=7 -f target_issue_iid=${blocker} -f link_type=is_blocked_by`;

  it("names the links already added when a later link call fails", async () => {
    const world = { ...shop(), premium: true, failing: [link(3, 5)] };

    const error = await blockTicket(fakeGlab(world), repo(), "1/3", { add: ["4", "5"] }).catch((e: unknown) => e);

    expect(error).toMatchObject({
      name: "DrylandError",
      message: expect.stringContaining("blocked by #4"),
      nextAction: expect.stringContaining("dryland ticket block 1/3"),
    });
    expect((error as Error).message).toContain("blocking it by #5 failed");
  });

  it("reports nothing as applied when the first link call fails", async () => {
    const world = { ...shop(), premium: true, failing: [link(3, 4)] };

    const error = await blockTicket(fakeGlab(world), repo(), "1/3", { add: ["4"] }).catch((e: unknown) => e);

    expect((error as Error).message).not.toContain("Already applied");
  });

  it("names the links already changed when removing a link fails", async () => {
    const world = { ...shop(), premium: true, links: { 3: [2] }, failing: ["api -X DELETE projects/:id/issues/3/links/500"] };

    const error = await blockTicket(fakeGlab(world), repo(), "1/3", { add: ["4"], remove: ["2"] }).catch(
      (e: unknown) => e,
    );

    expect((error as Error).message).toContain("removing the block by #2 failed");
    expect((error as Error).message).toContain("blocked by #4");
  });

  it("reports a failed glab call with the next action and claims no success", async () => {
    const world = shop();
    const failing: ProcessRunner = {
      async run(command, args, options) {
        if (command === "glab" && args.includes("PUT")) return fail("HTTP 500");
        return fakeGlab(world).run(command, args, options);
      },
    };

    const error = await resolveTicket(failing, repo(), "1/2", "Done.").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DrylandError);
    expect((error as DrylandError).message).toContain("HTTP 500");
    expect((error as DrylandError).nextAction).toContain("GitLab remote");
    expect(world.issues[1]?.state).toBe("opened");
  });
});
