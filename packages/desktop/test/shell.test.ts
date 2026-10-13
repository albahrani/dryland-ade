import { describe, expect, it } from "vitest";
import { resolveShell } from "../src/main/shell.ts";

describe("resolveShell", () => {
  it("uses COMSPEC on Windows, falling back to cmd.exe", () => {
    expect(resolveShell("win32", { COMSPEC: "C:\\Windows\\System32\\cmd.exe" })).toEqual({
      file: "C:\\Windows\\System32\\cmd.exe",
      args: [],
    });
    expect(resolveShell("win32", {})).toEqual({ file: "cmd.exe", args: [] });
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
