import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type ProcessRunner, readTickets } from "@dryland/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackerPoller } from "../src/main/tracker-poller.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function repo(tracker: string): string {
  const root = mkdtempSync(join(tmpdir(), "dryland-poller-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  mkdirSync(dirname(join(root, "docs/agents/issue-tracker.md")), { recursive: true });
  writeFileSync(join(root, "docs/agents/issue-tracker.md"), `# Issue tracker: ${tracker}\n`);
  return root;
}

/** A `gh` whose open map holds the issues in `remote.issues`; every call is recorded. */
function fakeGh(remote: { issues: number[] }, calls: string[]): ProcessRunner {
  return {
    async run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command !== "gh") return { stdout: "", stderr: "", exitCode: 1 };
      const path = args.join(" ");
      const json =
        args[0] === "issue"
          ? [{ number: 1, title: "Map", body: "", state: "open", labels: [{ name: "map" }] }]
          : path.endsWith("/sub_issues")
            ? remote.issues.map((number) => ({ number, title: `Ticket ${number}`, body: "", state: "open" }))
            : [];
      return { stdout: JSON.stringify(json), stderr: "", exitCode: 0 };
    },
  };
}

describe("TrackerPoller", () => {
  it("shows a remote change after the interval, and after the window regains focus", async () => {
    const root = repo("GitHub");
    const remote = { issues: [2] };
    const runner = fakeGh(remote, []);
    const seen: string[][] = [];
    const poller = new TrackerPoller(async () => {
      seen.push((await readTickets(root, runner)).map((t) => t.title));
    }, 60_000);
    poller.start("github");

    remote.issues = [2, 3];
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect(seen.at(-1)).toEqual(["Ticket 2", "Ticket 3"]));

    remote.issues = [2, 3, 4];
    await poller.focus();
    expect(seen.at(-1)).toEqual(["Ticket 2", "Ticket 3", "Ticket 4"]);
    poller.stop();
  });

  it("does not poll, on a timer or on focus, for local markdown", async () => {
    const reload = vi.fn(async () => undefined);
    const poller = new TrackerPoller(reload, 60_000);
    poller.start("local-markdown");

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await poller.focus();

    expect(reload).not.toHaveBeenCalled();
  });

  it("stops polling once stopped, and does not overlap a slow reload", async () => {
    let finish = () => {};
    const reload = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const poller = new TrackerPoller(reload, 1000);
    poller.start("gitlab");

    await vi.advanceTimersByTimeAsync(3000);
    expect(reload).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).toHaveBeenCalledTimes(2);

    poller.stop();
    finish();
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
