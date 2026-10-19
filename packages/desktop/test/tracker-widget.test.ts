import { describe, expect, it } from "vitest";
import { trackerWidgetView } from "../src/shared/tracker-widget.ts";

describe("trackerWidgetView", () => {
  it("offers to reveal the issues folder for local markdown", () => {
    expect(trackerWidgetView({ kind: "local-markdown", lens: false, offDefaultBranch: null })).toEqual({
      label: "Local markdown",
      action: { kind: "reveal-issues", label: "Reveal issues folder" },
      notes: [],
    });
  });

  it.each([
    ["github", "GitHub"],
    ["gitlab", "GitLab"],
  ] as const)("offers to open the %s issues in the browser", (kind, label) => {
    expect(trackerWidgetView({ kind, lens: false, offDefaultBranch: null })).toMatchObject({
      label,
      action: { kind: "open-issues", label: "Open issues in browser" },
    });
  });

  it("warns when the main checkout is off the default branch", () => {
    const view = trackerWidgetView({
      kind: "local-markdown",
      lens: false,
      offDefaultBranch: { current: "feature", defaultBranch: "main" },
    });

    expect(view.notes).toEqual(["The main checkout is on feature, not main: the tickets shown are that branch's."]);
  });

  it("names a detached HEAD", () => {
    const view = trackerWidgetView({
      kind: "local-markdown",
      lens: false,
      offDefaultBranch: { current: null, defaultBranch: "main" },
    });

    expect(view.notes[0]).toContain("a detached HEAD");
  });

  it("says lens mode and best-effort claims for a plain native tracker", () => {
    const view = trackerWidgetView({ kind: "github", lens: true, offDefaultBranch: null });

    expect(view.label).toBe("GitHub (lens mode)");
    expect(view.notes).toEqual(["Lens mode: Dryland reads and launches, and claims are best-effort."]);
  });

  it("has nothing to show without tracker info", () => {
    expect(trackerWidgetView(null)).toEqual({ label: "No tracker", action: null, notes: [] });
  });
});
