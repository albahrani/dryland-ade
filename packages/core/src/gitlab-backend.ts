import { DrylandError } from "./errors.ts";
import { findSection, splitSections, stripAnnotations } from "./local-markdown.ts";
import { type MapModel, parseMap } from "./map.ts";
import { mapLimit } from "./map-limit.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { byTicketNumber, TICKET_TYPES, type Ticket, type TicketType } from "./ticket.ts";
import { defaultTriageVocabulary, type TriageVocabulary } from "./triage-labels.ts";

/** The label that marks an issue as a map; its body is the map index. */
export const GITLAB_MAP_LABEL = "map";
/** A ticket belongs to the map whose issue number follows this prefix, e.g. `map:12`. GitLab has no sub-issues outside work items. */
export const GITLAB_MAP_LABEL_PREFIX = "map:";
/** A ticket's type is the label `type:<type>`, e.g. `type:task`. */
export const GITLAB_TYPE_LABEL_PREFIX = "type:";

/** Issues come back this many to a page. */
const PAGE_SIZE = 100;

/** The fields of a GitLab issue that the REST API returns. */
export interface GitlabIssue {
  /** The database id; `iid` is the number users see. */
  id?: number;
  iid: number;
  title: string;
  description?: string | null;
  /** `opened` or `closed`. */
  state: string;
  labels?: string[];
  assignees?: { username: string; id?: number }[];
}

/** An entry of an issue's `links` that carries a blocking relation (GitLab Premium). */
export interface GitlabIssueLink {
  iid: number;
  project_id?: number;
  link_type?: string;
  issue_link_id?: number;
}

export interface GitlabTracker {
  tickets: Ticket[];
  maps: MapModel[];
}

const GLAB_MISSING = (): DrylandError =>
  new DrylandError(
    "The GitLab tracker needs `glab`, but it is not installed.",
    "Install glab from https://gitlab.com/gitlab-org/cli, then run `glab auth login`.",
  );

const GLAB_LOGGED_OUT = (): DrylandError =>
  new DrylandError("The GitLab tracker needs `glab`, but it is not logged in.", "Run `glab auth login`.");

/** Says why a failed `glab` call failed: not installed, not logged in, or something else with `glab`'s own message. */
async function explainFailure(
  runner: ProcessRunner,
  cwd: string,
  args: string[],
  stderr: string,
): Promise<DrylandError> {
  if ((await runner.run("glab", ["--version"], { cwd })).exitCode !== 0) return GLAB_MISSING();
  if ((await runner.run("glab", ["auth", "status"], { cwd })).exitCode !== 0) return GLAB_LOGGED_OUT();
  const reason = stderr.trim().split("\n").slice(-3).join(" ") || "no error message";
  return new DrylandError(
    `\`glab ${args.slice(0, 2).join(" ")}\` failed: ${reason}`,
    "Check that this repo has a GitLab remote and that your `glab` login can read and edit its issues.",
  );
}

/** Runs a `glab` call that must succeed and returns its trimmed output; a failure says what to do next. */
export async function glabRun(runner: ProcessRunner, cwd: string, args: string[]): Promise<string> {
  const result = await runner.run("glab", args, { cwd });
  if (result.exitCode !== 0) throw await explainFailure(runner, cwd, args, result.stderr);
  return result.stdout.trim();
}

type GlabResult = { ok: true; json: unknown } | { ok: false; stderr: string };

async function glabJson(runner: ProcessRunner, cwd: string, args: string[]): Promise<GlabResult> {
  const result = await runner.run("glab", args, { cwd });
  if (result.exitCode !== 0) return { ok: false, stderr: result.stderr };
  try {
    return { ok: true, json: JSON.parse(result.stdout) };
  } catch {
    return { ok: false, stderr: `glab printed output that is not JSON: ${result.stdout.slice(0, 80)}` };
  }
}

/** The JSON of a `glab` call that must succeed; a failure says what to do next. */
export async function glabRequired(runner: ProcessRunner, cwd: string, args: string[]): Promise<unknown> {
  const result = await glabJson(runner, cwd, args);
  if (result.ok) return result.json;
  throw await explainFailure(runner, cwd, args, result.stderr);
}

