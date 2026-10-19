import { DrylandError } from "./errors.ts";
import { GITHUB_MAP_LABEL, GITHUB_TYPE_LABEL_PREFIX, type GithubIssue, ghRequired, ghRun } from "./github-backend.ts";
import { appendDecision } from "./local-markdown.ts";
import { type MapModel, parseMap } from "./map.ts";
import type { MapIndexEntry } from "./map-write.ts";
import type { ProcessRunner } from "./process-runner.ts";
import type { Ticket, TicketType, TriageRole } from "./ticket.ts";
import { TRIAGE_ROLES } from "./ticket.ts";
import { findTicket, parseTicketReference, readTickets, type TicketWriteResult } from "./tickets.ts";
import { readTriageLabels, readTriageVocabulary } from "./triage-labels.ts";

/**
 * The write side of the GitHub tracker. Every function makes its changes through `gh` and nothing else: no file is
 * written and no commit is made. Each takes the main checkout that `githubCheckout` found.
 */

const issuePath = (number: number | string) => `repos/{owner}/{repo}/issues/${number}`;

const fetchIssue = (runner: ProcessRunner, cwd: string, number: number | string) =>
  ghRequired(runner, cwd, ["api", issuePath(number)]) as Promise<GithubIssue>;

/** `gh api` field arguments: `-f` sends text, `-F` sends a number. */
const text = (name: string, value: string) => ["-f", `${name}=${value}`];
const integer = (name: string, value: number) => ["-F", `${name}=${value}`];

function idOf(issue: GithubIssue): number {
  if (issue.id === undefined) {
    throw new DrylandError(
      `GitHub returned issue #${issue.number} without an id.`,
      "Retry; if it persists, update gh.",
    );
  }
  return issue.id;
}

async function ticketNamed(runner: ProcessRunner, mainCheckout: string, reference: string): Promise<Ticket> {
  return findTicket(await readTickets(mainCheckout, runner), parseTicketReference(reference));
}

const nameOf = (ticket: Ticket) => `${ticket.map}/${ticket.id}`;

const me = (runner: ProcessRunner, cwd: string) => ghRun(runner, cwd, ["api", "user", "--jq", ".login"]);

/** Runs the steps after an issue was created; a failure says which issue exists, so nothing is claimed as whole. */
async function afterCreate<T>(number: number, step: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof DrylandError)) throw error;
    throw new DrylandError(
      `Issue #${number} was created, but ${step} failed: ${error.message}`,
      `Finish by hand on GitHub, or close #${number} and retry. ${error.nextAction}`,
    );
  }
}

/** Fetches the issue of a map, which must carry the map label. */
async function mapIssue(runner: ProcessRunner, cwd: string, map: string): Promise<GithubIssue> {
  if (!/^\d+$/.test(map)) {
    throw new DrylandError(
      `"${map}" is not a map of the GitHub tracker: maps are named by their issue number.`,
      "Run `dryland ticket list` to see the maps, e.g. 12.",
    );
  }
  const issue = await fetchIssue(runner, cwd, map);
  if (!(issue.labels ?? []).some((label) => label.name === GITHUB_MAP_LABEL)) {
    throw new DrylandError(
      `Issue #${map} is not a map: it has no "${GITHUB_MAP_LABEL}" label.`,
      "Run `dryland ticket list` to see the maps, or start one with /wayfinder.",
    );
  }
  return issue;
}

export interface GithubCreateInput {
  map: string;
  title: string;
  type: TicketType;
  question?: string | undefined;
  blockedBy?: string[] | undefined;
}

/** Creates an issue labelled with its type and makes it a sub-issue of the map's issue. */
export async function createGithubTicket(
  runner: ProcessRunner,
  cwd: string,
  input: GithubCreateInput,
): Promise<TicketWriteResult> {
  await mapIssue(runner, cwd, input.map);
  const siblings = (await readTickets(cwd, runner)).filter((t) => t.map === input.map);
  const blockerIssues = await Promise.all(
    (input.blockedBy ?? []).map(async (reference) => {
      const number = parseTicketReference(reference).number;
      if (!siblings.some((t) => Number(t.id) === number)) {
        throw new DrylandError(
          `Ticket ${input.map}/${reference} does not exist, so it cannot block the new ticket.`,
          `Run \`dryland ticket list\` and pass existing numbers of ${input.map} to --blocked-by.`,
        );
      }
      return fetchIssue(runner, cwd, number);
    }),
  );

  const question = (input.question ?? "").trim();
  const body = question === "" ? "" : `## Question\n\n${question}`;
  const created = (await ghRequired(runner, cwd, [
    "api",
    "repos/{owner}/{repo}/issues",
    ...text("title", input.title),
    ...text("body", body),
    ...(input.type === "none" ? [] : text("labels[]", `${GITHUB_TYPE_LABEL_PREFIX}${input.type}`)),
  ])) as GithubIssue;

  await afterCreate(created.number, `making it a sub-issue of map #${input.map}`, () =>
    ghRun(runner, cwd, ["api", `${issuePath(input.map)}/sub_issues`, ...integer("sub_issue_id", idOf(created))]),
  );
  for (const blocker of blockerIssues) {
    await afterCreate(created.number, `blocking it by #${blocker.number}`, () =>
      ghRun(runner, cwd, [
        "api",
        `${issuePath(created.number)}/dependencies/blocked_by`,
        ...integer("issue_id", idOf(blocker)),
      ]),
    );
  }

  return {
    ticket: {
      id: String(created.number),
      map: input.map,
      title: input.title,
      type: input.type,
      state: "open",
      claimant: null,
      blockers: blockerIssues.map((blocker) => String(blocker.number)),
      triageRole: null,
      body,
      answer: null,
      comments: [],
      raw: { labels: input.type === "none" ? "" : `${GITHUB_TYPE_LABEL_PREFIX}${input.type}`, assignees: "" },
    },
    warnings: [],
  };
}

