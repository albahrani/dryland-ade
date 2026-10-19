import type { SessionState } from "@dryland/core";
import { describe, expect, it } from "vitest";
import { stateLabel, ticketSessions } from "../src/shared/session-meta.ts";

const session = (id: string, ticket: string) => {
  const [map = "", number = ""] = ticket.split("/");
  return { id, agent: { id: "claude-code", name: "Claude Code" }, ticket: { map, id: number } };
};

describe("the session a ticket shows", () => {
  it("is the one that most needs the user, so a waiting session is never hidden by a newer idle one", () => {
    const states: Record<string, SessionState> = { old: "waiting", new: "idle", other: "running" };

    const shown = ticketSessions(
      [session("old", "shop/02"), session("new", "shop/02"), session("other", "shop/03")],
      states,
    );

    expect(shown.get("shop/02")).toEqual({ agent: "Claude Code", state: "waiting" });
    expect(shown.get("shop/03")).toEqual({ agent: "Claude Code", state: "running" });
  });

  it("is a live session over an ended one, and the newest of equals", () => {
    const shown = ticketSessions(
      [session("first", "shop/02"), session("second", "shop/02"), session("third", "shop/02")],
      { first: "ended", second: "idle", third: "idle" },
    );

    expect(shown.get("shop/02")?.state).toBe("idle");
    expect(ticketSessions([session("a", "shop/02")], {}).get("shop/02")?.state).toBe("launched");
  });

  it("is never a map's own session, which works on no ticket", () => {
    const mapSession = { id: "m", agent: { name: "Claude Code" }, ticket: null };
    expect([...ticketSessions([mapSession], { m: "waiting" }).keys()]).toEqual([]);
  });

  it("carries a hookless session's approximate marking to the ticket's badge", () => {
    const guessed = { ...session("a", "shop/02"), statusApproximate: true as const };
    expect(ticketSessions([guessed], { a: "running" }).get("shop/02")).toEqual({
      agent: "Claude Code",
      state: "running",
      approximate: true,
    });
  });
});

describe("a state's label", () => {
  it("says approximate for a state that was guessed, and nothing extra for one a hook reported", () => {
    expect(stateLabel("running", true)).toBe("working (approximate)");
    expect(stateLabel("running", false)).toBe("working");
    expect(stateLabel("ended", true)).toBe("ended");
  });
});
