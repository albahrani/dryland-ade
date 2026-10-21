import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../electron-builder.json" with { type: "json" };

const desktop = join(import.meta.dirname, "..");

const targets = (platform: "win" | "mac" | "linux"): string[] =>
  (config[platform].target as { target: string }[]).map((t) => t.target);

describe("the electron-builder config", () => {
  it("builds the installer formats of ADR 0004 under the app id", () => {
    expect(config.appId).toBe("dev.dryland.ade");
    expect(config.productName).toBe("Dryland ADE");
    expect(targets("win")).toEqual(["nsis"]);
    expect(targets("mac")).toEqual(["dmg"]);
    expect(targets("linux").sort()).toEqual(["AppImage", "deb"]);
    expect(config.mac.target.flatMap((t) => t.arch)).toEqual(["arm64", "x64"]);
  });

  it("ships the launcher and the CLI as one JS file in resources/bin", () => {
    const shipped = config.extraResources.map((r: { from: string; to: string }) => r.to);
    expect(shipped).toContain("bin/dryland");
    expect(shipped).toContain("bin/dryland.cmd");
    expect(shipped).toContain("bin/dryland.mjs");
    const cli = config.extraResources.find((r: { to: string }) => r.to === "bin/dryland.mjs");
    // esbuild bundles the CLI and @dryland/core into this one file; it has no chunk or sibling imports.
    const bundle = readFileSync(join(desktop, cli?.from ?? ""), "utf8");
    expect(bundle).not.toMatch(/^import .* from "\.\.?\//m);
    expect(bundle).not.toMatch(/import\(["']\.\.?\//);
  });

  it("points every resource at a file that exists", () => {
    for (const { from } of config.extraResources) expect(existsSync(join(desktop, from)), from).toBe(true);
    expect(existsSync(join(desktop, config.nsis.include))).toBe(true);
  });

  it("keeps the PATH option off by default and lets the user pick the install directory", () => {
    expect(config.nsis.oneClick).toBe(false);
    expect(config.nsis.allowToChangeInstallationDirectory).toBe(true);
    const nsh = readFileSync(join(desktop, config.nsis.include), "utf8");
    // The checkbox is never pre-ticked: only an explicit tick adds the entry.
    expect(nsh).not.toMatch(/NSD_Check\b/);
    expect(nsh).toContain("path.ps1");
  });

  it("links dryland system-wide from the deb only", () => {
    expect(config.deb.afterInstall).toBeDefined();
    expect(config.deb.afterRemove).toBeDefined();
    expect(readFileSync(join(desktop, config.deb.afterInstall), "utf8")).toContain("/usr/bin/dryland");
    expect(readFileSync(join(desktop, config.deb.afterRemove), "utf8")).toContain("/usr/bin/dryland");
    expect(config.linux.executableName).toBe("dryland-ade");
  });
});

describe.skipIf(process.platform !== "win32")("the NSIS PATH script", () => {
  const script = join(desktop, "installer", "path.ps1");
  const variable = `DRYLAND_TEST_PATH_${process.pid}`;
  const run = (action: string, dir: string) =>
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, action, dir, "-Variable", variable],
      { encoding: "utf8" },
    );
  const read = () =>
    execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `(Get-Item HKCU:\\Environment).GetValue('${variable}', '', 'DoNotExpandEnvironmentNames')`,
    ])
      .toString()
      .trim();

  it("adds the directory once, keeps other entries as they are, and removes only its own", () => {
    const dir = "C:\\Program Files\\Dryland ADE\\resources\\bin";
    try {
      run("add", "C:\\Other");
      run("add", dir);
      run("add", dir);
      expect(read()).toBe(`C:\\Other;${dir}`);
      run("remove", dir);
      expect(read()).toBe("C:\\Other");
    } finally {
      execFileSync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Remove-ItemProperty -LiteralPath HKCU:\\Environment -Name '${variable}' -ErrorAction SilentlyContinue`,
      ]);
    }
  });
});
