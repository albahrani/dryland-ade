import { access } from "node:fs/promises";

/** Whether `path` exists and is reachable. */
export async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** The spelling `env` uses for `name` (Windows spells it `Path`), or `name` itself when it is unset. */
export function envKey(env: Record<string, string | undefined>, name: string): string {
  return Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase()) ?? name;
}