/** Assigns the issue to the user's own `gh` login; of several concurrent claims the first assignee wins. */
export async function claimGithubTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
): Promise<TicketWriteResult & { alreadyHeld: boolean }> {
  const ticket = await ticketNamed(runner, cwd, reference);
  const issue = await fetchIssue(runner, cwd, ticket.id);
  const login = await me(runner, cwd);
  const holder = issue.assignees?.[0]?.login;
  if (issue.state.toLowerCase() === "closed") {
    throw new DrylandError(
      `Ticket ${nameOf(ticket)} is already resolved.`,
      `Pick another ticket with \`dryland map frontier ${ticket.map}\`.`,
    );
  }
  if (holder === login)
    return { ticket: { ...ticket, state: "claimed", claimant: login }, warnings: [], alreadyHeld: true };
  if (holder !== undefined) {
    throw new DrylandError(
      `Ticket ${nameOf(ticket)} is already claimed by ${holder}.`,
      `Pick another ticket with \`dryland map frontier ${ticket.map}\`, or ask ${holder} to release it.`,
    );
  }
  const assigned = (await ghRequired(runner, cwd, [
    "api",
    `${issuePath(ticket.id)}/assignees`,
    ...text("assignees[]", login),
  ])) as GithubIssue;
  const winner = assigned.assignees?.[0]?.login;
  if (winner !== undefined && winner !== login) {
    await ghRun(runner, cwd, [
      "api",
      "-X",
      "DELETE",
      `${issuePath(ticket.id)}/assignees`,
      ...text("assignees[]", login),
    ]);
    throw new DrylandError(
      `Ticket ${nameOf(ticket)} was claimed by ${winner} at the same moment.`,
      `Pick another ticket with \`dryland map frontier ${ticket.map}\`.`,
    );
  }
  return { ticket: { ...ticket, state: "claimed", claimant: login }, warnings: [], alreadyHeld: false };
}

/** Clears every assignee of a claimed issue. */
export async function releaseGithubTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
): Promise<TicketWriteResult> {
  const ticket = await ticketNamed(runner, cwd, reference);
  if (ticket.state !== "claimed") {
    throw new DrylandError(
      `Ticket ${nameOf(ticket)} is not claimed, so there is nothing to release.`,
      `Run \`dryland ticket show ${nameOf(ticket)}\` to see its state.`,
    );
  }
  const issue = await fetchIssue(runner, cwd, ticket.id);
  const assignees = (issue.assignees ?? []).flatMap((a) => text("assignees[]", a.login));
  await ghRun(runner, cwd, ["api", "-X", "DELETE", `${issuePath(ticket.id)}/assignees`, ...assignees]);
  return { ticket: { ...ticket, state: "open", claimant: null }, warnings: [] };
}

