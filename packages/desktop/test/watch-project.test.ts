import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStoreTicket, seedStore } from "@dryland/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { watchProject } from "../src/main/watch-project.ts";

// The long spelling of the path: libuv aborts a recursive watch whose events come in the 8.3 short spelling.
const tempRoot = () => realpathSync.native(mkdtempSync(join(tmpdir(), "dryland-watch-")));

let stop: (() => void) | undefined;
afterEach(() => stop?.());

describe("watchProject", () => {
  it("reports a spec that appears under a .scratch directory created after the watch began", async () => {
    const root = tempRoot();
    const onChange = vi.fn();
    stop = watchProject(root, onChange, 20);

    mkdirSync(join(root, ".scratch", "shop"), { recursive: true });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    onChange.mockClear();

    writeFileSync(join(root, ".scratch", "shop", "spec.md"), "# Spec\n");
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("reports an edit to a spec already there", async () => {
    const root = tempRoot();
    mkdirSync(join(root, ".scratch", "shop"), { recursive: true });
    const onChange = vi.fn();
    stop = watchProject(root, onChange, 20);

    writeFileSync(join(root, ".scratch", "shop", "spec.md"), "# changed\n");
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("ignores the skill directories, which no view shows", async () => {
    const root = tempRoot();
    mkdirSync(join(root, ".agents", "skills", "tdd"), { recursive: true });
    const onChange = vi.fn();
    stop = watchProject(root, onChange, 20);

    // macOS can replay the directory's creation, just before the watch began, as a late event; let it land first.
    await new Promise((resolve) => setTimeout(resolve, 300));
    onChange.mockClear();

    writeFileSync(join(root, ".agents", "skills", "tdd", "SKILL.md"), "# changed\n");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports a write to the state store, which sits outside the checkout", async () => {
    process.env["DRYLAND_DATA_DIR"] ??= mkdtempSync(join(tmpdir(), "dryland-watch-data-"));
    const root = tempRoot();
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    await seedStore(root, [{ effort: "shop", tickets: [{ title: "Pick a cart" }] }]);
    const onChange = vi.fn();
    stop = watchProject(root, onChange, 20, 20);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(onChange).not.toHaveBeenCalled();

    await createStoreTicket(root, JSON.stringify({ effort: "shop", title: "More", type: "task" }), {
      author: "engine",
    });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
  });
});
