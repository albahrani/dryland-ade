import { DrylandError, requireOneLine } from "./errors.ts";
import { issuesDir, lineEnding, parseTicketFile, rewriteStatus, ticketNumbers } from "./local-markdown.ts";
import { assertMapName, readMapFile } from "./map.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { TICKET_TYPES, type TicketType } from "./ticket.ts";
import { currentTicket, parseTicketReference, type TicketWriteResult } from "./tickets.ts";
import { writeTracker, type TrackerWriteOptions } from "./tracker-write.ts";

export interface CreateTicketInput {
  map: string;
  title: string;
  type: string;
  question?: string;
  /** Ticket numbers of the same map, as written by the user (`1`, `02`). */
  blockedBy?: string[];
}

const SLUG_LENGTH = 50;

function slugOf(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_LENGTH)
    .replace(/-+$/, "");
  return slug === "" ? "ticket" : slug;
}

/** Everything is checked before the lock is taken, so a bad request never touches the tracker. */
function validate(input: CreateTicketInput): { type: TicketType; title: string } {
  assertMapName(input.map);
  const title = requireOneLine("ticket title", input.title, "title", "<short title>");
  const type = TICKET_TYPES.find((known) => known === input.type.toLowerCase());
  if (type === undefined) {
    throw new DrylandError(
      `"${input.type}" is not a ticket type.`,
      `Use --type with one of: ${TICKET_TYPES.join(", ")}.`,
    );
  }
  return { type, title };
}

/** Creates the next numbered ticket of a map, in the default skill format, and commits only that file. */
export async function createTicket(
  runner: ProcessRunner,
  cwd: string,
  input: CreateTicketInput,
  options: TrackerWriteOptions = {},
): Promise<TicketWriteResult> {
  const { type, title } = validate(input);
  const { value, warnings } = await writeTracker(runner, cwd, options, async (mainCheckout) => {
    await readMapFile(mainCheckout, input.map); // fails with the next action when the map is unknown

    // Read under the lock: the next number must not rest on a read made before another writer finished.
    const numbers = await ticketNumbers(mainCheckout, input.map);
    const next = Math.max(0, ...numbers.map(Number)) + 1;
    const id = String(next).padStart(Math.max(2, ...numbers.map((n) => n.length)), "0");

    const known = new Set(numbers.map(Number));
    const blockers = (input.blockedBy ?? []).map((reference) => {
      const number = parseTicketReference(reference).number;
      if (!known.has(number)) {
        throw new DrylandError(
          `Ticket ${input.map}/${reference} does not exist, so it cannot block the new ticket.`,
          `Run \`dryland ticket list\` and pass existing numbers of ${input.map} to --blocked-by.`,
        );
      }
      return String(number).padStart(id.length, "0");
    });

    const header = [`# ${title}`, "", `Type: ${type}`];
    if (blockers.length > 0) header.push(`Blocked by: ${blockers.join(", ")}`);
    const question = (input.question ?? "").trim();
    const content = `${[...header, ...(question === "" ? [] : ["", "## Question", "", question])].join("\n")}\n`;
    const path = `${issuesDir(input.map)}/${id}-${slugOf(title)}.md`;

    return {
      changes: [{ path, content }],
      message: `Create ticket ${input.map}/${id}: ${title}`,
      value: parseTicketFile(input.map, id, content),
    };
  });
  return { ticket: value, warnings };
}

/** Records the answer, marks the ticket resolved and drops its claim. Never touches worktrees or branches. */
export async function resolveTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  answer: string,
  options: TrackerWriteOptions = {},
): Promise<TicketWriteResult> {
  const wanted = parseTicketReference(reference);
  const text = answer.trim();
  if (text === "") {
    throw new DrylandError("A resolution needs an answer.", 'Pass it as --answer "<what was decided or done>".');
  }
  const { value, warnings } = await writeTracker(runner, cwd, options, async (mainCheckout) => {
    const { ticket, path, text: file } = await currentTicket(mainCheckout, wanted);
    const name = `${ticket.map}/${ticket.id}`;
    if (ticket.state === "resolved") {
      throw new DrylandError(
        `Ticket ${name} is already resolved.`,
        `Add a comment instead, or pick another ticket with \`dryland map frontier ${ticket.map}\`.`,
      );
    }
    const eol = lineEnding(file);
    const body = rewriteStatus(file, { resolve: true }).replace(/\s+$/, "");
    const answerText = text.replace(/\r?\n/g, eol);
    // A template may already carry an empty `## Answer` heading; fill that rather than adding a second one.
    const stub = /^## Answer[ \t]*(?:\r?\n)*(?=## |$)/m;
    const content = stub.test(body)
      ? `${body.replace(stub, `## Answer${eol}${eol}${answerText}${eol}${eol}`).replace(/\s+$/, "")}${eol}`
      : `${body}${eol}${eol}## Answer${eol}${eol}${answerText}${eol}`;
    return {
      changes: [{ path, content }],
      message: `Resolve ${name}`,
      value: { ...ticket, state: "resolved" as const, claimant: null, answer: text },
    };
  });
  return { ticket: value, warnings };
}
