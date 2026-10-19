import { DrylandError } from "@dryland/core";
import { describe, expect, it } from "vitest";
import type { SessionInfo } from "../src/shared/api.ts";
import { resumeAll } from "../src/main/resume-all.ts";

const session = (id: string): SessionInfo => ({
  id,
  terminalId: `t-${id}`,
  agent: { id: "claude-code", name: "Claude Code" },
  agentSessionId: id,
  project: "/p",
  ticket: { map: "shop", id },
  map: "shop",
  worktree: { branch: "b", path: "/w" },
  command: null,
  startedAt: "2026-10-18T10:00:00Z",
});

describe("resumeAll", () => {
  it("resumes one session after another, in order", async () => {
    const running: string[] = [];
    let overlap = false;
    const result = await resumeAll(
      [
        { map: "shop", id: "01" },
        { map: "shop", id: "02" },
      ],
      async ({ id }) => {
        if (running.length > 0) overlap = true;
        running.push(id);
        await Promise.resolve();
        running.length = 0;
        return { session: session(id), warnings: [] };
      },
    );

    expect(result.sessions.map((s) => s.id)).toEqual(["01", "02"]);
    expect(overlap).toBe(false);
  });

  it("reports a ticket that cannot be resumed and goes on with the rest", async () => {
    const result = await resumeAll(
      [
        { map: "shop", id: "01" },
        { map: "shop", id: "02" },
      ],
      async ({ id }) => {
        if (id === "01") throw new DrylandError("Claude Code is not installed.", "Install it.");
        return { session: session(id), warnings: ["its picker opened"] };
      },
    );

    expect(result.sessions.map((s) => s.id)).toEqual(["02"]);
    expect(result.warnings).toEqual([
      "shop/01: Claude Code is not installed. Install it.",
      "shop/02: its picker opened",
    ]);
  });

  it("does nothing without paused sessions", async () => {
    expect(await resumeAll([], () => Promise.reject(new Error("unreachable")))).toEqual({ sessions: [], warnings: [] });
  });
});
