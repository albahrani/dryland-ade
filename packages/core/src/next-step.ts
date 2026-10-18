import { issuesDir } from "./local-markdown.ts";
import { frontierOf, isUnblocked, type MapModel, unresolvedBlockers } from "./map.ts";
import { byTicketNumber, type Ticket, ticketKind } from "./ticket.ts";

/** One effort directory under `.scratch/`: its map, if it has one, and whether it holds a spec. */
export interface EffortSnapshot {
  name: string;
  map: MapModel | null;
  hasSpec: boolean;
}

/**
 * Everything the rules read, already normalized: no file or process is touched to evaluate it. `git` is read
 * from the Linked worktrees; `sessions` and `skillSetup` stay `null` (unknown) until their sources are fed in.
 */
export interface RepoSnapshot {
  /** Whether the repo carries the setup the skills wrote, i.e. its issue-tracker doc. */
  setupConfigPresent: boolean;
  efforts: EffortSnapshot[];
  tickets: Ticket[];
  hasGlossary: boolean;
  adrCount: number;
  /** Coarse git state per Linked worktree; `null` when it has not been read, in which case no rule guesses. */
  git: GitState | null;
  /** Live Dryland sessions; `null` when unknown, in which case no claim is called stale. */
  sessions: SessionSnapshot[] | null;
  skillSetup: SkillSetupSnapshot | null;
}

/** A reference to a ticket: its map and number. */
export interface TicketRef {
  map: string;
  id: string;
}

/** A session Dryland runs now. */
export interface LiveSessionSnapshot {
  id: string;
  /** The ticket the session works on, `null` for a scratch session. */
  ticket: TicketRef | null;
  state: "launched" | "running" | "waiting" | "idle" | "ended";
}

/** How a paused session was left: waiting on the user, interrupted mid-turn, or neither (idle, or no state seen). */
export type PausedWas = "waiting" | "interrupted" | null;

/** A session no live Dryland session runs but the session index knows for a claimed ticket (ADR 0010). */
export interface PausedSessionSnapshot {
  /** The Agent CLI's own session id, the one it resumes by. */
  id: string;
  ticket: TicketRef;
  state: "paused";
  was: PausedWas;
}

export type SessionSnapshot = LiveSessionSnapshot | PausedSessionSnapshot;

/** The label a paused session shows: what it was doing when Dryland quit. */
export function pausedLabel(was: PausedWas): string {
  if (was === "waiting") return "Paused: was waiting on you";
  if (was === "interrupted") return "Paused: interrupted";
  return "Paused";
}

/** What git says about the Linked worktree of one ticket. */
export interface WorktreeGitState extends TicketRef {
  exists: boolean;
  /** The branches of the ticket's worktrees still on disk; a claim held by one of them is not stale. */
  branches: string[];
  aheadOfDefault: boolean;
  merged: boolean;
  /** Whether a PR or MR exists; `null` where the backend cannot say (it is optional). */
  prExists: boolean | null;
}

export interface GitState {
  worktrees: WorktreeGitState[];
}

export type FeatureVerdict = "ok" | "degraded" | "broken";

export interface SkillSetupSnapshot {
  setup: "default" | "default-with-extras" | "modified";
  /** The Compatibility verdict per rule id; `null` when no valid verdict exists. */
  verdict: Record<string, FeatureVerdict> | null;
  /** Rule ids the user re-enabled although the verdict calls them broken. */
  overrides: string[];
}

/** The artifact a step points at. */
export type StepTarget =
  | { kind: "repo" }
  | { kind: "map"; map: string }
  | { kind: "ticket"; map: string; id: string }
  | { kind: "spec"; map: string }
  | { kind: "session"; id: string; ticket: TicketRef | null };

/** One fact a step rests on: the artifact read, the field of it, and what it held. */
export interface Evidence {
  artifact: string;
  field: string;
  value: string;
}

