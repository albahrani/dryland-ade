import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDryland, TempRepo } from "./harness.ts";

const REF = "refs/dryland/state";
/** A low cadence, so a handful of events cross it. */
const EVERY = { DRYLAND_SNAPSHOT_EVERY: "3" };

const storeOf = (repo: TempRepo) =>
  join(process.env["DRYLAND_DATA_DIR"] ?? "", "stores", `${repo.git("config", "dryland.repoId")}.git`);

const git = (repo: TempRepo, args: string[], extra: Record<string, string> = {}, input?: string) =>
  execFileSync("git", args, {
    input,
    env: { ...process.env, GIT_DIR: storeOf(repo), ...extra },
    encoding: "utf8",
  }).trim();

const files = (repo: TempRepo) => git(repo, ["ls-tree", "-r", "--name-only", REF]).split("\n");
const snapshots = (repo: TempRepo) => files(repo).filter((f) => f.startsWith("snapshots/"));
const eventFiles = (repo: TempRepo) => files(repo).filter((f) => f.startsWith("events/"));

/** Commits a new head of the state ref whose tree is the current one with `edit` applied to the index. */
function rewrite(repo: TempRepo, edit: (index: Record<string, string>) => void): void {
  const index = join(storeOf(repo), "scratch-index");
  const env = {
    GIT_INDEX_FILE: index,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
  };
  rmSync(index, { force: true });
  git(repo, ["read-tree", REF], env);
  edit(env);
  const tree = git(repo, ["write-tree"], env);
  git(repo, ["update-ref", REF, git(repo, ["commit-tree", tree, "-p", REF, "-m", "edit"], env)]);
}

const dropFromTree = (repo: TempRepo, paths: string[]) =>
  rewrite(repo, (env) => {
    git(
      repo,
      ["update-index", "--index-info"],
      env,
      paths
        .map(
          (p) => `0 ${"0".repeat(40)}	${p}
`,
        )
        .join(""),
    );
  });

const garbageInTree = (repo: TempRepo, paths: string[]) => {
  const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
    env: { ...process.env, GIT_DIR: storeOf(repo) },
    input: "not json at all",
    encoding: "utf8",
  }).trim();
  rewrite(repo, (env) => {
    for (const path of paths) git(repo, ["update-index", "--cacheinfo", `100644,${blob},${path}`], env);
  });
};

const createTicket = (repo: TempRepo, title: string) =>
  runDryland(["ticket", "create"], {
    cwd: repo.path,
    env: EVERY,
    input: JSON.stringify({ effort: "shop", type: "task", title }),
  });

async function repoWith(count: number): Promise<TempRepo> {
  const repo = TempRepo.create();
  expect((await repo.run(["init"])).exitCode).toBe(0);
  for (let i = 1; i <= count; i++) expect((await createTicket(repo, `Probe ${i}`)).exitCode).toBe(0);
  return repo;
}

const list = async (repo: TempRepo) => (await repo.run(["ticket", "list"])).stdout;
const clearCache = (repo: TempRepo) => rmSync(join(storeOf(repo), "dryland"), { recursive: true, force: true });

describe("snapshots", () => {
  it("are written as the log grows and never remove an event", async () => {
    const repo = await repoWith(7);
    expect(eventFiles(repo)).toHaveLength(7);
    expect(snapshots(repo).length).toBeGreaterThanOrEqual(2);
    expect(snapshots(repo).length).toBeLessThan(7);
  });

  it("bound replay: a rebuild and a write never read the events a snapshot covers", async () => {
    const repo = await repoWith(7);
    const expected = await list(repo);
    const covered = eventFiles(repo).slice(0, 5);
    garbageInTree(repo, covered);

    clearCache(repo);
    expect(await list(repo)).toBe(expected);

    const made = await createTicket(repo, "Probe 8");
    expect(made.exitCode).toBe(0);
    expect(made.stdout).toBe("Created shop/08: Probe 8\n");
  });

  it("give the same state as a full replay", async () => {
    const repo = await repoWith(8);
    const viaSnapshot = await list(repo);
    dropFromTree(repo, snapshots(repo));
    expect(snapshots(repo)).toEqual([]);
    clearCache(repo);
    expect(await list(repo)).toBe(viaSnapshot);
  });

  it("are optional: a store without any, or with a bad one, rebuilds identical state", async () => {
    const repo = await repoWith(8);
    const expected = await list(repo);

    garbageInTree(repo, snapshots(repo));
    clearCache(repo);
    expect(await list(repo)).toBe(expected);

    dropFromTree(repo, snapshots(repo));
    clearCache(repo);
    expect(await list(repo)).toBe(expected);
    // The next write snapshots again.
    expect((await createTicket(repo, "Probe 9")).exitCode).toBe(0);
    expect(snapshots(repo)).toHaveLength(1);
  });

  it("cover lifecycle changes as well as creates", async () => {
    const repo = await repoWith(4);
    expect((await repo.run(["ticket", "claim", "shop/01"], repo.path, EVERY)).exitCode).toBe(0);
    expect((await repo.run(["ticket", "claim", "shop/02"], repo.path, EVERY)).exitCode).toBe(0);
    const expected = await list(repo);
    expect(JSON.parse(expected).tickets[0].status).toBe("claimed");
    dropFromTree(repo, snapshots(repo));
    clearCache(repo);
    expect(await list(repo)).toBe(expected);
  });

  it("default to a cadence of 100 events", async () => {
    const repo = TempRepo.create();
    expect((await repo.run(["init"])).exitCode).toBe(0);
    for (let i = 1; i <= 3; i++) {
      const made = await repo.runWithInput(
        ["ticket", "create"],
        JSON.stringify({ effort: "shop", type: "task", title: `T${i}` }),
      );
      expect(made.exitCode).toBe(0);
    }
    expect(snapshots(repo)).toEqual([]);
  });
});
