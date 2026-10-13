import { describe, expect, it } from "vitest";
import { resolveShell } from "../src/main/shell.ts";

describe("resolveShell", () => {
  describe("on Windows", () => {
    const env = { PATH: "C:\\Tools;C:\\Windows\\System32\\WindowsPowerShell\\v1.0", COMSPEC: "C:\\Windows\\cmd.exe" };
    const installed =
      (...files: string[]) =>
      (path: string) =>
        files.includes(path);

    it("prefers PowerShell 7 on PATH", () => {
      const exists = installed("C:\\Tools\\pwsh.exe", "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
      expect(resolveShell("win32", env, exists)).toEqual({ file: "C:\\Tools\\pwsh.exe", args: [] });
    });

    it("falls back to Windows PowerShell, then COMSPEC, then cmd.exe", () => {
      const powershell = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
      expect(resolveShell("win32", env, installed(powershell))).toEqual({ file: powershell, args: [] });
      expect(resolveShell("win32", env, installed())).toEqual({ file: "C:\\Windows\\cmd.exe", args: [] });
      expect(resolveShell("win32", {}, installed())).toEqual({ file: "cmd.exe", args: [] });
    });
  });

  it("uses SHELL elsewhere, falling back to /bin/sh", () => {
    expect(resolveShell("linux", { SHELL: "/usr/bin/zsh" })).toEqual({ file: "/usr/bin/zsh", args: [] });
    expect(resolveShell("darwin", {})).toEqual({ file: "/bin/sh", args: [] });
  });

  it("lets DRYLAND_SHELL and DRYLAND_SHELL_ARGS override the platform default", () => {
    const env = { SHELL: "/bin/zsh", DRYLAND_SHELL: "/opt/stub", DRYLAND_SHELL_ARGS: JSON.stringify(["-e", "x"]) };
    expect(resolveShell("linux", env)).toEqual({ file: "/opt/stub", args: ["-e", "x"] });
  });

  it("ignores malformed DRYLAND_SHELL_ARGS", () => {
    expect(resolveShell("linux", { DRYLAND_SHELL: "/opt/stub", DRYLAND_SHELL_ARGS: "not json" })).toEqual({
      file: "/opt/stub",
      args: [],
    });
  });
});