export interface NextStep {
  ruleId: string;
  /** The skill command to pre-type; `null` for a flag or a session needing attention, which has no skill. */
  command: string | null;
  target: StepTarget;
  reason: string;
  evidence: Evidence[];
}

const mapFile = (map: string) => `.scratch/${map}/map.md`;
const specFile = (map: string) => `.scratch/${map}/spec.md`;
const ticketRef = (t: Ticket) => `${t.map}/${t.id}`;
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** Whether the ticket has a `Spec:` header, the link a sliced ticket carries back to its spec. */
const linksToSpec = (ticket: Ticket): boolean => Object.keys(ticket.raw).some((key) => key.toLowerCase() === "spec");

/**
 * Whether a ticket is slice-of-the-spec work rather than a wayfinding decision. A `Spec:` header or a triage
 * role says so outright. Failing both, a `task` is once its effort has a spec, unless it poses a
 * `## Question`: that is how wayfinding writes its decision tickets, and before a spec a task only unblocks
 * a decision.
 */
function isSliceOfSpec(ticket: Ticket, effort: EffortSnapshot): boolean {
  if (linksToSpec(ticket) || ticket.triageRole !== null) return true;
  return effort.hasSpec && ticketKind(ticket) === "implementation" && !/^## Question/m.test(ticket.body);
}

type Rule = (snapshot: RepoSnapshot) => NextStep[];

const noSetupConfig: Rule = (snapshot) =>
  snapshot.setupConfigPresent
    ? []
    : [
        {
          ruleId: "no-setup-config",
          command: "/setup-matt-pocock-skills",
          target: { kind: "repo" },
          reason: "The repo has no skill setup config, so the skills do not know its issue tracker or triage labels.",
          evidence: [{ artifact: "docs/agents/issue-tracker.md", field: "presence", value: "missing" }],
        },
      ];

/** Per effort, in name order; `steps` returns that effort's steps, already in order. */
function perEffort(steps: (effort: EffortSnapshot, tickets: Ticket[]) => NextStep[]): Rule {
  return (snapshot) =>
    [...snapshot.efforts]
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((effort) =>
        steps(
          effort,
          snapshot.tickets.filter((t) => t.map === effort.name),
        ),
      );
}

const mapFrontier: Rule = perEffort((effort, tickets) => {
  if (effort.map === null) return [];
  return frontierOf(tickets)
    .filter((ticket) => !isSliceOfSpec(ticket, effort))
    .map((ticket) => ({
      ruleId: "map-frontier",
      command: `/wayfinder ${effort.name}`,
      target: { kind: "ticket", map: effort.name, id: ticket.id },
      reason: `Ticket ${ticket.id} "${ticket.title}" is open, unblocked and unclaimed on map ${effort.name}.`,
      evidence: [
        { artifact: ticketRef(ticket), field: "Status", value: "open, unclaimed" },
        { artifact: ticketRef(ticket), field: "Blocked by", value: blockersText(ticket) },
      ],
    }));
});

function blockersText(ticket: Ticket): string {
  if (ticket.blockers === "unknown" || ticket.blockers.length === 0) return "none";
  return `${ticket.blockers.join(", ")} (all resolved)`;
}

/** The map's still-open decision tickets, claimed ones included: someone is on them. */
function openWayfinding(effort: EffortSnapshot, tickets: Ticket[]): Ticket[] {
  return tickets.filter((t) => t.state !== "resolved" && !isSliceOfSpec(t, effort));
}

const fogOnly: Rule = perEffort((effort, tickets) => {
  const { map } = effort;
  if (map === null || map.fog.length === 0 || openWayfinding(effort, tickets).length > 0) return [];
  return [
    {
      ruleId: "map-fog-only",
      command: `/wayfinder ${effort.name}`,
      target: { kind: "map", map: effort.name },
      reason: `Map ${effort.name} has no open ticket left and ${count(map.fog.length, "item")} of fog, so the map itself is next.`,
      evidence: [
        { artifact: mapFile(effort.name), field: "Not yet specified", value: count(map.fog.length, "item") },
        { artifact: issuesDir(effort.name), field: "open tickets", value: "0" },
      ],
    },
  ];
});

