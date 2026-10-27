import { DrylandError } from "./errors.ts";
import { assertMapName, frontierOf } from "./map.ts";
import {
  decisionsOf,
  readStoreState,
  type StoreMap,
  type StoreState,
  type StoreTicket,
  toTicket,
} from "./state-store.ts";
import { READ_SCHEMAS } from "./store-schemas.ts";
import { findTicket, parseTicketReference } from "./tickets.ts";

/** What a read returns for one ticket: the fields it was created with plus the ones the store derives. */
export interface TicketDocument extends Omit<StoreTicket, "blockedBy"> {
  $schema: string;
  /** `effort/NN`, the reference every command takes. */
  ref: string;
  /** References of the tickets that block this one. */
  blockedBy: string[];
}

const refOf = (effort: string, id: string) => `${effort}/${id}`;

export function ticketDocument(t: StoreTicket): TicketDocument {
  return {
    $schema: READ_SCHEMAS.ticket,
    ref: refOf(t.effort, t.id),
    ...t,
    blockedBy: t.blockedBy.map((id) => refOf(t.effort, id)),
  };
}

const byRef = (a: StoreTicket, b: StoreTicket) => a.effort.localeCompare(b.effort) || Number(a.id) - Number(b.id);

/** Every ticket, as documents, ordered by effort and number. */
export async function listStoreTickets(cwd: string) {
  const { tickets } = await readStoreState(cwd);
  return { $schema: READ_SCHEMAS.tickets, tickets: [...tickets].sort(byRef).map(ticketDocument) };
}

/** One ticket by `effort/NN`, or by bare number when only one effort has it. */
export async function showStoreTicket(cwd: string, reference: string): Promise<TicketDocument> {
  const wanted = parseTicketReference(reference); // rejected before the store is read
  const { tickets } = await readStoreState(cwd);
  const found = findTicket(tickets.map(toTicket), wanted);
  const ticket = tickets.find((t) => t.effort === found.map && t.id === found.id) as StoreTicket;
  return ticketDocument(ticket);
}

function requireEffort(state: StoreState, effort: string): void {
  try {
    assertMapName(effort);
  } catch {
    throw new DrylandError(`"${effort}" is not an effort slug.`, "Pass the effort as one word, e.g. shop.");
  }
  if (!state.maps.some((m) => m.effort === effort) && !state.tickets.some((t) => t.effort === effort)) {
    throw new DrylandError(
      `There is no effort "${effort}": it has no map and no tickets.`,
      "Run `dryland ticket list` to see the efforts, or create one with `dryland map create`.",
    );
  }
}

export interface MapDocument {
  $schema: string;
  effort: string;
  /** `null` for an effort that has tickets but no map. */
  map: Omit<StoreMap, "effort"> | null;
  /** Decisions so far: the resolved tickets, each as its title and the first sentence of its summary. */
  decisions: string[];
  tickets: TicketDocument[];
}

/** An effort's map record (when it has one) with its tickets, which the text view groups. */
export async function showStoreMap(cwd: string, effort: string): Promise<MapDocument> {
  const state = await readStoreState(cwd);
  requireEffort(state, effort);
  const record = state.maps.find((m) => m.effort === effort);
  return {
    $schema: READ_SCHEMAS.map,
    effort,
    map:
      record === undefined
        ? null
        : {
            title: record.title,
            destination: record.destination,
            notes: record.notes,
            fog: record.fog,
            outOfScope: record.outOfScope,
          },
    decisions: decisionsOf(state.tickets, effort),
    tickets: state.tickets
      .filter((t) => t.effort === effort)
      .sort(byRef)
      .map(ticketDocument),
  };
}

/** The open, unblocked, unclaimed tickets of an effort, lowest number first. Writes nothing. */
export async function storeFrontier(cwd: string, effort: string) {
  const state = await readStoreState(cwd);
  requireEffort(state, effort);
  const ids = new Set(frontierOf(state.tickets.filter((t) => t.effort === effort).map(toTicket)).map((t) => t.id));
  return {
    $schema: READ_SCHEMAS.frontier,
    effort,
    tickets: state.tickets
      .filter((t) => t.effort === effort && ids.has(t.id))
      .sort(byRef)
      .map(ticketDocument),
  };
}
