import { DrylandError } from "./errors.ts";
import {
  GITLAB_MAP_LABEL,
  GITLAB_MAP_LABEL_PREFIX,
  GITLAB_TYPE_LABEL_PREFIX,
  type GitlabIssue,
  type GitlabIssueLink,
  glabList,
  glabRequired,
  glabRun,
  hasNativeBlocking,
  PROJECT,
  projectId,
  readBodyBlockers,
  withBodyBlockers,
} from "./gitlab-backend.ts";
import { appendDecision } from "./local-markdown.ts";
import { type MapModel, parseMap } from "./map.ts";
import type { MapIndexEntry } from "./map-write.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { findTicket, parseTicketReference, readTickets, type TicketWriteResult } from "./tickets.ts";
import {
  afterCreate as afterCreateOn,
  assertBlockChange,
  assertCanClaim,
  assertCanRelease,
  assertCanResolve,
  assertCanTriage,
  nameOf,
  resolveTriageRole,
  type TrackerCreateInput,
  ticketNamed,
  withAnswer,
} from "./tracker-rules.ts";
import { readTriageLabels, readTriageVocabulary } from "./triage-labels.ts";

/**
 * The write side of the GitLab tracker. Every function makes its changes through `glab` and nothing else: no file is
 * written and no commit is made. Each takes the main checkout that `remoteBackend` found.
 */

const issuePath = (iid: number | string) => `${PROJECT}/issues/${iid}`;

const fetchIssue = (runner: ProcessRunner, cwd: string, iid: number | string) =>
  glabRequired(runner, cwd, ["api", issuePath(iid)]) as Promise<GitlabIssue>;

/** `glab api` field arguments: `-f` sends text. */
const field = (name: string, value: string) => ["-f", `${name}=${value}`];

const put = (runner: ProcessRunner, cwd: string, iid: number | string, fields: string[]) =>
  glabRequired(runner, cwd, ["api", "-X", "PUT", issuePath(iid), ...fields]) as Promise<GitlabIssue>;

const me = async (runner: ProcessRunner, cwd: string) =>
  (await glabRequired(runner, cwd, ["api", "user"])) as { id: number; username: string };

const afterCreate = <T>(iid: number, step: string, run: () => Promise<T>) =>
  afterCreateOn("GitLab", iid, step, run);

/** Fetches the issue of a map, which must carry the map label. */
async function mapIssue(runner: ProcessRunner, cwd: string, map: string): Promise<GitlabIssue> {
  if (!/^\d+$/.test(map)) {
    throw new DrylandError(
      `"${map}" is not a map of the GitLab tracker: maps are named by their issue number.`,
      "Run `dryland ticket list` to see the maps, e.g. 12.",
    );
  }
  const issue = await fetchIssue(runner, cwd, map);
  if (!(issue.labels ?? []).includes(GITLAB_MAP_LABEL)) {
    throw new DrylandError(
      `Issue #${map} is not a map: it has no "${GITLAB_MAP_LABEL}" label.`,
      "Run `dryland ticket list` to see the maps, or start one with /wayfinder.",
    );
  }
  return issue;
}

const linksPath = (iid: number | string) => `${issuePath(iid)}/links`;

/** Makes `iid` blocked by `blocker` through Premium's issue links. */
async function linkBlocker(runner: ProcessRunner, cwd: string, iid: number, blocker: number): Promise<void> {
  await glabRun(runner, cwd, [
    "api",
    "-X",
    "POST",
    linksPath(iid),
    ...field("target_project_id", String(await projectId(runner, cwd))),
    ...field("target_issue_iid", String(blocker)),
    ...field("link_type", "is_blocked_by"),
  ]);
}

