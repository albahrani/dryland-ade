import { describe, expect, it } from "vitest";
import { isSettingsChange, settingsPatch, type SettingsSnapshot } from "../src/shared/settings-change.ts";

const saved: SettingsSnapshot = {
  dontAsk: { "tracker-metadata": true, "user-config": true },
};

describe("settings changes", () => {
  it("accepts only well-formed changes", () => {
    expect(isSettingsChange({ kind: "stop-confirmation", value: "never" })).toBe(true);
    expect(isSettingsChange({ kind: "reset-confirmation", type: "user-config" })).toBe(true);
    expect(isSettingsChange({ kind: "reset-legend" })).toBe(true);
    expect(isSettingsChange({ kind: "session-retention", value: 14 })).toBe(true);
    expect(isSettingsChange({ kind: "session-retention", value: 0 })).toBe(false);
    expect(isSettingsChange({ kind: "session-retention", value: 1.5 })).toBe(false);

    expect(isSettingsChange({ kind: "resume-on-start", value: "no" })).toBe(false);
    expect(isSettingsChange({ kind: "stop-confirmation", value: "sometimes" })).toBe(false);
    expect(isSettingsChange({ kind: "reset-confirmation", type: "other" })).toBe(false);
    expect(isSettingsChange({ kind: "reset-confirmation", type: "prose-annotation" })).toBe(false);
    expect(isSettingsChange({ kind: "nope" })).toBe(false);
    expect(isSettingsChange(null)).toBe(false);
  });

  it("refuses the auto-commit settings, which the state store has no use for", () => {
    expect(isSettingsChange({ kind: "auto-commit", value: false })).toBe(false);
    expect(isSettingsChange({ kind: "project-auto-commit", value: null })).toBe(false);
  });

  it("resets one confirmation type and leaves the others as they were", () => {
    expect(settingsPatch(saved, { kind: "reset-confirmation", type: "tracker-metadata" })).toEqual({
      dontAsk: { "tracker-metadata": false, "user-config": true },
    });
  });

  it("maps the plain settings and the legend reset to their stored fields", () => {
    expect(settingsPatch(saved, { kind: "resume-on-start", value: true })).toEqual({ resumeOnStart: true });
    expect(settingsPatch(saved, { kind: "stop-confirmation", value: "always" })).toEqual({
      stopConfirmation: "always",
    });
    expect(settingsPatch(saved, { kind: "session-retention", value: 14 })).toEqual({
      sessionRetentionDays: 14,
    });
    expect(settingsPatch(saved, { kind: "reset-legend" })).toEqual({ legendDismissed: false });
  });
});
