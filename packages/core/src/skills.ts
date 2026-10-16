import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentAdapter } from "./agent-adapter.ts";
import { exists } from "./env-fs.ts";

/** A skill name that can follow the CLI's skill prefix: never empty, never starting with `-`, no spaces. */
export const SKILL_NAME = /^\w[\w.-]*$/;

/**
 * The skills the adapter's CLI has installed for `projectRoot`, by name, sorted: every directory holding a
 * `SKILL.md` under one of its skill directories, in the project or in `home`. A missing directory holds none.
 */
export async function installedSkills(
  adapter: AgentAdapter,
  projectRoot: string,
  home: string | null,
): Promise<string[]> {
  const roots = [projectRoot, ...(home === null ? [] : [home])];
  const names = new Set<string>();
  for (const root of roots) {
    for (const dir of adapter.skillDirs) {
      const entries = await readdir(join(root, dir), { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory() || !SKILL_NAME.test(entry.name)) continue;
        if (await exists(join(root, dir, entry.name, "SKILL.md"))) names.add(entry.name);
      }
    }
  }
  return [...names].sort();
}
