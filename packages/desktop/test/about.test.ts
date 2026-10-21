import { describe, expect, it } from "vitest";
import { ABOUT } from "../src/shared/about.ts";

describe("the About text", () => {
  it("says Dryland is unofficial and community-made, and credits Matt Pocock's skills", () => {
    expect(ABOUT.tagline).toMatch(/unofficial, community-made/i);
    expect(ABOUT.credit).toContain("Matt Pocock");
    expect(ABOUT.credit).toMatch(/skills/i);
  });

  it("uses no Waterworld imagery", () => {
    expect(JSON.stringify(ABOUT)).not.toMatch(/waterworld/i);
  });
});
