import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createExplorerWatcher } from "../src/main/explorer-watch.ts";

const tempRoot = () => realpathSync.native(mkdtempSync(join(tmpdir(), "dryland-explorer-watch-")));
const QUIET_MS = 150;

let watcher: ReturnType<typeof createExplorerWatcher> | undefined;
afterEach(() => watcher?.stop());

describe("createExplorerWatcher", () => {
  it("reports a change in a watched directory but not in one it was not given", async () => {
    const root = tempRoot();
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "node_modules"));
    const onChange = vi.fn();
    watcher = createExplorerWatcher(onChange, 20);
    watcher.set(root, ["src"]);
    // macOS replays the events of the last moment, such as the folders made above, to a new watcher.
    await new Promise((resolve) => setTimeout(resolve, QUIET_MS));
    onChange.mockClear();

    writeFileSync(join(root, "node_modules", "dep.js"), "x");
    await new Promise((resolve) => setTimeout(resolve, QUIET_MS));
    expect(onChange).not.toHaveBeenCalled();

    writeFileSync(join(root, "src", "a.ts"), "x");
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("reports a commit or checkout (the git directory's HEAD, index and reflog) but not other git writes", async () => {
    const root = tempRoot();
    const gitDir = join(root, ".git");
    mkdirSync(join(gitDir, "logs"), { recursive: true });
    const onChange = vi.fn();
    watcher = createExplorerWatcher(onChange, 20);
    watcher.set(root, [], gitDir);

    writeFileSync(join(gitDir, "FETCH_HEAD"), "x");
    writeFileSync(join(gitDir, "index.lock"), "x");
    await new Promise((resolve) => setTimeout(resolve, QUIET_MS));
    expect(onChange).not.toHaveBeenCalled();

    writeFileSync(join(gitDir, "logs", "HEAD"), "x");
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    onChange.mockClear();

    writeFileSync(join(gitDir, "index"), "x");
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
  });
});
