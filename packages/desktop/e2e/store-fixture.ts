import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dryland } from "../test/fixture-repo.ts";

export { dryland };

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

/**
 * A committed git repo on `main` with an initialised state store and no efforts. `dir` names the folder the repo
 * is in (a fresh temp folder otherwise), so a test can control the project's name.
 */
export function storeRepo(prefix = "dryland-e2e-store-", dir?: string): string {
  const repo = dir ?? realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "commit", "-q", "--allow-empty", "-m", "Fixture");
  dryland(repo, undefined, "init");
  return repo;
}

export interface TicketSpec {
  title: string;
  type?: string;
  report?: string;
  blockedBy?: string[];
  criteria?: { text: string; done: boolean }[];
}

/** Creates a map (an effort and its map document). */
export function createMap(
  repo: string,
  effort: string,
  title: string,
  extra: { destination?: string; fog?: string[]; notes?: string } = {},
): void {
  dryland(repo, { effort, title, destination: "Get there.", ...extra }, "map", "create");
}

/** Creates a ticket in `effort`; the store numbers it from 01 in creation order. */
export function createTicket(repo: string, effort: string, spec: TicketSpec): void {
  dryland(repo, { effort, type: "task", report: "What?", ...spec }, "ticket", "create");
}

/** Resolves ticket `ref` (for example `shop/01`) from the repo's main checkout. */
export function resolveTicket(repo: string, ref: string, answer = "Done."): void {
  dryland(repo, undefined, "ticket", "resolve", ref, "--answer", answer);
}

/**
 * A repo with the effort `shop`: map document with the destination "Sell things." and the fog "Payments", a
 * resolved shop/01 "Set up repo", a ready shop/02 "Grill the cart" (type grilling) and shop/03 "Build the cart"
 * blocked by 02.
 */
export function shopRepo(prefix = "dryland-e2e-repo-"): string {
  const repo = storeRepo(prefix);
  createMap(repo, "shop", "Shop", { destination: "Sell things.", fog: ["Payments"] });
  createTicket(repo, "shop", { title: "Set up repo" });
  resolveTicket(repo, "shop/01");
  createTicket(repo, "shop", { title: "Grill the cart", type: "grilling" });
  createTicket(repo, "shop", { title: "Build the cart", blockedBy: ["shop/02"] });
  return repo;
}
