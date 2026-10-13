import { issuesDir } from "./local-markdown.ts";
import { frontierOf, type MapModel } from "./map.ts";
import { type Ticket, ticketKind } from "./ticket.ts";

/** One effort directory under `.scratch/`: its map, if it has one, and whether it holds a spec. */
export interface EffortSnapshot {
  name: string;
  map: MapModel | null;
  hasSpec: boolean;
}

/**
 * Everything the rules read, already normalized: no file or process is touched to evaluate it. The
 * placeholder fields are filled by later rules (git state, live sessions, skill setup and compatibility).
 */
export interface RepoSnapshot {
  /** Whether the repo carries the setup the skills wrote, i.e. its issue-tracker doc. */
  setupConfigPresent: boolean;
  efforts: EffortSnapshot[];
  tickets: Ticket[];
  hasGlossary: boolean;
  adrCount: number;
  git: null;
  sessions: null;
  skillSetup: null;
}

/** The artifact a step points at. */
export type StepTarget =
  | { kind: "repo" }
  | { kind: "map"; map: string }
  | { kind: "ticket"; map: string; id: string }
  | { kind: "spec"; map: string };

/** One fact a step rests on: the artifact read, the field of it, and what it held. */
export interface Evidence {
  artifact: string;
  field: string;
  value: string;
}

export interface NextStep {
  ruleId: string;
  /** The skill command to pre-type. */
  command: string;
  target: StepTarget;
  reason: string;
  evidence: Evidence[];
}

const mapFile = (map: string) => `.scratch/${map}/map.md`;
const specFile = (map: string) => `.scratch/${map}/spec.md`;
const ticketRef = (t: Ticket) => `${t.map}/${t.id}`;
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * Whether a ticket is slice-of-the-spec work rather than a wayfinding decision. A ticket carrying a triage
 * role always is. A `task` is once its effort has a spec, unless it poses a `## Question`: that is how
 * wayfinding writes its decision tickets, and before a spec a task only unblocks a decision.
 */
function isSliceOfSpec(ticket: Ticket, effort: EffortSnapshot): boolean {
  if (ticket.triageRole !== null) return true;
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

/** In priority order: the order of this list is the order of the result. */
const RULES: Rule[] = [noSetupConfig, mapFrontier, fogOnly, clearedMap, specWithoutTickets];

/** The ranked next steps of a repo snapshot, best first. Pure: the same snapshot gives the same list. */
export function nextSteps(snapshot: RepoSnapshot): NextStep[] {
  return RULES.flatMap((rule) => rule(snapshot));
}
