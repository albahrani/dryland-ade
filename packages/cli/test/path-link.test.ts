import { lstatSync, mkdirSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDryland, tempDir, WINDOWS } from "./harness.ts";

/** A home and an installed launcher, as `dryland doctor` sees them when the app's launcher runs it. */
function setup() {
  const home = tempDir("dryland-home-");
  const install = tempDir("dryland-install-");
  const launcher = join(install, "dryland");
  writeFileSync(launcher, "#!/bin/sh\n");
  const env = { HOME: home, USERPROFILE: home, DRYLAND_LAUNCHER: launcher };
  return { home, launcher, env, link: join(home, ".local", "bin", "dryland"), cwd: install };
}

describe.skipIf(WINDOWS)("dryland doctor --link-path", () => {
  it("links the installed launcher into ~/.local/bin, and --unlink-path removes the link", async () => {
    const { launcher, env, link, cwd } = setup();

    const linked = await runDryland(["doctor", "--link-path"], { cwd, env });

    expect(linked.stdout).toContain(link);
    expect(readlinkSync(link)).toBe(launcher);

    const unlinked = await runDryland(["doctor", "--unlink-path"], { cwd, env });

    expect(unlinked.stdout).toContain(`Removed ${link}`);
    expect(() => lstatSync(link)).toThrow();
  });

  it("is idempotent and repoints a link left by an earlier install", async () => {
    const { launcher, env, link, cwd, home } = setup();
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    symlinkSync("/gone/dryland", link);

    await runDryland(["doctor", "--link-path"], { cwd, env });
    const again = await runDryland(["doctor", "--link-path"], { cwd, env });

    expect(readlinkSync(link)).toBe(launcher);
    expect(again.stdout).toContain("already");
  });

  it("refuses to replace a file that is not a link, and to remove one", async () => {
    const { env, link, cwd, home } = setup();
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    writeFileSync(link, "mine");

    const linking = await runDryland(["doctor", "--link-path"], { cwd, env });
    const unlinking = await runDryland(["doctor", "--unlink-path"], { cwd, env });

    expect(linking.exitCode).toBe(1);
    expect(linking.stderr).toContain(link);
    expect(unlinking.exitCode).toBe(1);
    expect(lstatSync(link).isFile()).toBe(true);
  });

  it("says what to do when it is not run through the installed launcher", async () => {
    const { env, cwd, link } = setup();

    const result = await runDryland(["doctor", "--link-path"], { cwd, env: { ...env, DRYLAND_LAUNCHER: "" } });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("installed");
    expect(() => lstatSync(link)).toThrow();
  });

  it("reports nothing to remove when there is no link", async () => {
    const { env, cwd } = setup();

    const result = await runDryland(["doctor", "--unlink-path"], { cwd, env });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("not linked");
  });
});
