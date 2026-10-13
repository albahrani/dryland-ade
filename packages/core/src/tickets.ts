import { DrylandError } from "./errors.ts";
import { readLocalMarkdownTickets } from "./local-markdown.ts";
import { findMainCheckout } from "./main-checkout.ts";
import { findSpecsWithoutTickets, frontierOf, type MapModel, readMapFile } from "./map.ts";
import type { ProcessRunner } from "./process-runner.ts";
import type { Ticket } from "./ticket.ts";
import { readTrackerKind } from "./tracker.ts";
import { readTriageVocabulary } from "./triage-labels.ts";

/** Every ticket of the repo containing `cwd`, plus where its main checkout is. */
async function loadTickets(runner: ProcessRunner, cwd: string): Promise<{ mainCheckout: string; tickets: Ticket[] }> {
  const mainCheckout = await findMainCheckout(runner, cwd);
  const kind = await readTrackerKind(mainCheckout);
  if (kind !== "local-markdown") {
    throw new DrylandError(
      `The ${kind} tracker is not supported by this version of dryland yet.`,
      "Use a local-markdown tracker for now (/setup-matt-pocock-skills).",
    );
  }
  const vocabulary = await readTriageVocabulary(mainCheckout);
  return { mainCheckout, tickets: await readLocalMarkdownTickets(mainCheckout, vocabulary) };
}

/** Lists the tickets of the repo containing `cwd`, from the tracker its docs name. */
export async function listTickets(runner: ProcessRunner, cwd: string): Promise<Ticket[]> {
  return (await loadTickets(runner, cwd)).tickets;
}

/** Finds one ticket by `<map>/<id>`, or by bare id when only one map has it. */
export async function showTicket(runner: ProcessRunner, cwd: string, reference: string): Promise<Ticket> {
  const { tickets } = await loadTickets(runner, cwd);
  const [first, second] = reference.split("/");
  const [mapName, id] = second === undefined ? [undefined, first] : [first, second];
  const matches = tickets.filter(
    (t) => Number(t.id) === Number(id) && /^\d+$/.test(id ?? "") && (mapName === undefined || t.map === mapName),
  );
  const [only, ...others] = matches;
  if (only === undefined) {
    throw new DrylandError(
      `There is no ticket "${reference}".`,
      "Run `dryland ticket list` to see ticket ids, written as <map>/<number>.",
    );
  }
  if (others.length > 0) {
    throw new DrylandError(
      `Ticket "${reference}" exists in several maps: ${matches.map((t) => `${t.map}/${t.id}`).join(", ")}.`,
      "Name the map too, as <map>/<number>.",
    );
  }
  return only;
}

export interface MapView extends MapModel {
  tickets: Ticket[];
}

export async function showMap(runner: ProcessRunner, cwd: string, name: string): Promise<MapView> {
  const { mainCheckout, tickets } = await loadTickets(runner, cwd);
  const map = await readMapFile(mainCheckout, name);
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
