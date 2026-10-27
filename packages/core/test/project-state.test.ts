import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DrylandError,
  listTickets,
  nextSteps,
  nodeProcessRunner,
  readMapDetail,
  readProjectState,
  readTickets,
  showMap,
} from "../src/index.ts";

function repoWithoutStore(): string {
  process.env["DRYLAND_DATA_DIR"] ??= mkdtempSync(join(tmpdir(), "dryland-data-"));
  const root = mkdtempSync(join(tmpdir(), "dryland-project-state-"));
  execFileSync("git", ["init", "-q", "--initial-branch=main"], { cwd: root });
  return root;
}

describe("a repo without a state store", () => {
  it("is not set up, with `dryland init` as the next step, and has no tickets", async () => {
    const root = repoWithoutStore();

    const { tree, snapshot } = await readProjectState(nodeProcessRunner, root);

    expect(tree.maps).toEqual([]);
    expect(nextSteps(snapshot).map((s) => [s.ruleId, s.command])).toEqual([["no-setup-config", "dryland init"]]);
  });

  it("still shows the efforts that hold a spec, read from .scratch", async () => {
    const root = repoWithoutStore();
    mkdirSync(join(root, ".scratch", "blog"), { recursive: true });
    writeFileSync(join(root, ".scratch", "blog", "spec.md"), "# Blog\n");

    const { snapshot } = await readProjectState(nodeProcessRunner, root);

    expect(snapshot.efforts.map((e) => [e.name, e.hasSpec, e.map])).toEqual([["blog", true, null]]);
  });

  it("is not read as markdown: every reader fails with the error that names `dryland init`", async () => {
    const root = repoWithoutStore();
    // Files of the old tracker are not read, whether or not they are there.
    mkdirSync(join(root, "docs", "agents"), { recursive: true });
    writeFileSync(join(root, "docs", "agents", "issue-tracker.md"), "# Issue tracker: Local markdown\n");
    mkdirSync(join(root, ".scratch", "shop", "issues"), { recursive: true });
    writeFileSync(join(root, ".scratch", "shop", "issues", "01-cart.md"), "# Cart\n\nType: task\n");

    const readers = [
      () => readTickets(root),
      () => listTickets(nodeProcessRunner, root),
      () => showMap(nodeProcessRunner, root, "shop"),
      () => readMapDetail(root, "shop"),
    ];
    for (const read of readers) {
      const error = await read().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DrylandError);
      expect((error as DrylandError).message).toContain("no Dryland state store");
      expect((error as DrylandError).nextAction).toContain("dryland init");
    }
  });
});
