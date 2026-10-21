import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installLayout, removeStaleLauncher } from "../src/main/install-layout.ts";

describe("the install layout", () => {
  it("in an installed app, runs the launcher and CLI shipped in the install directory", () => {
    const layout = installLayout({
      packaged: true,
      resourcesPath: join("/opt", "Dryland ADE", "resources"),
      builtCli: "/ignored/dryland.js",
      userDataBin: "/home/u/.config/dryland/bin",
    });

    expect(layout.cli).toBe(join("/opt", "Dryland ADE", "resources", "bin", "dryland.mjs"));
    // The shims come first, but only the install directory holds a `dryland`.
    expect(layout.pathDirs).toEqual(["/home/u/.config/dryland/bin", join("/opt", "Dryland ADE", "resources", "bin")]);
    expect(layout.writeLauncher).toBe(false);
  });

  it("in a development run, writes the launcher beside the built CLI as before", () => {
    const layout = installLayout({
      packaged: false,
      resourcesPath: "/electron/resources",
      builtCli: "/repo/packages/desktop/out/main/dryland.js",
      userDataBin: "/home/u/.config/dryland/bin",
    });

    expect(layout.cli).toBe("/repo/packages/desktop/out/main/dryland.js");
    expect(layout.pathDirs).toEqual(["/home/u/.config/dryland/bin"]);
    expect(layout.writeLauncher).toBe(true);
  });

  it("removes the launcher an earlier version left in user data, and nothing else", () => {
    const dir = mkdtempSync(join(tmpdir(), "dryland-stale-"));
    mkdirSync(dir, { recursive: true });
    for (const name of ["dryland", "dryland.cmd", "claude", "claude.cmd"]) writeFileSync(join(dir, name), "x");

    removeStaleLauncher(dir);

    expect(existsSync(join(dir, "dryland"))).toBe(false);
    expect(existsSync(join(dir, "dryland.cmd"))).toBe(false);
    expect(existsSync(join(dir, "claude"))).toBe(true);
    expect(existsSync(join(dir, "claude.cmd"))).toBe(true);
    // A directory that is not there is fine.
    removeStaleLauncher(join(dir, "missing"));
  });
});