const clearedMap: Rule = perEffort((effort, tickets) => {
  const { map } = effort;
  const resolved = tickets.filter((t) => t.state === "resolved" && !isSliceOfSpec(t, effort));
  // A map that has never had a ticket is not cleared, it is empty.
  if (map === null || effort.hasSpec || map.fog.length > 0 || resolved.length === 0) return [];
  if (openWayfinding(effort, tickets).length > 0) return [];
  return [
    {
      ruleId: "map-cleared",
      command: `/to-spec ${effort.name}`,
      target: { kind: "map", map: effort.name },
      reason: `Map ${effort.name} is cleared: no open ticket and no fog remain, so its decisions can become a spec.`,
      evidence: [
        { artifact: mapFile(effort.name), field: "Not yet specified", value: "empty" },
        { artifact: issuesDir(effort.name), field: "open tickets", value: "0" },
      ],
    },
  ];
});

const specWithoutTickets: Rule = perEffort((effort, tickets) => {
  if (!effort.hasSpec || tickets.some((t) => isSliceOfSpec(t, effort))) return [];
  return [
    {
      ruleId: "spec-without-tickets",
      command: "/to-tickets",
      target: { kind: "spec", map: effort.name },
      reason: `The spec of ${effort.name} has not been sliced into tickets yet.`,
      evidence: [
        { artifact: specFile(effort.name), field: "presence", value: "present" },
        { artifact: issuesDir(effort.name), field: "implementation tickets", value: "0" },
      ],
    },
  ];
});

const waitingSessions: Rule = (snapshot) =>
  (snapshot.sessions ?? [])
    .filter((session) => session.state === "waiting")
    .map((session) => ({
      ruleId: "waiting-session",
      command: null,
      target: { kind: "session", id: session.id, ticket: session.ticket },
      reason: `Session ${session.id}${session.ticket === null ? "" : ` on ${session.ticket.map}/${session.ticket.id}`} is waiting for input.`,
      evidence: [{ artifact: `session ${session.id}`, field: "state", value: "waiting" }],
    }));

/** Whether `session` holds the claim on `ticket`: it works on it and has not ended. A paused session holds it too. */
export const holdsClaim = (session: SessionSnapshot, ticket: TicketRef): boolean =>
  session.state !== "ended" && session.ticket?.map === ticket.map && session.ticket.id === ticket.id;

/** A paused session that was waiting on the user: it needs them as soon as it resumes, so it ranks after live ones. */
const pausedWasWaiting: Rule = (snapshot) =>
  (snapshot.sessions ?? [])
    .filter((session): session is PausedSessionSnapshot => session.state === "paused" && session.was === "waiting")
    .map((session) => ({
      ruleId: "paused-was-waiting",
      command: null,
      target: { kind: "ticket", map: session.ticket.map, id: session.ticket.id },
      reason: `Ticket ${session.ticket.map}/${session.ticket.id} has a paused session (${session.id}) that was waiting on you.`,
      evidence: [
        { artifact: `session ${session.id}`, field: "state", value: "paused" },
        { artifact: `session ${session.id}`, field: "was", value: "waiting" },
      ],
    }));

/**
 * A claim is held by a branch (ADR 0010). It is possibly stale when no live or paused session works on its ticket
 * and its holder is no branch checked out in a ticket worktree: the default branch, a name no worktree has, or a
 * session id an earlier build wrote. It is only flagged: releasing it is an explicit user action.
 */
