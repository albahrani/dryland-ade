import { isRecord, isConfirmationType, type ConfirmationType, type DontAsk } from "./tracker-actions.ts";
import { isStopConfirmation, type StopConfirmation } from "./stop-session.ts";

/** Whether `value` is a usable retention period: a positive whole number of days. */
export const isRetentionDays = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/** A change the Settings dialog asks for; the main process validates it and applies it to the stored settings. */
export type SettingsChange =
  | { kind: "auto-commit"; value: boolean }
  /** The open project's auto-commit override; `null` clears it so the global setting applies again. */
  | { kind: "project-auto-commit"; value: boolean | null }
  /** Whether a session's pre-typed command is submitted. */
  | { kind: "auto-submit"; value: boolean }
  /** The open project's auto-submit override; `null` clears it so the global setting applies again. */
  | { kind: "project-auto-submit"; value: boolean | null }
  | { kind: "resume-on-start"; value: boolean }
  | { kind: "stop-confirmation"; value: StopConfirmation }
  /** Days a session stays in the session index after it was last seen. */
  | { kind: "session-retention"; value: number }
  | { kind: "reset-confirmation"; type: ConfirmationType }
  | { kind: "reset-legend" };

/** The stored settings a change reads before it writes. */
export interface SettingsSnapshot {
  projectAutoCommit: Record<string, boolean>;
  projectAutoSubmit: Record<string, boolean>;
  dontAsk: DontAsk;
}

/** The stored fields a change sets. */
export interface SettingsPatch extends Partial<SettingsSnapshot> {
  autoCommit?: boolean;
  autoSubmit?: boolean;
  resumeOnStart?: boolean;
  stopConfirmation?: StopConfirmation;
  sessionRetentionDays?: number;
  legendDismissed?: boolean;
}

/** Whether `value`, which came from the renderer, is a well-formed settings change. */
export function isSettingsChange(value: unknown): value is SettingsChange {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "auto-commit":
    case "auto-submit":
    case "resume-on-start":
      return typeof value.value === "boolean";
    case "project-auto-commit":
    case "project-auto-submit":
      return typeof value.value === "boolean" || value.value === null;
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

/** The stored fields `change` sets; `project` is the open project's path, `null` when none is open. */
export function settingsPatch(saved: SettingsSnapshot, change: SettingsChange, project: string | null): SettingsPatch {
  switch (change.kind) {
    case "auto-commit":
      return { autoCommit: change.value };
    case "auto-submit":
      return { autoSubmit: change.value };
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
    case "project-auto-submit": {
      if (project === null) return {};
      const overrides = { ...saved.projectAutoSubmit };
      if (change.value === null) delete overrides[project];
      else overrides[project] = change.value;
      return { projectAutoSubmit: overrides };
    }
    case "project-auto-commit": {
      if (project === null) return {};
      const overrides = { ...saved.projectAutoCommit };
      if (change.value === null) delete overrides[project];
      else overrides[project] = change.value;
      return { projectAutoCommit: overrides };
    }
  }
}

export interface AutoSubmitSettings {
  /** Whether a pre-typed command is submitted, unless a project says otherwise. */
  autoSubmit: boolean;
  /** Per-project overrides, by project path. */
  projectAutoSubmit: Record<string, boolean>;
}

/** Whether the pre-typed command is submitted in `project`: its override if it has one, else the global setting. */
export function autoSubmitFor(settings: AutoSubmitSettings, project: string): boolean {
  return settings.projectAutoSubmit[project] ?? settings.autoSubmit;
}
