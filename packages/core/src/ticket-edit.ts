import { DrylandError } from "./errors.ts";
import { appendComment, rewriteBlockedBy, rewriteStatus } from "./local-markdown.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { currentTicket, parseTicketReference, readTickets, type TicketWriteResult } from "./tickets.ts";
import { remoteBackend } from "./tracker-backend.ts";
import { assertBlockChange, assertCanTriage, resolveTriageRole } from "./tracker-rules.ts";
import { writeTracker, type TrackerWriteOptions } from "./tracker-write.ts";
import { readTriageLabels } from "./triage-labels.ts";

export interface BlockChange {
  /** Ticket numbers of the same map to start being blocked by, as written by the user (`1`, `02`). */
  add?: string[];
  /** Ticket numbers to stop being blocked by. */
  remove?: string[];
}

const toNumber = (reference: string): number => parseTicketReference(reference).number;

/** Adds and removes the blockers of a ticket by rewriting its `Blocked by:` line. */
export async function blockTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  change: BlockChange,
  options: TrackerWriteOptions = {},
): Promise<TicketWriteResult> {
  const wanted = parseTicketReference(reference);
  const add = (change.add ?? []).map(toNumber);
  const remove = (change.remove ?? []).map(toNumber);
  if (add.length === 0 && remove.length === 0) {
    throw new DrylandError(
      "Nothing to change: no blocker was given.",
      "Pass --add <number>[,<number>...] and/or --remove <number>[,<number>...].",
    );
  }
  const remote = await remoteBackend(runner, cwd);
  if (remote !== null) {
    return remote.backend.block(runner, remote.checkout, reference, {
      add: change.add ?? [],
      remove: change.remove ?? [],
    });
  }
  const { value, warnings } = await writeTracker(runner, cwd, options, async (mainCheckout) => {
    const { ticket, path, text } = await currentTicket(mainCheckout, wanted);
    const name = `${ticket.map}/${ticket.id}`;
    if (ticket.blockers === "unknown") {
      throw new DrylandError(
        `Ticket ${name} has a Blocked by: line dryland cannot read, so it will not rewrite it.`,
        `Edit the Blocked by: line of ${path} by hand into ticket numbers like "01, 02", then retry.`,
      );
    }
    const siblings = (await readTickets(mainCheckout)).filter((t) => t.map === ticket.map);
    assertBlockChange(ticket, ticket.blockers.map(Number), new Set(siblings.map((t) => Number(t.id))), add, remove);

    const width = ticket.id.length;
    const pad = (numbers: number[]) => numbers.map((number) => String(number).padStart(width, "0"));
    // Blockers that stay keep their order and spelling; new ones follow.
    const blockers = [...ticket.blockers.filter((id) => !remove.includes(Number(id))), ...pad(add)];
    const parts = [
      ...(add.length > 0 ? [`Block ${name} by ${pad(add).join(", ")}`] : []),
      ...(remove.length > 0 ? [`Unblock ${name} from ${pad(remove).join(", ")}`] : []),
    ];
    return {
      changes: [{ path, content: rewriteBlockedBy(text, blockers) }],
      message: parts.join("; "),
      value: { ...ticket, blockers },
    };
  });
  return { ticket: value, warnings };
}

/** Appends a comment under the ticket's `## Comments` heading, creating it when missing; earlier ones are untouched. */
export async function commentOnTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  comment: string,
  options: TrackerWriteOptions = {},
): Promise<TicketWriteResult> {
  const wanted = parseTicketReference(reference);
  const text = comment.trim();
  if (text === "") {
    throw new DrylandError("A comment needs text.", 'Pass it as --text "<comment>".');
  }
  const remote = await remoteBackend(runner, cwd);
  if (remote !== null) return remote.backend.comment(runner, remote.checkout, reference, text);
  if (/^## /m.test(text)) {
    throw new DrylandError(
      'A comment cannot contain a line starting with "## ", because that would open a new section.',
      'Indent the line or use a "###" heading.',
    );
  }
  const { value, warnings } = await writeTracker(runner, cwd, options, async (mainCheckout) => {
    const { ticket, path, text: file } = await currentTicket(mainCheckout, wanted);
    const name = `${ticket.map}/${ticket.id}`;
    return {
      changes: [{ path, content: appendComment(file, text) }],
      message: `Comment on ${name}`,
      value: { ...ticket, comments: [...ticket.comments, text] },
    };
  });
  return { ticket: value, warnings };
}

/** Sets the ticket's triage role, writing the label string the repo's triage-labels doc gives that role. */
export async function triageTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  role: string,
  options: TrackerWriteOptions = {},
): Promise<TicketWriteResult> {
  const wanted = parseTicketReference(reference);
  const remote = await remoteBackend(runner, cwd);
  if (remote !== null) return remote.backend.triage(runner, remote.checkout, reference, role);
  const { value, warnings } = await writeTracker(runner, cwd, options, async (mainCheckout) => {
    const labels = await readTriageLabels(mainCheckout);
    const resolved = resolveTriageRole(labels, role);
    const { ticket, path, text } = await currentTicket(mainCheckout, wanted);
    const name = `${ticket.map}/${ticket.id}`;
    assertCanTriage(ticket);
    const label = labels.get(resolved) ?? resolved;
    return {
      changes: [{ path, content: rewriteStatus(text, { set: label }) }],
      message: `Triage ${name} as ${resolved}`,
      value: { ...ticket, triageRole: resolved },
    };
  });
  return { ticket: value, warnings };
}
