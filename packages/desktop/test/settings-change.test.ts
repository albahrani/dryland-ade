import { describe, expect, it } from "vitest";
import {
  autoSubmitFor,
  isSettingsChange,
  settingsPatch,
  type SettingsSnapshot,
} from "../src/shared/settings-change.ts";

const saved: SettingsSnapshot = {
  projectAutoCommit: { "/repos/shop": false, "/repos/blog": true },
  projectAutoSubmit: { "/repos/shop": true },
  dontAsk: { "tracker-metadata": true, "user-config": true, "prose-annotation": false },
};

describe("settings changes", () => {
  it("accepts only well-formed changes", () => {
    expect(isSettingsChange({ kind: "auto-commit", value: false })).toBe(true);
    expect(isSettingsChange({ kind: "project-auto-commit", value: null })).toBe(true);
    expect(isSettingsChange({ kind: "stop-confirmation", value: "never" })).toBe(true);
    expect(isSettingsChange({ kind: "reset-confirmation", type: "user-config" })).toBe(true);
    expect(isSettingsChange({ kind: "reset-legend" })).toBe(true);
    expect(isSettingsChange({ kind: "session-retention", value: 14 })).toBe(true);
    expect(isSettingsChange({ kind: "session-retention", value: 0 })).toBe(false);
    expect(isSettingsChange({ kind: "session-retention", value: 1.5 })).toBe(false);

    expect(isSettingsChange({ kind: "auto-commit", value: "no" })).toBe(false);
    expect(isSettingsChange({ kind: "project-auto-commit", value: undefined })).toBe(false);
    expect(isSettingsChange({ kind: "stop-confirmation", value: "sometimes" })).toBe(false);
    expect(isSettingsChange({ kind: "reset-confirmation", type: "other" })).toBe(false);
    expect(isSettingsChange({ kind: "nope" })).toBe(false);
    expect(isSettingsChange(null)).toBe(false);
  });

  it("sets and clears the open project's auto-commit override without touching other projects", () => {
    expect(settingsPatch(saved, { kind: "project-auto-commit", value: true }, "/repos/shop")).toEqual({
      projectAutoCommit: { "/repos/shop": true, "/repos/blog": true },
    });
    expect(settingsPatch(saved, { kind: "project-auto-commit", value: null }, "/repos/shop")).toEqual({
      projectAutoCommit: { "/repos/blog": true },
    });
  });

  it("ignores a project override when no project is open", () => {
    expect(settingsPatch(saved, { kind: "project-auto-commit", value: true }, null)).toEqual({});
  });

  it("resets one confirmation type and leaves the others as they were", () => {
    expect(settingsPatch(saved, { kind: "reset-confirmation", type: "tracker-metadata" }, null)).toEqual({
      dontAsk: { "tracker-metadata": false, "user-config": true, "prose-annotation": false },
    });
  });

  it("maps the plain settings and the legend reset to their stored fields", () => {
    expect(settingsPatch(saved, { kind: "auto-commit", value: false }, null)).toEqual({ autoCommit: false });
    expect(settingsPatch(saved, { kind: "resume-on-start", value: true }, null)).toEqual({ resumeOnStart: true });
    expect(settingsPatch(saved, { kind: "stop-confirmation", value: "always" }, null)).toEqual({
      stopConfirmation: "always",
    });
    expect(settingsPatch(saved, { kind: "session-retention", value: 14 }, null)).toEqual({
      sessionRetentionDays: 14,
    });
    expect(settingsPatch(saved, { kind: "reset-legend" }, null)).toEqual({ legendDismissed: false });
  });

  it("sets auto-submit globally, and sets and clears the open project's override", () => {
    expect(isSettingsChange({ kind: "auto-submit", value: true })).toBe(true);
    expect(isSettingsChange({ kind: "project-auto-submit", value: null })).toBe(true);
    expect(isSettingsChange({ kind: "auto-submit", value: "yes" })).toBe(false);
    expect(isSettingsChange({ kind: "project-auto-submit", value: undefined })).toBe(false);

    expect(settingsPatch(saved, { kind: "auto-submit", value: true }, null)).toEqual({ autoSubmit: true });
    expect(settingsPatch(saved, { kind: "project-auto-submit", value: false }, "/repos/blog")).toEqual({
      projectAutoSubmit: { "/repos/shop": true, "/repos/blog": false },
    });
    expect(settingsPatch(saved, { kind: "project-auto-submit", value: null }, "/repos/shop")).toEqual({
      projectAutoSubmit: {},
    });
    expect(settingsPatch(saved, { kind: "project-auto-submit", value: true }, null)).toEqual({});
  });

  it("lets a project's auto-submit override win over the global setting, either way", () => {
    const settings = { autoSubmit: false, projectAutoSubmit: { "/repos/shop": true, "/repos/blog": false } };
    expect(autoSubmitFor(settings, "/repos/shop")).toBe(true);
    expect(autoSubmitFor({ ...settings, autoSubmit: true }, "/repos/blog")).toBe(false);
    expect(autoSubmitFor(settings, "/repos/other")).toBe(false);
    expect(autoSubmitFor({ ...settings, autoSubmit: true }, "/repos/other")).toBe(true);
  });
});
