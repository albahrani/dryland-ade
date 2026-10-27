import { checkProse } from "./content-rules.ts";
import { WriteFailure } from "./documents.ts";
import { DrylandError } from "./errors.ts";
import {
  type AuthorKind,
  type LifecycleChange,
  type StoreState,
  type StoreTicket,
  toTicket,
  writeToStore,
} from "./state-store.ts";
import type { Ticket, TriageRole } from "./ticket.ts";
import { findTicket, parseTicketReference, type TicketReference } from "./tickets.ts";
import { assertBlockChange, assertCanTriage, resolveTriageRole } from "./ticket-rules.ts";

// The ticket lifecycle writes on the state store: each rule is checked against the state at the head the event is
// appended to, so of several racing writers one decision wins.

export interface StoreWriteOptions {
  author: AuthorKind;
}

export interface StoreWriteResult {
  ticket: Ticket;
  warnings: string[];
  /** Whether an event was appended; `false` when the ticket already was as asked. */
  written: boolean;
}

const nameOf = (t: StoreTicket) => `${t.effort}/${t.id}`;

function locate(state: StoreState, wanted: TicketReference): StoreTicket {
  const found = findTicket(state.tickets.map(toTicket), wanted);
  return state.tickets.find((t) => t.effort === found.map && t.id === found.id) as StoreTicket;
}

/**
 * Finds the ticket, lets `decide` check the rules against it and name the change (or `null` for none), and appends it.
 * Both happen against the state at the head the event is applied to, so of several racing writers one decision wins.
 */
async function change(
  cwd: string,
  reference: string,
  opts: StoreWriteOptions,
  decide: (ticket: StoreTicket, state: StoreState) => LifecycleChange | null,
  wanted: TicketReference = parseTicketReference(reference),
): Promise<StoreWriteResult> {
  const done = await writeToStore(
    cwd,
    (state) => {
      const ticket = locate(state, wanted);
      const draft = decide(ticket, state);
      return {
        diagnostics: [],
        subject: nameOf(ticket),
        event: draft === null ? null : { ...draft, effort: ticket.effort, id: ticket.id },
      };
    },
    { author: opts.author },
  );
  const [effort = "", id = ""] = done.subject.split("/");
  const ticket = done.state.tickets.find((t) => t.effort === effort && t.id === id) as StoreTicket;
  return { ticket: toTicket(ticket), warnings: [], written: done.written };
}

/** Claims an open ticket for `holder` (a branch). Of several concurrent claims exactly one wins. */
export async function claimStoreTicket(
  cwd: string,
  reference: string,
  opts: StoreWriteOptions & { holder: string; session?: string | null },
): Promise<StoreWriteResult & { alreadyHeld: boolean }> {
  const result = await change(cwd, reference, opts, (ticket) => {
    const name = nameOf(ticket);
    if (ticket.status === "claimed" && ticket.claim?.holder === opts.holder) return null;
    if (ticket.status === "claimed") {
      const holder = ticket.claim?.holder ?? "someone";
      const since = ticket.claim?.at;
      throw new DrylandError(
        `Ticket ${name} is already claimed by ${holder}${since === undefined ? "" : ` since ${since}`}.`,
        `Pick another ticket with \`dryland map frontier ${ticket.effort}\`, or ask ${holder} to release it.`,
      );
    }
    if (ticket.status === "resolved") {
      throw new DrylandError(
        `Ticket ${name} is already resolved.`,
        `Pick another ticket with \`dryland map frontier ${ticket.effort}\`.`,
      );
    }
    return { kind: "ticket.claimed", holder: opts.holder, session: opts.session ?? null };
  });
  return { ...result, alreadyHeld: !result.written };
}

/** Releases a claimed ticket. */
export function releaseStoreTicket(cwd: string, reference: string, opts: StoreWriteOptions): Promise<StoreWriteResult> {
  return change(cwd, reference, opts, (ticket) => {
    if (ticket.status !== "claimed") {
      throw new DrylandError(
        `Ticket ${nameOf(ticket)} is not claimed, so there is nothing to release.`,
        `Run \`dryland ticket show ${nameOf(ticket)}\` to see its state.`,
      );
    }
    return { kind: "ticket.released" };
  });
}

/** The gates on an agent's resolve: it holds the claim, and it has not resolved another ticket in this session. */
function assertSessionMayResolve(ticket: StoreTicket, state: StoreState, session: string, holder: string | null): void {
  const name = nameOf(ticket);
  const claim = ticket.claim;
  if (claim === null || (claim.session !== session && (holder === null || claim.holder !== holder))) {
    throw new DrylandError(
      claim === null
        ? `Ticket ${name} is not claimed, so this session cannot resolve it.`
        : `Ticket ${name} is claimed by ${claim.holder}, not by this session.`,
      `Claim it first with \`dryland ticket claim ${name}\`, or pick one this session holds.`,
    );
  }
  if (ticket.type === "research") return;
  const earlier = state.tickets.find((t) => t.resolvedBy === session && t.type !== "research");
  if (earlier !== undefined) {
    throw new DrylandError(
      `This session already resolved ${nameOf(earlier)}; a session resolves one ticket.`,
      "Leave this ticket claimed and start a new session for it, or ask a person to resolve it.",
    );
  }
}

/**
 * Records the solution summary, marks the ticket resolved and drops its claim; with `amend`, replaces the summary of a
 * resolved one. A caller with a session id (an agent) must hold the claim and resolves one ticket per session, research
 * excepted; a caller without one (a person) is not gated. The summary stays within its cap and passes lint.
 */
