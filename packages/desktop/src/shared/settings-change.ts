import { isRecord, isConfirmationType, type ConfirmationType, type DontAsk } from "./tracker-actions.ts";
import { isStopConfirmation, type StopConfirmation } from "./stop-session.ts";

/** Whether `value` is a usable retention period: a positive whole number of days. */
export const isRetentionDays = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/** A change the Settings dialog asks for; the main process validates it and applies it to the stored settings. */
export type SettingsChange =
  | { kind: "resume-on-start"; value: boolean }
  | { kind: "stop-confirmation"; value: StopConfirmation }
  /** Days a session stays in the session index after it was last seen. */
  | { kind: "session-retention"; value: number }
  | { kind: "reset-confirmation"; type: ConfirmationType }
  | { kind: "reset-legend" };

/** The stored settings a change reads before it writes. */
export interface SettingsSnapshot {
  dontAsk: DontAsk;
}

/** The stored fields a change sets. */
export interface SettingsPatch extends Partial<SettingsSnapshot> {
  resumeOnStart?: boolean;
  stopConfirmation?: StopConfirmation;
  sessionRetentionDays?: number;
  legendDismissed?: boolean;
}

/** Whether `value`, which came from the renderer, is a well-formed settings change. */
export function isSettingsChange(value: unknown): value is SettingsChange {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "resume-on-start":
      return typeof value.value === "boolean";
    case "stop-confirmation":
      return isStopConfirmation(value.value);
    case "session-retention":
      return isRetentionDays(value.value);
    case "reset-confirmation":
      return isConfirmationType(value.type);
    case "reset-legend":
      return true;
    default:
      return false;
  }
}

/** The stored fields `change` sets. */
export function settingsPatch(saved: SettingsSnapshot, change: SettingsChange): SettingsPatch {
  switch (change.kind) {
    case "resume-on-start":
      return { resumeOnStart: change.value };
    case "stop-confirmation":
      return { stopConfirmation: change.value };
    case "session-retention":
      return { sessionRetentionDays: change.value };
    case "reset-legend":
      return { legendDismissed: false };
    case "reset-confirmation":
      return { dontAsk: { ...saved.dontAsk, [change.type]: false } };
  }
}