const staleClaims: Rule = (snapshot) => {
  const { sessions } = snapshot;
  if (sessions === null) return [];
  const worktreeBranches = new Set(snapshot.git?.worktrees.flatMap((w) => w.branches) ?? []);
  return snapshot.tickets
    .filter((t) => t.state === "claimed")
    .sort(byTicketNumber)
    .flatMap((ticket) => {
      if (ticket.claimant !== null && worktreeBranches.has(ticket.claimant)) return [];
      if (sessions.some((s) => holdsClaim(s, ticket))) return [];
      return [
        {
          ruleId: "stale-claim",
          command: null,
          target: { kind: "ticket", map: ticket.map, id: ticket.id },
          reason: `Ticket ${ticketRef(ticket)} is claimed, possibly stale: no live Dryland session works on it and no ticket worktree is on its holder's branch.`,
          evidence: [
            { artifact: ticketRef(ticket), field: "Status", value: "claimed" },
            { artifact: ticketRef(ticket), field: "claimant", value: ticket.claimant ?? "unknown" },
            { artifact: "sessions", field: `live sessions on ${ticketRef(ticket)}`, value: "0" },
            { artifact: "worktrees", field: "ticket worktrees on the claimant's branch", value: "0" },
          ],
        },
      ];
    });
};

/** The ready-for-agent tickets of an effort that nothing blocks and nobody holds, lowest number first. */
function readyTickets(tickets: Ticket[]): Ticket[] {
  return tickets
    .filter(
      (t) => t.state === "open" && t.claimant === null && t.triageRole === "ready-for-agent" && isUnblocked(t, tickets),
    )
    .sort(byTicketNumber);
}

const implementSpec: Rule = perEffort((effort, tickets) => {
  const ready = readyTickets(tickets);
  if (!effort.hasSpec || ready.length === 0) return [];
  return [
    {
      ruleId: "implement-spec",
      command: "/implement-spec",
      target: { kind: "spec", map: effort.name },
      reason: `The spec of ${effort.name} has ${count(ready.length, "ready-for-agent ticket")}.`,
      evidence: [
        { artifact: specFile(effort.name), field: "presence", value: "present" },
        {
          artifact: issuesDir(effort.name),
          field: "ready-for-agent tickets",
          value: ready.map((t) => t.id).join(", "),
        },
      ],
    },
  ];
});

const implementTickets: Rule = perEffort((effort, tickets) =>
  readyTickets(tickets).map((ticket) => ({
    ruleId: "implement-ticket",
    command: `/implement ${ticketRef(ticket)}`,
    target: { kind: "ticket", map: effort.name, id: ticket.id },
    reason: `Ticket ${ticketRef(ticket)} "${ticket.title}" is ready-for-agent, unblocked and unclaimed.`,
    evidence: [
      { artifact: ticketRef(ticket), field: "triage role", value: "ready-for-agent" },
      { artifact: ticketRef(ticket), field: "Blocked by", value: blockersText(ticket) },
    ],
  })),
);

const needsTriage: Rule = perEffort((effort, tickets) =>
  tickets
    .filter((t) => t.state !== "resolved" && t.triageRole === "needs-triage")
    .sort(byTicketNumber)
    .map((ticket) => ({
      ruleId: "needs-triage",
      command: "/triage",
      target: { kind: "ticket", map: effort.name, id: ticket.id },
      reason: `Ticket ${ticketRef(ticket)} "${ticket.title}" carries the needs-triage role.`,
      evidence: [{ artifact: ticketRef(ticket), field: "triage role", value: "needs-triage" }],
    })),
);

/** A backend that cannot report blockers is flagged, not guessed at: such a ticket is on no frontier. */
const blockingUnknown: Rule = perEffort((effort, tickets) =>
  tickets
    .filter((t) => t.state === "open" && t.blockers === "unknown")
    .sort(byTicketNumber)
    .map((ticket) => ({
      ruleId: "blocking-unknown",
      command: null,
      target: { kind: "ticket", map: effort.name, id: ticket.id },
      reason: `Ticket ${ticketRef(ticket)} has blockers the tracker cannot report: blocking unknown.`,
      evidence: [{ artifact: ticketRef(ticket), field: "Blocked by", value: "unknown" }],
    })),
);