/** Creates an issue labelled with its type and its map. */
export async function createGitlabTicket(
  runner: ProcessRunner,
  cwd: string,
  input: TrackerCreateInput,
): Promise<TicketWriteResult> {
  await mapIssue(runner, cwd, input.map);
  const siblings = (await readTickets(cwd, runner)).filter((t) => t.map === input.map);
  const blockers = (input.blockedBy ?? []).map((reference) => {
    const number = parseTicketReference(reference).number;
    if (!siblings.some((t) => Number(t.id) === number)) {
      throw new DrylandError(
        `Ticket ${input.map}/${reference} does not exist, so it cannot block the new ticket.`,
        `Run \`dryland ticket list\` and pass existing numbers of ${input.map} to --blocked-by.`,
      );
    }
    return number;
  });

  const native = await hasNativeBlocking(runner, cwd);
  const question = (input.question ?? "").trim();
  const sections = question === "" ? "" : `## Question\n\n${question}`;
  // Without Premium the body carries the blockers; `none` says the ticket was checked, so it is not "unknown".
  const description = native ? sections : withBodyBlockers(sections, blockers.map(String));
  const labels = [
    `${GITLAB_MAP_LABEL_PREFIX}${input.map}`,
    ...(input.type === "none" ? [] : [`${GITLAB_TYPE_LABEL_PREFIX}${input.type}`]),
  ];
  const created = (await glabRequired(runner, cwd, [
    "api",
    "-X",
    "POST",
    `${PROJECT}/issues`,
    ...field("title", input.title),
    ...field("description", description),
    ...field("labels", labels.join(",")),
  ])) as GitlabIssue;

  if (native) {
    for (const blocker of blockers) {
      await afterCreate(created.iid, `blocking it by #${blocker}`, () => linkBlocker(runner, cwd, created.iid, blocker));
    }
  }

  return {
    ticket: {
      id: String(created.iid),
      map: input.map,
      title: input.title,
      type: input.type,
      state: "open",
      claimant: null,
      blockers: blockers.map(String),
      triageRole: null,
      body: sections,
      answer: null,
      comments: [],
      raw: { labels: labels.join(", "), assignees: "" },
    },
    warnings: [],
  };
}

/** Assigns the issue to the user's own `glab` login. */
export async function claimGitlabTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
): Promise<TicketWriteResult & { alreadyHeld: boolean }> {
  const ticket = await ticketNamed(runner, cwd, reference);
  const issue = await fetchIssue(runner, cwd, ticket.id);
  const user = await me(runner, cwd);
  const verdict = assertCanClaim(ticket, issue.state === "closed", issue.assignees?.[0]?.username, user.username);
  if (verdict === "held") {
    return { ticket: { ...ticket, state: "claimed", claimant: user.username }, warnings: [], alreadyHeld: true };
  }
  await put(runner, cwd, ticket.id, field("assignee_ids[]", String(user.id)));
  return { ticket: { ...ticket, state: "claimed", claimant: user.username }, warnings: [], alreadyHeld: false };
}

/** Clears the assignee of a claimed issue, when the user holds it. */
export async function releaseGitlabTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
): Promise<TicketWriteResult> {
  const ticket = await ticketNamed(runner, cwd, reference);
  const user = await me(runner, cwd);
  assertCanRelease(ticket, user.username, "GitLab");
  await put(runner, cwd, ticket.id, field("assignee_ids[]", "0"));
  return { ticket: { ...ticket, state: "open", claimant: null }, warnings: [] };
}

/** Writes the answer under the body's `## Answer` heading, where the read side finds it, and closes the issue. */
export async function resolveGitlabTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  answer: string,
): Promise<TicketWriteResult> {
  const ticket = await ticketNamed(runner, cwd, reference);
  const issue = await fetchIssue(runner, cwd, ticket.id);
  assertCanResolve(ticket, issue.state === "closed");
  await put(runner, cwd, ticket.id, [
    ...field("description", withAnswer(issue.description, answer)),
    ...field("state_event", "close"),
  ]);
  return { ticket: { ...ticket, state: "resolved", claimant: null, answer }, warnings: [] };
}

export interface GitlabBlockChange {
  add: string[];
  remove: string[];
}

/**
 * Adds and removes "blocked by" relations between issues of the same map: Premium's issue links when the namespace has
 * them, else the `Blocked by:` line of the body, which a ticket without one is taken to have empty.
 */
