import { DrylandError } from "./errors.ts";
import type { ProcessRunner } from "./process-runner.ts";

/** The CLI a remote tracker is driven through, as its error messages name it. */
export interface TrackerCli {
  tracker: "GitHub" | "GitLab";
  command: "gh" | "glab";
  installUrl: string;
}

/** Says why a failed CLI call failed: not installed, not logged in, or something else with the CLI's own message. */
export async function explainCliFailure(
  cli: TrackerCli,
  runner: ProcessRunner,
  cwd: string,
  args: string[],
  stderr: string,
): Promise<DrylandError> {
  const { tracker, command } = cli;
  if ((await runner.run(command, ["--version"], { cwd })).exitCode !== 0) {
    return new DrylandError(
      `The ${tracker} tracker needs \`${command}\`, but it is not installed.`,
      `Install ${command} from ${cli.installUrl}, then run \`${command} auth login\`.`,
    );
  }
  if ((await runner.run(command, ["auth", "status"], { cwd })).exitCode !== 0) {
    return new DrylandError(
      `The ${tracker} tracker needs \`${command}\`, but it is not logged in.`,
      `Run \`${command} auth login\`.`,
    );
  }
  const reason = stderr.trim().split("\n").slice(-3).join(" ") || "no error message";
  return new DrylandError(
    `\`${command} ${args.slice(0, 2).join(" ")}\` failed: ${reason}`,
    `Check that this repo has a ${tracker} remote and that your \`${command}\` login can read and edit its issues.`,
  );
}