/** A paged REST list, read page by page until a short page; `path` may already carry a query. */
async function restList(runner: ProcessRunner, cwd: string, path: string): Promise<GlabResult> {
  const items: unknown[] = [];
  for (let page = 1; ; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const result = await glabJson(runner, cwd, ["api", `${path}${separator}per_page=${PAGE_SIZE}&page=${page}`]);
    if (!result.ok) return result;
    const batch = Array.isArray(result.json) ? result.json : [];
    items.push(...batch);
    if (batch.length < PAGE_SIZE) return { ok: true, json: items };
  }
}

/** All items of a paged list that must succeed. */
export async function glabList<T>(runner: ProcessRunner, cwd: string, path: string): Promise<T[]> {
  const result = await restList(runner, cwd, path);
  if (!result.ok) throw await explainFailure(runner, cwd, ["api", path], result.stderr);
  return result.json as T[];
}

/** `projects/:id` is the project of the checkout, which `glab` fills in from the git remote. */
export const PROJECT = "projects/:id";

/** The project's numeric id, which link targets need. */
export async function projectId(runner: ProcessRunner, cwd: string): Promise<number> {
  const project = (await glabRequired(runner, cwd, ["api", PROJECT])) as { id: number };
  return project.id;
}

const PREMIUM_PLANS = new Set(["premium", "ultimate", "gold", "silver"]);

/**
 * Whether the project's namespace has GitLab Premium, whose issue links can say "blocks" and "is blocked by".
 * What `glab` cannot tell (a namespace the login does not own, or a self-managed server) counts as no.
 */
export async function hasNativeBlocking(runner: ProcessRunner, cwd: string): Promise<boolean> {
  const project = await glabJson(runner, cwd, ["api", PROJECT]);
  if (!project.ok) return false;
  const namespaceId = (project.json as { namespace?: { id?: number } }).namespace?.id;
  if (namespaceId === undefined) return false;
  const namespace = await glabJson(runner, cwd, ["api", `namespaces/${namespaceId}`]);
  if (!namespace.ok) return false;
  return PREMIUM_PLANS.has(String((namespace.json as { plan?: string }).plan ?? "").toLowerCase());
}

/** What the `Blocked by:` line in an issue body says: no line, a line of numbers (`none` is none), or one that is unreadable. */
export type BodyBlockers = { line: false } | { line: true; blockers: string[] | "unknown" };

const BLOCKED_BY_LINE = /^[ \t]*Blocked by:[ \t]*(.*?)[ \t]*\r?$/im;

export function readBodyBlockers(description: string): BodyBlockers {
  const value = BLOCKED_BY_LINE.exec(description)?.[1];
  if (value === undefined) return { line: false };
  if (value === "" || value.toLowerCase() === "none") return { line: true, blockers: [] };
  const ids = value.match(/\d+/g) ?? [];
  return { line: true, blockers: ids.length === 0 ? "unknown" : ids.map((id) => String(Number(id))) };
}

/** The description with its `Blocked by:` line set to `ids` (`none` when empty), put first when there was none. */
export function withBodyBlockers(description: string, ids: string[]): string {
  const line = `Blocked by: ${ids.length === 0 ? "none" : ids.join(", ")}`;
  if (BLOCKED_BY_LINE.test(description)) return description.replace(BLOCKED_BY_LINE, line);
  return description.trim() === "" ? `${line}\n` : `${line}\n\n${description}`;
}

const labelsOf = (issue: GitlabIssue): string[] => issue.labels ?? [];

/** The number of the map a ticket belongs to, from its `map:<number>` label. */
const mapOf = (issue: GitlabIssue): string | undefined =>
  labelsOf(issue)
    .find((name) => /^map:\d+$/i.test(name))
    ?.slice(GITLAB_MAP_LABEL_PREFIX.length);