export function resolveStoreTicket(
  cwd: string,
  reference: string,
  answer: string,
  opts: StoreWriteOptions & { amend?: boolean; session?: string | null; holder?: string | null },
): Promise<StoreWriteResult> {
  const wanted = parseTicketReference(reference);
  const text = answer.trim();
  if (text === "") {
    throw new DrylandError("A resolution needs an answer.", 'Pass it as --answer "<what was decided or done>".');
  }
  return change(
    cwd,
    reference,
    opts,
    (ticket, state) => {
      const name = nameOf(ticket);
      const problems = checkProse("answer", "summary", text);
      if (problems.length > 0) throw new WriteFailure("check", problems);
      if (opts.amend === true) {
        if (ticket.status !== "resolved") {
          throw new DrylandError(
            `Ticket ${name} is not resolved, so there is no answer to amend.`,
            `Resolve it with \`dryland ticket resolve ${name} --answer <text>\`.`,
          );
        }
        return { kind: "ticket.answer-amended", answer: text };
      }
      if (ticket.status === "resolved") {
        throw new DrylandError(
          `Ticket ${name} is already resolved.`,
          `Add --amend to replace its answer, add a comment, or pick another ticket with \`dryland map frontier ${ticket.effort}\`.`,
        );
      }
      const session = opts.session ?? null;
      if (session !== null) assertSessionMayResolve(ticket, state, session, opts.holder ?? null);
      return { kind: "ticket.resolved", answer: text, session };
    },
    wanted,
  );
}

/** Ticks the nth acceptance criterion. */
export function tickStoreTicket(
  cwd: string,
  reference: string,
  criterion: number,
  opts: StoreWriteOptions,
): Promise<StoreWriteResult> {
  const wanted = parseTicketReference(reference);
  if (!Number.isInteger(criterion) || criterion < 1) {
    throw new DrylandError(
      `"${criterion}" is not a criterion number.`,
      "Pass --criterion with the 1-based position of the box, e.g. --criterion 2.",
    );
  }
  return change(
    cwd,
    reference,
    opts,
    (ticket) => {
      const name = nameOf(ticket);
      if (ticket.criteria.length === 0) {
        throw new DrylandError(`Ticket ${name} has no acceptance criteria list to tick.`, "Add a comment instead.");
      }
      if (criterion > ticket.criteria.length) {
        throw new DrylandError(
          `Ticket ${name} has ${ticket.criteria.length} acceptance criteria, so ${criterion} is out of range.`,
          `Pass --criterion between 1 and ${ticket.criteria.length}.`,
        );
      }
      if (ticket.criteria[criterion - 1]?.done === true) {
        throw new DrylandError(
          `Criterion ${criterion} of ${name} is already ticked.`,
          `Tick one that is still open; run \`dryland ticket show ${name}\` to see the list.`,
        );
      }
      return { kind: "ticket.ticked", criterion };
    },
    wanted,
  );
}

/** Adds and removes blockers, which are numbers of the ticket's own effort. */
export function blockStoreTicket(
  cwd: string,
  reference: string,
  changes: { add?: string[]; remove?: string[] },
  opts: StoreWriteOptions,
): Promise<StoreWriteResult> {
  const wanted = parseTicketReference(reference);
  const toNumber = (ref: string) => parseTicketReference(ref).number;
  const add = (changes.add ?? []).map(toNumber);
  const remove = (changes.remove ?? []).map(toNumber);
  if (add.length === 0 && remove.length === 0) {
    throw new DrylandError(
      "Nothing to change: no blocker was given.",
      "Pass --add <number>[,<number>...] and/or --remove <number>[,<number>...].",
    );
  }
  return change(
    cwd,
    reference,
    opts,
    (ticket, state) => {
      const siblings = state.tickets.filter((t) => t.effort === ticket.effort);
      assertBlockChange(
        toTicket(ticket),
        ticket.blockedBy.map(Number),
        new Set(siblings.map((t) => Number(t.id))),
        add,
        remove,
      );
      const pad = (numbers: number[]) => numbers.map((n) => String(n).padStart(ticket.id.length, "0"));
      // Blockers that stay keep their order; new ones follow.
      const blockedBy = [...ticket.blockedBy.filter((id) => !remove.includes(Number(id))), ...pad(add)];
      return { kind: "ticket.blockers-changed", blockedBy };
    },
    wanted,
  );
}

/** Appends a comment; earlier ones are untouched. */
export function commentOnStoreTicket(
  cwd: string,
  reference: string,
  comment: string,
  opts: StoreWriteOptions,
): Promise<StoreWriteResult> {
  const wanted = parseTicketReference(reference);
  const text = comment.trim();
  if (text === "") throw new DrylandError("A comment needs text.", 'Pass it as --text "<comment>".');
  return change(cwd, reference, opts, () => ({ kind: "ticket.commented", text }), wanted);
}

/** Sets the triage role of an open ticket; `labels` is the repo's own vocabulary (see `readTriageLabels`). */
export function triageStoreTicket(
  cwd: string,
  reference: string,
  role: string,
  opts: StoreWriteOptions,
  labels: ReadonlyMap<TriageRole, string> = new Map(),
): Promise<StoreWriteResult> {
  const wanted = parseTicketReference(reference);
  const resolved = resolveTriageRole(labels, role);
  return change(
    cwd,
    reference,
    opts,
    (ticket) => {
      assertCanTriage(toTicket(ticket));
      return { kind: "ticket.triaged", role: resolved };
    },
    wanted,
  );
}