/** Resolved tickets whose Linked worktree still exists, paired with its git state, lowest number first. */
function doneWorktrees(snapshot: RepoSnapshot): { ticket: Ticket; worktree: WorktreeGitState }[] {
  return (snapshot.git?.worktrees ?? [])
    .filter((w) => w.exists)
    .flatMap((worktree) => {
      const ticket = snapshot.tickets.find((t) => t.map === worktree.map && t.id === worktree.id);
      return ticket?.state === "resolved" ? [{ ticket, worktree }] : [];
    })
    .sort((a, b) => byTicketNumber(a.ticket, b.ticket));
}

const worktreeLabel = (t: Ticket) => `worktree ${ticketRef(t)}`;

/** Done work whose branch is ahead of the default branch and has no PR yet. */
const awaitingPr = (snapshot: RepoSnapshot) =>
  doneWorktrees(snapshot).filter(
    ({ worktree }) => worktree.aheadOfDefault && !worktree.merged && worktree.prExists !== true,
  );

const reviewBeforePr: Rule = (snapshot) =>
  awaitingPr(snapshot).map(({ ticket }) => ({
    ruleId: "review-before-pr",
    command: "/code-review",
    target: { kind: "ticket", map: ticket.map, id: ticket.id },
    reason: `Ticket ${ticketRef(ticket)} is resolved and its branch is ahead of the default branch: review it before the PR.`,
    evidence: [
      { artifact: ticketRef(ticket), field: "Status", value: "resolved" },
      { artifact: worktreeLabel(ticket), field: "ahead of default branch", value: "yes" },
    ],
  }));

const openPr: Rule = (snapshot) =>
  awaitingPr(snapshot).map(({ ticket }) => ({
    ruleId: "open-pr",
    command: "/pr",
    target: { kind: "ticket", map: ticket.map, id: ticket.id },
    reason: `Ticket ${ticketRef(ticket)} is resolved and its branch is ahead of the default branch with no PR yet.`,
    evidence: [
      { artifact: ticketRef(ticket), field: "Status", value: "resolved" },
      { artifact: worktreeLabel(ticket), field: "ahead of default branch", value: "yes" },
      { artifact: worktreeLabel(ticket), field: "PR exists", value: "no or unknown" },
    ],
  }));

const retro: Rule = (snapshot) =>
  doneWorktrees(snapshot)
    .filter(({ worktree }) => worktree.merged)
    .map(({ ticket }) => ({
      ruleId: "retro",
      command: "/retro",
      target: { kind: "ticket", map: ticket.map, id: ticket.id },
      reason: `Ticket ${ticketRef(ticket)} is resolved and its branch is merged, so the feature can be reviewed in retrospect.`,
      evidence: [
        { artifact: ticketRef(ticket), field: "Status", value: "resolved" },
        { artifact: worktreeLabel(ticket), field: "merged", value: "yes" },
      ],
    }));

/** In priority order: the order of this list is the order of the result. */
const RULES: Rule[] = [
  noSetupConfig,
  waitingSessions,
  pausedWasWaiting,
  staleClaims,
  mapFrontier,
  implementSpec,
  implementTickets,
  fogOnly,
  clearedMap,
  needsTriage,
  specWithoutTickets,
  blockingUnknown,
  reviewBeforePr,
  openPr,
  retro,
];

/**
 * The only skills a rule ever recommends: those with a mechanical artifact trigger. Every other skill stays
 * launchable by the user but is never a next step.
 */
export const RECOMMENDED_SKILLS = [
  "/setup-matt-pocock-skills",
  "/triage",
  "/wayfinder",
  "/to-spec",
  "/to-tickets",
  "/implement-spec",
  "/implement",
  "/code-review",
  "/pr",
  "/retro",
] as const;

