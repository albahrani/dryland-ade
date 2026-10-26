import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

const REF = "refs/dryland/state";

/** The bare git dir the repo's store lives in. */
function storeOf(repo: TempRepo): string {
  return join(process.env["DRYLAND_DATA_DIR"] ?? "", "stores", `${repo.git("config", "dryland.repoId")}.git`);
}

const storeGit = (repo: TempRepo, ...args: string[]) =>
  execFileSync("git", args, { env: { ...process.env, GIT_DIR: storeOf(repo) }, encoding: "utf8" }).trim();

const doc = (fields: object) => JSON.stringify({ effort: "shop", type: "task", ...fields });
const create = (repo: TempRepo, fields: object, ...flags: string[]) =>
  repo.runWithInput(["ticket", "create", ...flags], doc(fields));

async function initialised(): Promise<TempRepo> {
  const repo = TempRepo.create();
  expect((await repo.run(["init"])).exitCode).toBe(0);
  return repo;
}

describe("the state store", () => {
  it("lives in its own bare git dir outside the repo, never in a worktree or the repo's refs", async () => {
    const repo = await initialised();
    const created = await create(repo, { title: "Pick a cart" });
    expect(created.exitCode).toBe(0);
    expect(created.stdout).toBe("Created shop/01: Pick a cart\n");

    expect(storeGit(repo, "rev-parse", "--verify", REF)).not.toBe("");
    expect(storeGit(repo, "rev-parse", "--is-bare-repository")).toBe("true");
    expect(storeOf(repo).startsWith(repo.path)).toBe(false);
    // The repo has no trace of the ref, and nothing reaches its working tree.
    expect(repo.git("for-each-ref", "refs/dryland")).toBe("");
    expect(repo.git("status", "--porcelain")).toBe("");
    expect(existsSync(join(repo.path, ".scratch"))).toBe(false);
    expect(readdirSync(repo.path).filter((f) => f !== ".git")).toEqual([".gitkeep"]);
    const events = storeGit(repo, "ls-tree", "-r", "--name-only", REF).split("\n");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatch(/^events\/00000001-.+\.json$/);
    const event = JSON.parse(storeGit(repo, "show", `${REF}:${events[0]}`));
    expect(event).toMatchObject({ schema: 1, kind: "ticket.created", effort: "shop", id: "01" });
  });

  it("is shared by a linked worktree", async () => {
    const repo = await TempRepo.createStore([{ effort: "shop", tickets: [{ title: "Pick a cart" }] }]);
    const worktree = repo.addWorktree("feature");
    expect((await repo.run(["ticket", "list", "--text"], worktree)).stdout).toContain("shop/01");
  });

  it("init is idempotent and can re-bind a copied repo to its store", async () => {
    const repo = await initialised();
    expect((await repo.run(["init"])).stdout).toBe("The Dryland state store already exists.\n");

    const clone = TempRepo.create();
    const id = repo.git("config", "dryland.repoId");
    expect((await clone.run(["init", "--bind", id])).stdout).toBe("The Dryland state store already exists.\n");
    expect(clone.git("config", "dryland.repoId")).toBe(id);
    const bad = await clone.run(["init", "--bind", "00000000-0000-0000-0000-000000000000"]);
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr).toContain("There is no store with id");
  });

  it("rebuilds identical state when the cache is deleted", async () => {
    const repo = await TempRepo.createStore([
      { effort: "shop", tickets: [{ title: "Pick a cart" }, { title: "Wire checkout", type: "grilling" }] },
    ]);
    const before = (await repo.run(["ticket", "list"])).stdout;
    const cache = join(storeOf(repo), "dryland", "cache.sqlite");
    expect(existsSync(cache)).toBe(true);

    rmSync(join(storeOf(repo), "dryland"), { recursive: true });
    expect((await repo.run(["ticket", "list"])).stdout).toBe(before);
    expect(existsSync(cache)).toBe(true);
  });

  it("gives parallel creates distinct numbers", async () => {
    const repo = await initialised();
    const runs = await Promise.all(["a", "b", "c", "d"].map((title) => create(repo, { title })));
    expect(runs.map((r) => r.exitCode)).toEqual([0, 0, 0, 0]);
    const list = JSON.parse((await repo.run(["ticket", "list"])).stdout);
    expect(list.tickets.map((t: { id: string }) => t.id)).toEqual(["01", "02", "03", "04"]);
  });

  it("fails loudly when an event has an unknown schema", async () => {
    const repo = await TempRepo.createStore([{ effort: "shop", tickets: [{ title: "Pick a cart" }] }]);
    const path = storeGit(repo, "ls-tree", "-r", "--name-only", REF);
    const event = JSON.parse(storeGit(repo, "show", `${REF}:${path}`));
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
      env: { ...process.env, GIT_DIR: storeOf(repo) },
      input: JSON.stringify({ ...event, schema: 99 }),
      encoding: "utf8",
    }).trim();
    const index = join(storeOf(repo), "scratch-index");
    const env = { ...process.env, GIT_DIR: storeOf(repo), GIT_INDEX_FILE: index };
    execFileSync("git", ["read-tree", REF], { env });
    execFileSync("git", ["update-index", "--cacheinfo", `100644,${blob},${path}`], { env });
    const tree = execFileSync("git", ["write-tree"], { env, encoding: "utf8" }).trim();
    const commit = execFileSync("git", ["commit-tree", tree, "-p", REF, "-m", "newer event"], {
      env: {
        ...env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      },
      encoding: "utf8",
    }).trim();
    storeGit(repo, "update-ref", REF, commit);

    const read = await repo.run(["ticket", "list"]);
    expect(read.exitCode).toBe(1);
    expect(read.stderr).toContain("has schema 99, but this Dryland reads schema 1");
  });
});

