import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dataDir, nodeProcessRunner, seedStore, sessionIndexPath, storeDir } from "../src/index.ts";

describe("dataDir", () => {
  it("is DRYLAND_DATA_DIR when set, else a per-OS user data dir", () => {
    expect(dataDir({ DRYLAND_DATA_DIR: "/data" }, "linux", "/home/a")).toBe("/data");
    expect(dataDir({ LOCALAPPDATA: "C:\\L" }, "win32", "C:\\Users\\a")).toBe(join("C:\\L", "Dryland"));
    expect(dataDir({}, "darwin", "/Users/a")).toBe(join("/Users/a", "Library", "Application Support", "Dryland"));
    expect(dataDir({ XDG_DATA_HOME: "/xdg" }, "linux", "/home/a")).toBe(join("/xdg", "dryland"));
    expect(dataDir({}, "linux", "/home/a")).toBe(join("/home/a", ".local", "share", "dryland"));
  });
});

describe("the store of a repo", () => {
  function repo(): string {
    process.env["DRYLAND_DATA_DIR"] ??= mkdtempSync(join(tmpdir(), "dryland-data-"));
    const path = mkdtempSync(join(tmpdir(), "dryland-store-dir-"));
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: path });
    return path;
  }

  it("has none before init, then sits under the data dir with the session index beside it", async () => {
    const path = repo();
    expect(await storeDir(path)).toBeNull();
    const before = await sessionIndexPath(nodeProcessRunner, path);
    expect(before).toContain(".git");

    await seedStore(path, [{ effort: "shop", tickets: [{ title: "Pick a cart" }] }]);

    const dir = await storeDir(path);
    expect(dir?.startsWith(join(process.env["DRYLAND_DATA_DIR"] ?? "", "stores"))).toBe(true);
    expect(await sessionIndexPath(nodeProcessRunner, path)).toBe(join(dir ?? "", "dryland", "sessions.json"));
  });
});
