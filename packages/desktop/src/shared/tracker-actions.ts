import type { TicketRef, TriageRole } from "@dryland/core";
import { ticketKey } from "./tabs.ts";

/**
 * A tracker write the app can make, always through `dryland`. Started from a ticket's own tab it runs at once; from
 * a general button, such as a row of the Tickets view, it asks for confirmation first.
 */
export type TicketAction =
  | { kind: "claim"; ticket: TicketRef }
  | { kind: "release"; ticket: TicketRef }
  | { kind: "resolve"; ticket: TicketRef; answer: string }
  | { kind: "unblock"; ticket: TicketRef; blocker: string }
  | { kind: "create"; ticket: NewTicket }
  /** Creates an effort's map record; only a state store has one to create. */
  | { kind: "create-map"; map: NewMap };

/** A map as the New map dialog describes it: the effort slug, a title and the destination. */
export interface NewMap {
  map: string;
  title: string;
  destination: string;
}

/** The ticket types `dryland ticket create` takes; core's `TICKET_TYPES`, kept here because this runs in the renderer. */
export const CREATE_TYPES = ["research", "prototype", "grilling", "task"] as const;
export type CreateType = (typeof CREATE_TYPES)[number];

/** A ticket as the New ticket dialog describes it, before `dryland` numbers it. */
export interface NewTicket {
  map: string;
  title: string;
  type: CreateType;
  /** Left out of the command when empty. */
  question: string;
  /** Numbers of tickets on the same map. */
  blockedBy: string[];
  /** A triage role to start in; left out of the command when absent. */
  status?: CreateStatus;
}

/** The triage roles `--status` takes; core's `TRIAGE_ROLES`, kept here because this runs in the renderer. */
export const CREATE_STATUSES = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
] as const satisfies readonly TriageRole[];
export type CreateStatus = (typeof CREATE_STATUSES)[number];

/** Where an action was started: a ticket's own actions never ask, a general button does. */
export type ActionSource = "ticket" | "general-button";

/**
 * The kinds of confirmed write, each with its own "do not ask again" flag. `tracker-metadata` and `user-config` are
 * asked for so far; `prose-annotation` is kept so the Settings dialog can show and reset it.
 */
export const CONFIRMATION_TYPES = ["tracker-metadata", "user-config", "prose-annotation"] as const;
export type ConfirmationType = (typeof CONFIRMATION_TYPES)[number];
export const isConfirmationType = (value: unknown): value is ConfirmationType =>
  CONFIRMATION_TYPES.includes(value as ConfirmationType);

/** How a confirmation type reads in "Don't ask again for ...". */
export const CONFIRMATION_LABELS: Record<ConfirmationType, string> = {
  "tracker-metadata": "tracker metadata writes from a button",
  "user-config": "Dryland-owned user-config writes",
  "prose-annotation": "prose annotations",
};

/** The "do not ask again" flag of each confirmation type; `true` means it is no longer asked. */
export type DontAsk = Record<ConfirmationType, boolean>;
export const ASK_ALWAYS: DontAsk = { "tracker-metadata": false, "user-config": false, "prose-annotation": false };

/**
 * The `dryland` arguments of an action, saying whether to commit, so the app's setting wins over git's. On a state
 * store a create takes one document on stdin (see `trackerInput`) and there is nothing to commit.
 */
export function trackerArgs(action: TicketAction, autoCommit: boolean, store = false): string[] {
  if (action.kind === "create-map") return ["map", "create"];
  if (action.kind === "create" && store) return ["ticket", "create"];
  const args = ((): string[] => {
    switch (action.kind) {
      case "claim":
      case "release":
        return ["ticket", action.kind, ticketKey(action.ticket)];
      case "resolve":
        return ["ticket", "resolve", ticketKey(action.ticket), "--answer", action.answer];
      case "unblock":
        return ["ticket", "block", ticketKey(action.ticket), "--remove", action.blocker];
      case "create": {
        const { map, title, type, question, blockedBy, status } = action.ticket;
        return [
          "ticket",
          "create",
          "--map",
          map,
          "--title",
          title,
          "--type",
          type,
          ...(question === "" ? [] : ["--question", question]),
          ...(blockedBy.length === 0 ? [] : ["--blocked-by", blockedBy.join(",")]),
          ...(status === undefined ? [] : ["--status", status]),
        ];
      }
    }
  })();
  return [...args, autoCommit ? "--commit" : "--no-commit"];
}