/** A rule is off when the Compatibility verdict calls it broken and the user has not overridden that. */
function isDisabled(snapshot: RepoSnapshot, ruleId: string): boolean {
  const { skillSetup } = snapshot;
  if (skillSetup === null || skillSetup.verdict === null) return false;
  return skillSetup.verdict[ruleId] === "broken" && !skillSetup.overrides.includes(ruleId);
}

/** The ranked next steps of a repo snapshot, best first. Pure: the same snapshot gives the same list. */
export function nextSteps(snapshot: RepoSnapshot): NextStep[] {
  return RULES.flatMap((rule) => rule(snapshot)).filter((step) => !isDisabled(snapshot, step.ruleId));
}

/**
 * The skill command to pre-type when work starts on `ref`: that of the best next step pointing at the ticket.
 * `null` when no step with a skill does, in which case nothing is typed.
 */
export function commandForTicket(steps: NextStep[], ref: TicketRef): string | null {
  const step = steps.find(
    ({ command, target }) =>
      command !== null && target.kind === "ticket" && target.map === ref.map && target.id === ref.id,
  );
  return step?.command ?? null;
}

/** Why a ticket is not on the frontier because of blockers: the ones still unresolved, or that they are unknown. */
export interface WhyNot {
  /** Ids of the blockers that are not resolved; empty when the ticket is not blocked or its blockers are unknown. */
  blockers: string[];
  /** The tracker could not say what blocks the ticket, so nothing is listed rather than guessed. */
  unknown: boolean;
}

/** "Why not X?": the unresolved blockers of `ref`, or `unknown` when its backend cannot report them. */
export function whyNot(snapshot: RepoSnapshot, ref: TicketRef): WhyNot {
  const siblings = snapshot.tickets.filter((t) => t.map === ref.map);
  const ticket = siblings.find((t) => t.id === ref.id);
  if (ticket === undefined) return { blockers: [], unknown: false };
  const unresolved = unresolvedBlockers(ticket, siblings);
  return unresolved === "unknown" ? { blockers: [], unknown: true } : { blockers: unresolved, unknown: false };
}

/** An item in the Tickets and Maps views a Next-up marker can sit on. */
export type MarkedItem = { kind: "ticket"; map: string; id: string } | { kind: "map"; map: string };

/** A Next-up marker: the item it sits on and the best next step pointing at that item. */
export interface NextUpMarker {
  item: MarkedItem;
  step: NextStep;
}

/** How many items carry a Next-up marker: enough to offer a choice, few enough to stand out. */
export const NEXT_UP_COUNT = 3;

/**
 * The item a step's marker sits on. A spec belongs to its map, and a waiting session to its ticket; the repo and
 * a scratch session have no item in the views, so their steps carry no marker.
 */
function markedItem(target: StepTarget): MarkedItem | null {
  switch (target.kind) {
    case "ticket":
      return { kind: "ticket", map: target.map, id: target.id };
    case "map":
    case "spec":
      return { kind: "map", map: target.map };
    case "session":
      return target.ticket === null ? null : { kind: "ticket", map: target.ticket.map, id: target.ticket.id };
    case "repo":
      return null;
  }
}

const itemKey = (item: MarkedItem) => (item.kind === "map" ? `map:${item.map}` : `ticket:${item.map}/${item.id}`);

/**
 * The Next-up markers of ranked steps: the first `count` distinct items, each with its best step, best first. With
 * an infinite `count`, every item some step points at, which is how far down an unmarked item ranks.
 */
export function nextUpMarkers(steps: NextStep[], count = NEXT_UP_COUNT): NextUpMarker[] {
  const markers = new Map<string, NextUpMarker>();
  for (const step of steps) {
    if (markers.size === count) break;
    const item = markedItem(step.target);
    if (item !== null && !markers.has(itemKey(item))) markers.set(itemKey(item), { item, step });
  }
  return [...markers.values()];
}
