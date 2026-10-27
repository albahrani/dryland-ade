import { DrylandError } from "./errors.ts";
import { findMainCheckout } from "./main-checkout.ts";
import { findSpecsWithoutTickets, frontierOf, type MapModel } from "./map.ts";
import type { ProcessRunner } from "./process-runner.ts";
import type { Ticket } from "./ticket.ts";
import { decisionsOf, readStoreState, toMapModel, toTicket } from "./state-store.ts";

interface LoadedStore {
  tickets: Ticket[];
  /** Every effort that has a map record or a ticket; an effort without a map record shows its name only. */
  maps: MapModel[];
}

/** Every ticket and map of the state store of `mainCheckout`; fails with the next action when the repo has none. */
async function loadStore(mainCheckout: string): Promise<LoadedStore> {
  const state = await readStoreState(mainCheckout);
  const tickets = state.tickets.map(toTicket);
  const names = [...new Set([...state.maps.map((m) => m.effort), ...tickets.map((t) => t.map)])].sort();
  const maps = names.map((name): MapModel => {
    const map = state.maps.find((m) => m.effort === name);
    return map === undefined
      ? { name, title: name, destination: "", fog: [], decisions: decisionsOf(state.tickets, name) }
      : toMapModel(map, state.tickets);
  });
  return { tickets, maps };
}

/** Every ticket of the repo containing `cwd`, plus where its main checkout is. */
async function loadTickets(runner: ProcessRunner, cwd: string): Promise<{ mainCheckout: string } & LoadedStore> {
  const mainCheckout = await findMainCheckout(runner, cwd);
  return { mainCheckout, ...(await loadStore(mainCheckout)) };
}

/** Every ticket of the main checkout's state store. */
export async function readTickets(mainCheckout: string): Promise<Ticket[]> {
  return (await loadStore(mainCheckout)).tickets;
}

/** Lists the tickets of the repo containing `cwd`. */
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

/** Parses `<map>/<number>` or a bare `<number>`; anything else is rejected before the store is read. */
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
      `Ticket "${wanted.text}" exists in several efforts: ${matches.map((t) => `${t.map}/${t.id}`).join(", ")}.`,
      "Name the map too, as <map>/<number>.",
    );
  }
  return only;
}

export interface MapView extends MapModel {
  tickets: Ticket[];
}

export async function showMap(runner: ProcessRunner, cwd: string, name: string): Promise<MapView> {
  const { tickets, maps } = await loadTickets(runner, cwd);
  const map = maps.find((m) => m.name === name);
  if (map === undefined) {
    throw new DrylandError(
      `There is no map "${name}".`,
      "Run `dryland ticket list` to see the maps that have tickets, or start one with `dryland map create`.",
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
  const { mainCheckout, tickets } = await loadTickets(runner, cwd);
  return findSpecsWithoutTickets(mainCheckout, tickets);
}
