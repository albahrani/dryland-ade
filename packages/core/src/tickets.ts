import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DrylandError } from "./errors.ts";
import { GITHUB_MAP_LABEL, readGithubTracker } from "./github-backend.ts";
import { readLocalMarkdownTickets, ticketFile } from "./local-markdown.ts";
import { findMainCheckout } from "./main-checkout.ts";
import { findSpecsWithoutTickets, frontierOf, type MapModel, readMapFile } from "./map.ts";
import { nodeProcessRunner, type ProcessRunner } from "./process-runner.ts";
import type { Ticket } from "./ticket.ts";
import { readTrackerKind, type TrackerKind } from "./tracker.ts";
import { readTriageVocabulary } from "./triage-labels.ts";

interface LoadedTracker {
  kind: TrackerKind;
  tickets: Ticket[];
  /** The maps the tracker itself holds; `null` for local markdown, whose maps are files read on demand. */
  maps: MapModel[] | null;
}

/** Every ticket (and, for a remote tracker, every map) of the main checkout, from the tracker its docs name. */
async function loadTracker(runner: ProcessRunner, mainCheckout: string): Promise<LoadedTracker> {
  const kind = await readTrackerKind(mainCheckout);
  if (kind === "gitlab") {
    throw new DrylandError(
      `The ${kind} tracker is not supported by this version of dryland yet.`,
      "Use a local-markdown or GitHub tracker for now (/setup-matt-pocock-skills).",
    );
  }
  const vocabulary = await readTriageVocabulary(mainCheckout);
  if (kind === "github") return { kind, ...(await readGithubTracker(runner, mainCheckout, vocabulary)) };
  return { kind, tickets: await readLocalMarkdownTickets(mainCheckout, vocabulary), maps: null };
}

/** Every ticket of the repo containing `cwd`, plus where its main checkout is. */
async function loadTickets(runner: ProcessRunner, cwd: string): Promise<{ mainCheckout: string } & LoadedTracker> {
  const mainCheckout = await findMainCheckout(runner, cwd);
  return { mainCheckout, ...(await loadTracker(runner, mainCheckout)) };
}

/** Every ticket of the main checkout, from the tracker its docs name. */
export async function readTickets(mainCheckout: string, runner: ProcessRunner = nodeProcessRunner): Promise<Ticket[]> {
  return (await loadTracker(runner, mainCheckout)).tickets;
}

/** Lists the tickets of the repo containing `cwd`, from the tracker its docs name. */
export async function listTickets(runner: ProcessRunner, cwd: string): Promise<Ticket[]> {
  return (await loadTickets(runner, cwd)).tickets;
}

export interface TicketReference {
  /** The map the reference names; `null` for a bare number. */
  map: string | null;
  number: number;
  /** The reference as written, for messages. */
  text: string;
}

/** Parses `<map>/<number>` or a bare `<number>`; anything else is rejected before any tracker is read. */
export function parseTicketReference(reference: string): TicketReference {
  const match = /^(?:([^/\s]+)\/)?(\d+)$/.exec(reference);
  if (match?.[2] === undefined) {
    throw new DrylandError(
      `"${reference}" is not a ticket reference.`,
      "Write it as <map>/<number>, e.g. shop/02, or just the number when only one map has it.",
    );
  }
  return { map: match[1] ?? null, number: Number(match[2]), text: reference };
}

/** Finds one ticket by `<map>/<number>`, or by bare number when only one map has it. */
export async function showTicket(runner: ProcessRunner, cwd: string, reference: string): Promise<Ticket> {
  const wanted = parseTicketReference(reference); // rejected before any tracker is read
  return findTicket((await loadTickets(runner, cwd)).tickets, wanted);
}

/** Picks the ticket a reference names out of `tickets`, or fails with the next action. */
export function findTicket(tickets: Ticket[], wanted: TicketReference): Ticket {
  const matches = tickets.filter(
    (t) => Number(t.id) === wanted.number && (wanted.map === null || t.map === wanted.map),
  );
  const [only, ...others] = matches;
  if (only === undefined) {
    throw new DrylandError(
      `There is no ticket "${wanted.text}".`,
      "Run `dryland ticket list` to see ticket ids, written as <map>/<number>.",
    );
  }
  if (others.length > 0) {
    throw new DrylandError(
      `Ticket "${wanted.text}" exists in several maps: ${matches.map((t) => `${t.map}/${t.id}`).join(", ")}.`,
      "Name the map too, as <map>/<number>.",
    );
  }
  return only;
}

export interface MapView extends MapModel {
  tickets: Ticket[];
}

export async function showMap(runner: ProcessRunner, cwd: string, name: string): Promise<MapView> {
  const { mainCheckout, tickets, maps } = await loadTickets(runner, cwd);
  const map = maps === null ? await readMapFile(mainCheckout, name) : maps.find((m) => m.name === name);
  if (map === undefined) {
    throw new DrylandError(
      `There is no map "${name}": no issue labelled "${GITHUB_MAP_LABEL}" has that number.`,
      "Run `dryland ticket list` to see the maps that have tickets, or start one with /wayfinder.",
    );
  }
  return { ...map, tickets: tickets.filter((t) => t.map === name) };
}

/** The open, unblocked, unclaimed tickets of a map, lowest number first. */
export async function mapFrontier(runner: ProcessRunner, cwd: string, name: string): Promise<Ticket[]> {
  return frontierOf((await showMap(runner, cwd, name)).tickets);
}

/** Efforts with a spec but no tickets. */
export async function specsWithoutTickets(runner: ProcessRunner, cwd: string): Promise<string[]> {
  const { mainCheckout, kind, tickets } = await loadTickets(runner, cwd);
  // Specs are local files; a remote tracker names its maps by issue number, so no effort could match them.
  return kind === "local-markdown" ? findSpecsWithoutTickets(mainCheckout, tickets) : [];
}

/** What a tracker write returns: the ticket as it now stands, and anything the user should know. */
export interface TicketWriteResult {
  ticket: Ticket;
  warnings: string[];
}

/** Reads the ticket afresh, so a decision made under the lock never rests on an earlier read. */
export async function currentTicket(mainCheckout: string, wanted: TicketReference) {
  const ticket = findTicket(await readTickets(mainCheckout), wanted);
  const path = await ticketFile(mainCheckout, ticket.map, ticket.id);
  if (path === null) {
    throw new DrylandError(
      `The file of ticket ${ticket.map}/${ticket.id} has gone.`,
      "Run `dryland ticket list` and try again.",
    );
  }
  return { ticket, path, text: await readFile(join(mainCheckout, path), "utf8") };
}