/** Writes the answer under the body's `## Answer` heading, where the read side finds it, and closes the issue. */
export async function resolveGithubTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  answer: string,
): Promise<TicketWriteResult> {
  const ticket = await ticketNamed(runner, cwd, reference);
  const issue = await fetchIssue(runner, cwd, ticket.id);
  if (issue.state.toLowerCase() === "closed") {
    throw new DrylandError(
      `Ticket ${nameOf(ticket)} is already resolved.`,
      `Add a comment instead, or pick another ticket with \`dryland map frontier ${ticket.map}\`.`,
    );
  }
  const body = (issue.body ?? "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
  // A template may already carry an empty `## Answer` heading; fill that rather than adding a second one.
  const stub = /^## Answer[ \t]*\n*(?=## |$)/m;
  const filled = stub.test(body)
    ? body.replace(stub, `## Answer\n\n${answer}\n\n`).replace(/\s+$/, "")
    : `${body}\n\n## Answer\n\n${answer}`.replace(/^\n+/, "");
  await ghRun(runner, cwd, [
    "api",
    "-X",
    "PATCH",
    issuePath(ticket.id),
    ...text("body", `${filled}\n`),
    ...text("state", "closed"),
  ]);
  return { ticket: { ...ticket, state: "resolved", claimant: null, answer }, warnings: [] };
}

export interface GithubBlockChange {
  add: string[];
  remove: string[];
}

/** Adds and removes native "blocked by" dependencies between issues of the same map. */
export async function blockGithubTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  change: GithubBlockChange,
): Promise<TicketWriteResult> {
  const tickets = await readTickets(cwd, runner);
  const ticket = findTicket(tickets, parseTicketReference(reference));
  const name = nameOf(ticket);
  if (ticket.blockers === "unknown") {
    throw new DrylandError(
      `GitHub would not say what blocks ${name}, so dryland will not change its dependencies.`,
      `Check that your gh login can read dependencies of #${ticket.id}, then retry.`,
    );
  }
  const add = change.add.map((r) => parseTicketReference(r).number);
  const remove = change.remove.map((r) => parseTicketReference(r).number);
  const current = ticket.blockers.map(Number);
  const known = new Set(tickets.filter((t) => t.map === ticket.map).map((t) => Number(t.id)));

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

  const path = `${issuePath(ticket.id)}/dependencies/blocked_by`;
  for (const number of add) {
    const blocker = await fetchIssue(runner, cwd, number);
    await ghRun(runner, cwd, ["api", path, ...integer("issue_id", idOf(blocker))]);
  }
  for (const number of remove) {
    const blocker = await fetchIssue(runner, cwd, number);
    await ghRun(runner, cwd, ["api", "-X", "DELETE", `${path}/${idOf(blocker)}`]);
  }
  const blockers = [...ticket.blockers.filter((id) => !remove.includes(Number(id))), ...add.map(String)];
  return { ticket: { ...ticket, blockers }, warnings: [] };
}

/** Adds an issue comment. */
export async function commentOnGithubTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  comment: string,
): Promise<TicketWriteResult> {
  const ticket = await ticketNamed(runner, cwd, reference);
  await ghRun(runner, cwd, ["api", `${issuePath(ticket.id)}/comments`, ...text("body", comment)]);
  return { ticket: { ...ticket, comments: [...ticket.comments, comment] }, warnings: [] };
}

/** Swaps the issue's triage-role label for the one the repo's triage-labels doc gives `role`. */
export async function triageGithubTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  role: string,
): Promise<TicketWriteResult> {
  // A role may be given as the canonical role or as the repo's own label for it.
  const given = role.trim().toLowerCase();
  const labels = await readTriageLabels(cwd);
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
  const ticket = await ticketNamed(runner, cwd, reference);
  if (ticket.state !== "open") {
    throw new DrylandError(
      `Ticket ${nameOf(ticket)} is ${ticket.state}, so it cannot be re-triaged.`,
      ticket.state === "claimed"
        ? `Release it first with \`dryland ticket release ${nameOf(ticket)}\`.`
        : "Create a new ticket for the follow-up work.",
    );
  }
  const label = labels.get(resolved) ?? resolved;
  const vocabulary = await readTriageVocabulary(cwd);
  const issue = await fetchIssue(runner, cwd, ticket.id);
  const stale = (issue.labels ?? [])
    .map((l) => l.name)
    .filter((name) => vocabulary.has(name.toLowerCase()) && name !== label);

  await ghRun(runner, cwd, ["api", `${issuePath(ticket.id)}/labels`, ...text("labels[]", label)]);
  for (const name of stale) {
    await ghRun(runner, cwd, ["api", "-X", "DELETE", `${issuePath(ticket.id)}/labels/${encodeURIComponent(name)}`]);
  }
  return { ticket: { ...ticket, triageRole: resolved }, warnings: [] };
}

/** Appends a context pointer to Decisions-so-far in the map issue's body; the rest of the body is sent back as read. */
export async function indexGithubMap(
  runner: ProcessRunner,
  cwd: string,
  name: string,
  entry: MapIndexEntry,
): Promise<{ value: MapModel; warnings: string[] }> {
  const issue = await mapIssue(runner, cwd, name);
  const body = appendDecision(
    (issue.body ?? "").replace(/\r\n/g, "\n"),
    `- [${entry.title}](${entry.link}): ${entry.gist}`,
  );
  await ghRun(runner, cwd, ["api", "-X", "PATCH", issuePath(name), ...text("body", body)]);
  return { value: { ...parseMap(name, body), title: issue.title }, warnings: [] };
}