/** The JSON document an action sends on stdin, or `null` when it sends none. */
export function trackerInput(action: TicketAction, store: boolean): string | null {
  if (action.kind === "create-map") {
    const { map, title, destination } = action.map;
    return JSON.stringify({ effort: map, title, ...(destination === "" ? {} : { destination }) });
  }
  if (action.kind !== "create" || !store) return null;
  const { map, title, type, question, blockedBy, status } = action.ticket;
  return JSON.stringify({
    effort: map,
    title,
    type,
    ...(question === "" ? {} : { report: question }),
    ...(blockedBy.length === 0 ? {} : { blockedBy: blockedBy.map((id) => `${map}/${id}`) }),
    ...(status === undefined ? {} : { triageRole: status }),
  });
}

/** A command that reads a document from stdin, as it would be typed, for a confirmation to name exactly. */
export function commandWithInput(args: string[], input: string): string {
  return `${commandLine(args)} < ${input}`;
}

/** A `dryland` command as it would be typed, for a confirmation to name exactly. */
export function commandLine(args: string[]): string {
  const quote = (arg: string) => (/^[\w./:=@,-]+$/.test(arg) ? arg : `"${arg.replace(/(["\\])/g, "\\$1")}"`);
  return ["dryland", ...args].map(quote).join(" ");
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
// Never starts with `-`, so nothing from the renderer is read as a `dryland` option.
export const MAP_NAME = /^\w[\w.-]*$/;
const NUMBER = /^\d+$/;

export const isTicketRef = (value: unknown): value is TicketRef =>
  isRecord(value) &&
  typeof value.map === "string" &&
  MAP_NAME.test(value.map) &&
  typeof value.id === "string" &&
  NUMBER.test(value.id);

/** Whether `value`, which came from the renderer, is a well-formed ticket action. */
export function isTicketAction(value: unknown): value is TicketAction {
  if (isRecord(value) && value.kind === "create") return isNewTicket(value.ticket);
  if (isRecord(value) && value.kind === "create-map") return isNewMap(value.map);
  if (!isRecord(value) || !isTicketRef(value.ticket)) return false;
  switch (value.kind) {
    case "claim":
    case "release":
      return true;
    case "resolve":
      return typeof value.answer === "string";
    case "unblock":
      return typeof value.blocker === "string" && NUMBER.test(value.blocker);
    default:
      return false;
  }
}

function isNewMap(value: unknown): value is NewMap {
  return (
    isRecord(value) &&
    typeof value.map === "string" &&
    MAP_NAME.test(value.map) &&
    typeof value.title === "string" &&
    value.title.trim() !== "" &&
    typeof value.destination === "string"
  );
}

function isNewTicket(value: unknown): value is NewTicket {
  return (
    isRecord(value) &&
    typeof value.map === "string" &&
    MAP_NAME.test(value.map) &&
    typeof value.title === "string" &&
    value.title.trim() !== "" &&
    CREATE_TYPES.includes(value.type as CreateType) &&
    typeof value.question === "string" &&
    (value.status === undefined || CREATE_STATUSES.includes(value.status as CreateStatus)) &&
    Array.isArray(value.blockedBy) &&
    value.blockedBy.every((n) => typeof n === "string" && NUMBER.test(n))
  );
}

export interface AutoCommitSettings {
  /** Whether tracker writes from the app are committed, unless a project says otherwise. */
  autoCommit: boolean;
  /** Per-project overrides, by project path. */
  projectAutoCommit: Record<string, boolean>;
}

/** Whether the app's tracker writes in `project` are committed: its override if it has one, else the global setting. */
export function autoCommitFor(settings: AutoCommitSettings, project: string): boolean {
  return settings.projectAutoCommit[project] ?? settings.autoCommit;
}
