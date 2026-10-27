import { DrylandError } from "./errors.ts";
import type { ProcessRunner } from "./process-runner.ts";

/** A forge's own CLI, which Dryland drives with the user's login to open and look up pull and merge requests. */
interface ForgeCli {
  forge: "GitHub" | "GitLab";
  command: "gh" | "glab";
  installUrl: string;
}

const GH: ForgeCli = { forge: "GitHub", command: "gh", installUrl: "https://cli.github.com" };
const GLAB: ForgeCli = { forge: "GitLab", command: "glab", installUrl: "https://gitlab.com/gitlab-org/cli" };

/** Says why a failed CLI call failed: not installed, not logged in, or something else with the CLI's own message. */
async function explainCliFailure(
  cli: ForgeCli,
  runner: ProcessRunner,
  cwd: string,
  args: string[],
  stderr: string,
): Promise<DrylandError> {
  const { forge, command } = cli;
  if ((await runner.run(command, ["--version"], { cwd })).exitCode !== 0) {
    return new DrylandError(
      `The ${forge} integration needs \`${command}\`, but it is not installed.`,
      `Install ${command} from ${cli.installUrl}, then run \`${command} auth login\`.`,
    );
  }
  if ((await runner.run(command, ["auth", "status"], { cwd })).exitCode !== 0) {
    return new DrylandError(
      `The ${forge} integration needs \`${command}\`, but it is not logged in.`,
      `Run \`${command} auth login\`.`,
    );
  }
  const reason = stderr.trim().split("\n").slice(-3).join(" ") || "no error message";
  return new DrylandError(
    `\`${command} ${args.slice(0, 2).join(" ")}\` failed: ${reason}`,
    `Check that this repo has a ${forge} remote and that your \`${command}\` login can read and edit its requests.`,
  );
}

/** Runs a CLI call that must succeed and returns its trimmed output; a failure says what to do next. */
async function run(cli: ForgeCli, runner: ProcessRunner, cwd: string, args: string[]): Promise<string> {
  const result = await runner.run(cli.command, args, { cwd });
  if (result.exitCode !== 0) throw await explainCliFailure(cli, runner, cwd, args, result.stderr);
  return result.stdout.trim();
}

/** Runs a `gh` call that must succeed and returns its trimmed output. */
export const ghRun = (runner: ProcessRunner, cwd: string, args: string[]): Promise<string> =>
  run(GH, runner, cwd, args);

/** Runs a `glab` call that must succeed and returns its trimmed output. */
export const glabRun = (runner: ProcessRunner, cwd: string, args: string[]): Promise<string> =>
  run(GLAB, runner, cwd, args);

/** The JSON of a `glab` call that must succeed; a failure says what to do next. */
export async function glabRequired(runner: ProcessRunner, cwd: string, args: string[]): Promise<unknown> {
  const out = await glabRun(runner, cwd, args);
  try {
    return JSON.parse(out);
  } catch {
    throw await explainCliFailure(GLAB, runner, cwd, args, `glab printed output that is not JSON: ${out.slice(0, 80)}`);
  }
}

/** `projects/:id` is the project of the checkout, which `glab` fills in from the git remote. */
export const PROJECT = "projects/:id";

/** Which forge a git remote URL points at, by its host; `null` for any other host. */
export function forgeOfRemote(url: string): "github" | "gitlab" | null {
  const host = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/]*@)?([^/:]+)/i.exec(url.trim())?.[1]?.toLowerCase() ?? "";
  if (host === "github.com" || host.startsWith("github.")) return "github";
  if (host === "gitlab.com" || host.startsWith("gitlab.")) return "gitlab";
  return null;
}
