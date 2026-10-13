import { DrylandError } from "./errors.ts";
import { appendComment, rewriteBlockedBy, rewriteStatus } from "./local-markdown.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { TRIAGE_ROLES, type TriageRole } from "./ticket.ts";
import { currentTicket, parseTicketReference, readTickets, type TicketWriteResult } from "./tickets.ts";
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
    const known = new Set(siblings.map((t) => Number(t.id)));
    const current = ticket.blockers.map(Number);

    for (const number of add) {
      if (!known.has(number)) {
        throw new DrylandError(
          `Ticket ${ticket.map}/${number} does not exist, so it cannot block ${name}.`,
          `Run \`dryland ticket list\` and pass existing numbers of ${ticket.map} to --add.`,
        );
      }
      if (number === Number(ticket.id)) {
        throw new DrylandError(`Ticket ${name} cannot block itself.`, "Pass a different ticket number to --add.");
      }
      if (current.includes(number)) {
        throw new DrylandError(
          `Ticket ${name} is already blocked by ${ticket.map}/${number}.`,
          `Run \`dryland ticket show ${name}\` to see its blockers.`,
        );
      }
    }
    for (const number of remove) {
      if (!current.includes(number)) {
        throw new DrylandError(
          `Ticket ${name} is not blocked by ${ticket.map}/${number}, so there is nothing to remove.`,
          `Run \`dryland ticket show ${name}\` to see its blockers.`,
        );
      }
    }

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
  const { value, warnings } = await writeTracker(runner, cwd, options, async (mainCheckout) => {
    // A role may be given as the canonical role or as the repo's own label for it.
    const given = role.trim().toLowerCase();
    const labels = await readTriageLabels(mainCheckout);
    const resolved: TriageRole | undefined =
      TRIAGE_ROLES.find((known) => known === given) ??
      TRIAGE_ROLES.find((known) => labels.get(known)?.toLowerCase() === given);
    if (resolved === undefined) {
      const valid = TRIAGE_ROLES.map((known) => {
        const label = labels.get(known) ?? known;
        return label === known ? known : `${known} (${label})`;
      });
      throw new DrylandError(`"${role}" is not a triage role.`, `Use --role with one of: ${valid.join(", ")}.`);
    }
    const { ticket, path, text } = await currentTicket(mainCheckout, wanted);
    const name = `${ticket.map}/${ticket.id}`;
    if (ticket.state !== "open") {
      throw new DrylandError(
        `Ticket ${name} is ${ticket.state}, so it cannot be re-triaged.`,
        ticket.state === "claimed"
          ? `Release it first with \`dryland ticket release ${name}\`.`
          : "Create a new ticket for the follow-up work.",
      );
    }
    const label = labels.get(resolved) ?? resolved;
    return {
      changes: [{ path, content: rewriteStatus(text, { set: label }) }],
      message: `Triage ${name} as ${resolved}`,
      value: { ...ticket, triageRole: resolved },
    };
  });
  return { ticket: value, warnings };
}