function ticketOf(
  issue: GitlabIssue,
  map: string,
  blockers: string[] | "unknown",
  comments: string[],
  vocabulary: TriageVocabulary,
): Ticket {
  const labels = labelsOf(issue);
  const assignee = issue.assignees?.[0]?.username ?? null;
  const state = issue.state === "closed" ? "resolved" : assignee !== null ? "claimed" : "open";

  const description = stripAnnotations(issue.description ?? "").replace(BLOCKED_BY_LINE, "");
  const { preamble, sections } = splitSections(description.split("\n"));
  const bodySections = sections.filter((s) => !["answer", "comments"].includes(s.heading.toLowerCase()));
  const body = [preamble.join("\n"), ...bodySections.map((s) => `## ${s.heading}\n\n${s.content}`)].join("\n").trim();

  const typeLabel = labels.find((name) => name.toLowerCase().startsWith(GITLAB_TYPE_LABEL_PREFIX));
  const rawType = typeLabel?.slice(GITLAB_TYPE_LABEL_PREFIX.length).toLowerCase();
  const type: TicketType = TICKET_TYPES.find((known) => known === rawType) ?? "none";

  const roleLabel = labels.find((name) => vocabulary.has(name.toLowerCase()));
  return {
    id: String(issue.iid),
    map,
    title: issue.title,
    type,
    state,
    claimant: state === "claimed" ? assignee : null,
    blockers,
    triageRole: state === "open" && roleLabel !== undefined ? (vocabulary.get(roleLabel.toLowerCase()) ?? null) : null,
    body,
    answer: findSection(sections, "answer") ?? null,
    comments,
    raw: { labels: labels.join(", "), assignees: (issue.assignees ?? []).map((a) => a.username).join(", ") },
  };
}

/**
 * The numbers blocking `issue`: Premium's "is blocked by" links when `native`, else the `Blocked by:` line of its body.
 * `"unknown"` when the source that applies cannot say: the links could not be read, or the body has no readable line.
 */
async function blockersOf(
  runner: ProcessRunner,
  cwd: string,
  issue: GitlabIssue,
  native: boolean,
): Promise<string[] | "unknown"> {
  if (native) {
    const links = await restList(runner, cwd, `${PROJECT}/issues/${issue.iid}/links`);
    if (links.ok) {
      return (links.json as GitlabIssueLink[])
        .filter((link) => link.link_type === "is_blocked_by")
        .map((link) => String(link.iid));
    }
    // Links that cannot be read fall back to the body line, then to unknown.
  }
  const fromBody = readBodyBlockers(issue.description ?? "");
  return fromBody.line ? fromBody.blockers : "unknown";
}

async function commentsOf(runner: ProcessRunner, cwd: string, iid: number): Promise<string[]> {
  const result = await restList(runner, cwd, `${PROJECT}/issues/${iid}/notes?sort=asc&order_by=created_at`);
  if (!result.ok) return [];
  return (result.json as { body?: string | null; system?: boolean }[])
    .filter((note) => note.system !== true)
    .map((note) => (note.body ?? "").trim())
    .filter(Boolean);
}

/**
 * Reads the maps and tickets of the repo's GitLab issues through the user's `glab` login. A map is an issue labelled
 * `map` whose body is the map index, named by its issue number; its tickets carry the label `map:<number>`. A claim is
 * the assignee and triage roles are labels. Blockers are Premium's issue links, or else a `Blocked by:` line in the body.
 */
export async function readGitlabTracker(
  runner: ProcessRunner,
  cwd: string,
  vocabulary: TriageVocabulary = defaultTriageVocabulary(),
): Promise<GitlabTracker> {
  const issues = await glabList<GitlabIssue>(runner, cwd, `${PROJECT}/issues?state=all&scope=all`);

  const maps: MapModel[] = issues
    .filter((issue) => labelsOf(issue).includes(GITLAB_MAP_LABEL))
    .map((issue) => ({ ...parseMap(String(issue.iid), issue.description ?? ""), title: issue.title }));
  const names = new Set(maps.map((map) => map.name));
  const children = issues.filter((issue) => {
    const map = mapOf(issue);
    return map !== undefined && names.has(map);
  });

  const native = children.length > 0 && (await hasNativeBlocking(runner, cwd));
  const tickets = await mapLimit(children, async (child) => {
    const [blockers, comments] = await Promise.all([
      blockersOf(runner, cwd, child, native),
      commentsOf(runner, cwd, child.iid),
    ]);
    return ticketOf(child, mapOf(child) as string, blockers, comments, vocabulary);
  });
  return { tickets: tickets.sort(byTicketNumber), maps };
}
