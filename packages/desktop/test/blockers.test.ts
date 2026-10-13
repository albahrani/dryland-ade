import { describe, expect, it } from "vitest";
import { formatBlockers } from "../src/shared/blockers.ts";

describe("formatBlockers", () => {
  it("lists unresolved blockers", () => {
    expect(formatBlockers(["02", "03"])).toBe("02, 03");
  });

  it("says unknown when the backend cannot report them", () => {
    expect(formatBlockers("unknown")).toBe("unknown");
  });

  it("is null when nothing blocks the ticket", () => {
    expect(formatBlockers([])).toBeNull();
  });
});
