import { describe, expect, it } from "vitest";
import { createUnseenOutput } from "../src/main/unseen-output.ts";

describe("unseen output", () => {
  it("marks output of a session not in view, and showing it clears the mark", () => {
    const unseen = createUnseenOutput();
    unseen.view("a");
    expect(unseen.output("a")).toBe(false);
    expect(unseen.output("b")).toBe(true);
    expect(unseen.output("b")).toBe(false);
    expect(unseen.ids()).toEqual(["b"]);
    expect(unseen.view("b")).toBe(true);
    expect(unseen.ids()).toEqual([]);
  });

  it("marks every session while none is in view, such as when only hidden sessions run", () => {
    const unseen = createUnseenOutput();
    unseen.output("a");
    unseen.view(null);
    unseen.output("b");
    expect(unseen.ids()).toEqual(["a", "b"]);
    expect(unseen.has("a")).toBe(true);
  });

  it("forgets a session that is gone", () => {
    const unseen = createUnseenOutput();
    unseen.output("a");
    expect(unseen.forget("a")).toBe(true);
    expect(unseen.forget("a")).toBe(false);
    expect(unseen.ids()).toEqual([]);
  });
});
