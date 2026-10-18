import { DrylandError } from "./errors.ts";
import { findSection, splitSections, stripAnnotations } from "./local-markdown.ts";
import { type MapModel, parseMap } from "./map.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { byTicketNumber, TICKET_TYPES, type Ticket, type TicketType } from "./ticket.ts";
import { defaultTriageVocabulary, type TriageVocabulary } from "./triage-labels.ts";

/** The label that marks an issue as a map; its body is the map index and its sub-issues are the map's tickets. */
export const GITHUB_MAP_LABEL = "map";
/** A ticket's type is the label `type:<type>`, e.g. `type:task`. */
export const GITHUB_TYPE_LABEL_PREFIX = "type:";

/** How many `gh` processes run at once. */
const CONCURRENCY = 8;

/** The fields of a GitHub issue that both `gh issue list --json` and the REST API return. */
interface GithubIssue {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  labels?: { name: string }[];
  assignees?: { login: string }[];
}

export interface GithubTracker {
  tickets: Ticket[];
  maps: MapModel[];
}

const GH_MISSING = (): DrylandError =>
  new DrylandError(
    "The GitHub tracker needs `gh`, but it is not installed.",
    "Install gh from https://cli.github.com, then run `gh auth login`.",
  );

const GH_LOGGED_OUT = (): DrylandError =>
  new DrylandError("The GitHub tracker needs `gh`, but it is not logged in.", "Run `gh auth login`.");

/** Says why a failed `gh` call failed: not installed, not logged in, or something else with `gh`'s own message. */
async function explainFailure(
  runner: ProcessRunner,
  cwd: string,
  args: string[],
  stderr: string,
): Promise<DrylandError> {
  if ((await runner.run("gh", ["--version"], { cwd })).exitCode !== 0) return GH_MISSING();
  if ((await runner.run("gh", ["auth", "status"], { cwd })).exitCode !== 0) return GH_LOGGED_OUT();
  const reason = stderr.trim().split("\n").slice(-3).join(" ") || "no error message";
  return new DrylandError(
    `\`gh ${args.slice(0, 2).join(" ")}\` failed: ${reason}`,
    "Check that this repo has a GitHub remote and that your `gh` login can read its issues.",
  );
}

type GhResult = { ok: true; json: unknown } | { ok: false; stderr: string };

async function ghJson(runner: ProcessRunner, cwd: string, args: string[]): Promise<GhResult> {
  const result = await runner.run("gh", args, { cwd });
  if (result.exitCode !== 0) return { ok: false, stderr: result.stderr };
  try {
    return { ok: true, json: JSON.parse(result.stdout) };
  } catch {
    return { ok: false, stderr: `gh printed output that is not JSON: ${result.stdout.slice(0, 80)}` };
  }
}

/** The JSON of a `gh` call that must succeed; a failure says what to do next. */
async function ghRequired(runner: ProcessRunner, cwd: string, args: string[]): Promise<unknown> {
  const result = await ghJson(runner, cwd, args);
  if (result.ok) return result.json;
  throw await explainFailure(runner, cwd, args, result.stderr);
}

/** A paginated REST list: `--slurp` wraps every page in one array, which is flattened here. */
const restList = (runner: ProcessRunner, cwd: string, path: string): Promise<GhResult> =>
  ghJson(runner, cwd, ["api", "--paginate", "--slurp", path]).then((result) =>
    result.ok ? { ok: true, json: (result.json as unknown[]).flat() } : result,
  );

async function mapLimit<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) results[i] = await run(items[i] as T);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

const labelNames = (issue: GithubIssue): string[] => (issue.labels ?? []).map((label) => label.name);

function ticketOf(
  issue: GithubIssue,
  map: string,
  blockers: string[] | "unknown",
  comments: string[],
  vocabulary: TriageVocabulary,
): Ticket {
  const labels = labelNames(issue);
  const assignee = issue.assignees?.[0]?.login ?? null;
  const state = issue.state.toLowerCase() === "closed" ? "resolved" : assignee !== null ? "claimed" : "open";

  const { preamble, sections } = splitSections(stripAnnotations(issue.body ?? "").split("\n"));
  const bodySections = sections.filter((s) => !["answer", "comments"].includes(s.heading.toLowerCase()));
  const body = [preamble.join("\n"), ...bodySections.map((s) => `## ${s.heading}\n\n${s.content}`)].join("\n").trim();

  const typeLabel = labels.find((name) => name.toLowerCase().startsWith(GITHUB_TYPE_LABEL_PREFIX));
  const rawType = typeLabel?.slice(GITHUB_TYPE_LABEL_PREFIX.length).toLowerCase();
  const type: TicketType = TICKET_TYPES.find((known) => known === rawType) ?? "none";

  const roleLabel = labels.find((name) => vocabulary.has(name.toLowerCase()));
  return {
    id: String(issue.number),
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
    raw: { labels: labels.join(", "), assignees: (issue.assignees ?? []).map((a) => a.login).join(", ") },
  };
}

/** The numbers of the issues blocking `number`, or `"unknown"` when GitHub's dependencies cannot be read. */
async function blockersOf(runner: ProcessRunner, cwd: string, number: number): Promise<string[] | "unknown"> {
  const result = await restList(runner, cwd, `repos/{owner}/{repo}/issues/${number}/dependencies/blocked_by`);
  if (!result.ok) return "unknown";
  return (result.json as GithubIssue[]).map((blocker) => String(blocker.number));
}

async function commentsOf(runner: ProcessRunner, cwd: string, number: number): Promise<string[]> {
  const result = await restList(runner, cwd, `repos/{owner}/{repo}/issues/${number}/comments`);
  if (!result.ok) return [];
  return (result.json as { body?: string | null }[]).map((comment) => (comment.body ?? "").trim()).filter(Boolean);
}

/**
 * Reads the maps and tickets of the repo's GitHub issues through the user's `gh` login. A map is an issue
 * labelled `map` whose body is the map index and whose sub-issues are its tickets; the map is named by its
 * issue number. A claim is the assignee, blockers are GitHub's native dependencies, triage roles are labels.
 */
export async function readGithubTracker(
  runner: ProcessRunner,
  cwd: string,
  vocabulary: TriageVocabulary = defaultTriageVocabulary(),
): Promise<GithubTracker> {
  const mapIssues = (await ghRequired(runner, cwd, [
    "issue",
    "list",
    "--label",
    GITHUB_MAP_LABEL,
    "--state",
    "all",
    "--limit",
    "1000",
    "--json",
    "number,title,body,state,labels,assignees",
  ])) as GithubIssue[];

  const maps: MapModel[] = [];
  const tickets: Ticket[] = [];
  for (const mapIssue of mapIssues) {
    const name = String(mapIssue.number);
    maps.push({ ...parseMap(name, mapIssue.body ?? ""), title: mapIssue.title });

    const path = `repos/{owner}/{repo}/issues/${mapIssue.number}/sub_issues`;
    const listed = await restList(runner, cwd, path);
    if (!listed.ok) throw await explainFailure(runner, cwd, ["api", path], listed.stderr);
    const children = listed.json as GithubIssue[];
    tickets.push(
      ...(await mapLimit(children, async (child) => {
        const [blockers, comments] = await Promise.all([
          blockersOf(runner, cwd, child.number),
          commentsOf(runner, cwd, child.number),
        ]);
        return ticketOf(child, name, blockers, comments, vocabulary);
      })),
    );
  }
  return { tickets: tickets.sort(byTicketNumber), maps };
}