describe("the write contract", () => {
  it("creates a ticket from a document and reads it back with every field", async () => {
    const repo = await initialised();
    await create(repo, { title: "Pick a cart" });
    const made = await create(repo, {
      title: "Wire checkout",
      type: "research",
      report: "Which provider?",
      criteria: [{ text: "A provider is named", done: false }],
      spec: ".scratch/shop/spec.md",
      blockedBy: ["shop/01"],
      triageRole: "needs-info",
      hitl: true,
    });
    expect(made.exitCode).toBe(0);

    const shown = JSON.parse((await repo.run(["ticket", "show", "shop/02"])).stdout);
    expect(shown).toMatchObject({
      $schema: "dryland/ticket@1",
      ref: "shop/02",
      effort: "shop",
      id: "02",
      title: "Wire checkout",
      type: "research",
      status: "open",
      report: "Which provider?",
      criteria: [{ text: "A provider is named", done: false }],
      spec: ".scratch/shop/spec.md",
      blockedBy: ["shop/01"],
      triageRole: "needs-info",
      hitl: true,
      claim: null,
    });
    const text = (await repo.run(["ticket", "show", "shop/02", "--text"])).stdout;
    expect(text).toContain("shop/02  Wire checkout");
    expect(text).toContain("Blocked by: 01");
    expect(text).toContain("  - [ ] A provider is named");
  });

  it("creates a map and rejects a second one for the same effort", async () => {
    const repo = await initialised();
    const input = JSON.stringify({
      effort: "shop",
      title: "Shop",
      destination: "A shop that sells things.",
      fog: ["Tax"],
    });
    const made = await repo.runWithInput(["map", "create"], input);
    expect(made.stdout).toBe("Created the map of shop: Shop\n");
    const again = await repo.runWithInput(["map", "create"], input);
    expect(again.exitCode).toBe(4);
    expect(again.stderr).toContain("effort: map-exists: shop already has a map.");

    const shown = JSON.parse((await repo.run(["map", "show", "shop"])).stdout);
    expect(shown).toMatchObject({
      $schema: "dryland/map-view@1",
      effort: "shop",
      map: { title: "Shop", destination: "A shop that sells things.", notes: "", fog: ["Tax"], outOfScope: [] },
      tickets: [],
    });
  });

  it("stops after the check step with --check and writes nothing", async () => {
    const repo = await initialised();
    const head = storeGit(repo, "rev-parse", REF);
    const checked = await create(repo, { title: "Pick a cart" }, "--check");
    expect(checked.exitCode).toBe(0);
    expect(checked.stdout).toBe("Checked: this would create shop/01.\n");
    expect(storeGit(repo, "rev-parse", REF)).toBe(head);
    expect((await repo.run(["ticket", "list"])).stdout).toContain('"tickets": []');
  });

  it("prints one diagnostic line per problem and exits 3 for the parse step", async () => {
    const repo = await initialised();
    const run = await create(repo, { title: 7, type: "chore", extra: true, criteria: [{ text: "x" }] });
    expect(run.exitCode).toBe(3);
    const lines = run.stderr.split("\n").filter((l) => /^[\w.[\]$]+: [\w-]+: /.test(l));
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^title: wrong-type: Expected a string, got a number\. Fix: /),
        expect.stringMatching(
          /^type: bad-value: "chore" is not one of the allowed values\. Fix: Use one of: research, prototype, grilling, task\./,
        ),
        expect.stringMatching(/^extra: unknown-field: /),
        expect.stringMatching(/^criteria\[0\]\.done: missing-field: /),
      ]),
    );
    const notJson = await repo.runWithInput(["ticket", "create"], "not json");
    expect(notJson.exitCode).toBe(3);
    expect(notJson.stderr).toContain("$: invalid-json:");
    expect((await repo.run(["ticket", "list"])).stdout).toContain('"tickets": []');
  });

  it("exits 4 for a content rule, naming the field path and rule", async () => {
    const repo = await initialised();
    const run = await create(repo, { title: "Two\nlines", blockedBy: ["shop/07", "other/01", "7"] });
    expect(run.exitCode).toBe(4);
    expect(run.stderr).toContain("title: one-line: It must be one non-empty line.");
    expect(run.stderr).toContain("blockedBy[0]: no-such-ticket: Blocker shop/07 does not exist.");
    expect(run.stderr).toContain("blockedBy[1]: cross-effort: other/01 is in another effort.");
    expect(run.stderr).toContain('blockedBy[2]: bad-reference: "7" is not a ticket reference.');
    expect((await repo.run(["ticket", "list"])).stdout).toContain('"tickets": []');
  });

  it("refuses the old flag-based create instead of ignoring the flags", async () => {
    const repo = await initialised();
    const run = await repo.run(["ticket", "create", "--map", "shop", "--title", "x", "--type", "task"]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("--map is not an option of `dryland ticket create`");
    expect(run.stderr).toContain("Next: Pipe one JSON document");
  });

  it("prints help with a field description and an example that is itself a valid document", async () => {
    const repo = await initialised();
    const help = await repo.run(["ticket", "create", "--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("title: string. One line.");
    expect(help.stdout).toContain("type: research | prototype | grilling | task.");
    const example = help.stdout.slice(
      help.stdout.indexOf("Example:\n") + "Example:\n".length,
      help.stdout.indexOf("\n}\n") + 2,
    );
    await create(repo, { title: "The example's blocker" });
    const pasted = await repo.runWithInput(["ticket", "create", "--check"], example);
    expect(pasted.exitCode).toBe(0);
    const mapHelp = await repo.run(["map", "create", "--help"]);
    expect(mapHelp.stdout).toContain("destination (optional): string.");
  });
});

describe("reads", () => {
  const efforts = [
    {
      effort: "shop",
      map: { title: "Shop", destination: "A shop that sells things.", fog: ["Tax rules"] },
      tickets: [
        { title: "Pick a cart", type: "task" },
        { title: "Choose a provider", type: "research", blockedBy: [1] },
        { title: "Wire checkout", type: "task", blockedBy: [2] },
        { title: "Pick a logo", type: "task" },
      ],
    },
    { effort: "blog", tickets: [{ title: "Pick a cart", type: "task" }] },
  ];

  it("lists documents, and renders them with --text", async () => {
    const repo = await TempRepo.createStore(efforts);
    const list = JSON.parse((await repo.run(["ticket", "list"])).stdout);
    expect(list.$schema).toBe("dryland/ticket-list@1");
    expect(list.tickets.map((t: { ref: string }) => t.ref)).toEqual([
      "blog/01",
      "shop/01",
      "shop/02",
      "shop/03",
      "shop/04",
    ]);
    const text = (await repo.run(["ticket", "list", "--text"])).stdout;
    expect(text).toContain("blog/01  open  task      Pick a cart");
    expect(text).toContain("shop/02  open  research  Choose a provider");
  });

  it("shows a map with its tickets grouped, and a map-less effort as tickets only", async () => {
    const repo = await TempRepo.createStore(efforts);
    const text = (await repo.run(["map", "show", "shop", "--text"])).stdout;
    expect(text).toContain("Map: Shop (shop)");
    expect(text).toContain("Destination: A shop that sells things.");
    expect(text).toContain("Planning:\n  shop/02");
    expect(text).toContain("Fog:\n  - Tax rules");
    const standalone = JSON.parse((await repo.run(["map", "show", "blog"])).stdout);
    expect(standalone.map).toBeNull();
    expect(standalone.tickets).toHaveLength(1);
  });

  it("lists the frontier lowest number first, writes nothing, and says so when it is empty", async () => {
    const repo = await TempRepo.createStore(efforts);
    const head = storeGit(repo, "rev-parse", REF);
    const frontier = JSON.parse((await repo.run(["map", "frontier", "shop"])).stdout);
    expect(frontier.$schema).toBe("dryland/frontier@1");
    expect(frontier.tickets.map((t: { ref: string }) => t.ref)).toEqual(["shop/01", "shop/04"]);
    expect(storeGit(repo, "rev-parse", REF)).toBe(head);

    const bare = await TempRepo.createStore([{ effort: "plan", map: { title: "Plan" } }]);
    expect((await bare.run(["map", "frontier", "plan", "--text"])).stdout).toBe("No frontier tickets.\n");
    const ghost = await bare.run(["map", "frontier", "ghost"]);
    expect(ghost.exitCode).toBe(1);
    expect(ghost.stderr).toContain('There is no effort "ghost"');
  });

  it("states the next action for a bare id in several efforts, an unknown ticket or effort and a bad reference", async () => {
    const repo = await TempRepo.createStore(efforts);
    const several = await repo.run(["ticket", "show", "1"]);
    expect(several.exitCode).toBe(1);
    expect(several.stderr).toContain('Ticket "1" exists in several maps: blog/01, shop/01.');
    expect(several.stderr).toContain("Next: Name the map too");

    const unknown = await repo.run(["ticket", "show", "shop/99"]);
    expect(unknown.stderr).toContain('There is no ticket "shop/99".');
    expect(unknown.stderr).toContain("Next: Run `dryland ticket list`");

    const effort = await repo.run(["map", "show", "ghost"]);
    expect(effort.stderr).toContain('There is no effort "ghost"');
    expect(effort.stderr).toContain("Next: Run `dryland ticket list`");

    const malformed = await repo.run(["ticket", "show", "shop/two"]);
    expect(malformed.stderr).toContain('"shop/two" is not a ticket reference.');
    expect(malformed.stderr).toContain("Next: Write it as <map>/<number>");
  });
});
