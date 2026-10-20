import { DrylandError } from "./errors.ts";
import { GITHUB_MAP_LABEL, GITHUB_TYPE_LABEL_PREFIX, type GithubIssue, ghRequired, ghRun } from "./github-backend.ts";
import { appendDecision } from "./local-markdown.ts";
import { type MapModel, parseMap } from "./map.ts";
import type { MapIndexEntry } from "./map-write.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { findTicket, parseTicketReference, readTickets, type TicketWriteResult } from "./tickets.ts";
import {
  afterCreate as afterCreateOn,
  assertBlockChange,
  decideClaim,
  assertClaimed,
  assertClaimedBy,
  assertCanResolve,
  assertCanTriage,
  nameOf,
  partlyApplied,
  resolveTriageRole,
  type TrackerCreateInput,
  ticketNamed,
  withAnswer,
} from "./tracker-rules.ts";
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

const me = (runner: ProcessRunner, cwd: string) => ghRun(runner, cwd, ["api", "user", "--jq", ".login"]);

const afterCreate = <T>(number: number, step: string, run: () => Promise<T>) =>
  afterCreateOn("GitHub", number, step, run);

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

/** Creates an issue labelled with its type and makes it a sub-issue of the map's issue. */
export async function createGithubTicket(
  runner: ProcessRunner,
  cwd: string,
  input: TrackerCreateInput,
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
  const verdict = decideClaim(ticket, issue.state.toLowerCase() === "closed", issue.assignees?.[0]?.login, login);
  if (verdict === "held") {
    return { ticket: { ...ticket, state: "claimed", claimant: login }, warnings: [], alreadyHeld: true };
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

/** Clears the user's own assignment of a claimed issue; another user's claim is left alone. */
export async function releaseGithubTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
): Promise<TicketWriteResult> {
  const ticket = await ticketNamed(runner, cwd, reference);
  assertClaimed(ticket);
  const login = await me(runner, cwd);
  assertClaimedBy(ticket, login, "GitHub");
  await ghRun(runner, cwd, ["api", "-X", "DELETE", `${issuePath(ticket.id)}/assignees`, ...text("assignees[]", login)]);
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
  assertCanResolve(ticket, issue.state.toLowerCase() === "closed");
  await ghRun(runner, cwd, [
    "api",
    "-X",
    "PATCH",
    issuePath(ticket.id),
    ...text("body", withAnswer(issue.body, answer)),
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
  assertBlockChange(ticket, current, known, add, remove);

  const path = `${issuePath(ticket.id)}/dependencies/blocked_by`;
  // Read every blocker before the first write, so only a write can leave the change half-applied.
  const addIssues = await Promise.all(add.map((number) => fetchIssue(runner, cwd, number)));
  const removeIssues = await Promise.all(remove.map((number) => fetchIssue(runner, cwd, number)));
  const applied: string[] = [];
  const retry = `Finish with \`dryland ticket block ${nameOf(ticket)}\`.`;
  for (const blocker of addIssues) {
    await partlyApplied(applied, `blocking it by #${blocker.number}`, retry, () =>
      ghRun(runner, cwd, ["api", path, ...integer("issue_id", idOf(blocker))]),
    );
    applied.push(`blocked by #${blocker.number}`);
  }
  for (const blocker of removeIssues) {
    await partlyApplied(applied, `removing the block by #${blocker.number}`, retry, () =>
      ghRun(runner, cwd, ["api", "-X", "DELETE", `${path}/${idOf(blocker)}`]),
    );
    applied.push(`no longer blocked by #${blocker.number}`);
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
  const labels = await readTriageLabels(cwd);
  const resolved = resolveTriageRole(labels, role);
  const ticket = await ticketNamed(runner, cwd, reference);
  assertCanTriage(ticket);
  const label = labels.get(resolved) ?? resolved;
  const vocabulary = await readTriageVocabulary(cwd);
  const issue = await fetchIssue(runner, cwd, ticket.id);
  const stale = (issue.labels ?? [])
    .map((l) => l.name)
    .filter((name) => vocabulary.has(name.toLowerCase()) && name !== label);

  await ghRun(runner, cwd, ["api", `${issuePath(ticket.id)}/labels`, ...text("labels[]", label)]);
  const applied = [`added the label "${label}"`];
  for (const name of stale) {
    await partlyApplied(applied, `removing the label "${name}"`, `Remove the label "${name}" by hand.`, () =>
      ghRun(runner, cwd, ["api", "-X", "DELETE", `${issuePath(ticket.id)}/labels/${encodeURIComponent(name)}`]),
    );
    applied.push(`removed the label "${name}"`);
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
  // The body keeps its own line endings: only the Decisions-so-far part may change.
  const body = appendDecision(issue.body ?? "", `- [${entry.title}](${entry.link}): ${entry.gist}`);
  await ghRun(runner, cwd, ["api", "-X", "PATCH", issuePath(name), ...text("body", body)]);
  return { value: { ...parseMap(name, body), title: issue.title }, warnings: [] };
}