export async function blockGitlabTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  change: GitlabBlockChange,
): Promise<TicketWriteResult> {
  const tickets = await readTickets(cwd, runner);
  const ticket = findTicket(tickets, parseTicketReference(reference));
  const name = nameOf(ticket);
  const native = await hasNativeBlocking(runner, cwd);
  const issue = await fetchIssue(runner, cwd, ticket.id);
  const fromBody = readBodyBlockers(issue.description ?? "");

  const current = native ? ticket.blockers : fromBody.line ? fromBody.blockers : [];
  if (current === "unknown") {
    throw new DrylandError(
      native
        ? `GitLab would not say what blocks ${name}, so dryland will not change its links.`
        : `Ticket ${name} has a Blocked by: line dryland cannot read, so it will not rewrite it.`,
      native
        ? `Check that your glab login can read the links of #${ticket.id}, then retry.`
        : `Edit the Blocked by: line of issue #${ticket.id} by hand into issue numbers like "1, 2", then retry.`,
    );
  }
  const add = change.add.map((r) => parseTicketReference(r).number);
  const remove = change.remove.map((r) => parseTicketReference(r).number);
  const known = new Set(tickets.filter((t) => t.map === ticket.map).map((t) => Number(t.id)));
  assertBlockChange(ticket, current.map(Number), known, add, remove);

  const blockers = [...current.filter((id) => !remove.includes(Number(id))), ...add.map(String)];
  if (native) {
    for (const number of add) await linkBlocker(runner, cwd, Number(ticket.id), number);
    if (remove.length > 0) {
      const links = await glabList<GitlabIssueLink>(runner, cwd, linksPath(ticket.id));
      for (const number of remove) {
        const link = links.find((l) => l.iid === number && l.link_type === "is_blocked_by");
        if (link?.issue_link_id === undefined) {
          throw new DrylandError(
            `GitLab has no "is blocked by" link from ${name} to #${number} to remove.`,
            `Run \`dryland ticket show ${name}\` to see its blockers.`,
          );
        }
        await glabRun(runner, cwd, ["api", "-X", "DELETE", `${linksPath(ticket.id)}/${link.issue_link_id}`]);
      }
    }
  } else {
    await put(runner, cwd, ticket.id, field("description", withBodyBlockers(issue.description ?? "", blockers)));
  }
  return { ticket: { ...ticket, blockers }, warnings: [] };
}

/** Adds an issue comment. */
export async function commentOnGitlabTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  comment: string,
): Promise<TicketWriteResult> {
  const ticket = await ticketNamed(runner, cwd, reference);
  await glabRun(runner, cwd, ["api", "-X", "POST", `${issuePath(ticket.id)}/notes`, ...field("body", comment)]);
  return { ticket: { ...ticket, comments: [...ticket.comments, comment] }, warnings: [] };
}

/** Swaps the issue's triage-role label for the one the repo's triage-labels doc gives `role`, in one call. */
export async function triageGitlabTicket(
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
  const stale = (issue.labels ?? []).filter((name) => vocabulary.has(name.toLowerCase()) && name !== label);

  await put(runner, cwd, ticket.id, [
    ...field("add_labels", label),
    ...(stale.length > 0 ? field("remove_labels", stale.join(",")) : []),
  ]);
  return { ticket: { ...ticket, triageRole: resolved }, warnings: [] };
}

/** Appends a context pointer to Decisions-so-far in the map issue's body; the rest of the body is sent back as read. */
export async function indexGitlabMap(
  runner: ProcessRunner,
  cwd: string,
  name: string,
  entry: MapIndexEntry,
): Promise<{ value: MapModel; warnings: string[] }> {
  const issue = await mapIssue(runner, cwd, name);
  // The body keeps its own line endings: only the Decisions-so-far part may change.
  const body = appendDecision(issue.description ?? "", `- [${entry.title}](${entry.link}): ${entry.gist}`);
  await put(runner, cwd, name, field("description", body));
  return { value: { ...parseMap(name, body), title: issue.title }, warnings: [] };
}
