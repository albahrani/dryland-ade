import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { DrylandError, nextSteps, nodeProcessRunner, type ProcessRunner, readProjectState } from "../src/index.ts";

function checkout(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "dryland-project-state-"));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

const ticket = (title: string, ...header: string[]) => `# ${title}\n\n${header.join("\n")}\n\n## Question\n\nWhat?\n`;

describe("readProjectState", () => {
  it("reads the tickets tree and the repo snapshot from one pass over the tracker files", async () => {
    const root = checkout({
      "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
      ".scratch/shop/map.md": "# Map: Shop\n\n## Not yet specified\n\n- Payments\n",
      ".scratch/shop/issues/01-cart.md": ticket("Grill the cart", "Type: grilling"),
      ".scratch/blog/spec.md": "# Blog\n",
    });

    const { tree, snapshot } = await readProjectState(nodeProcessRunner, root);

    expect(tree.maps.map((m) => [m.name, m.title, m.fog])).toEqual([
      ["blog", "blog", []],
      ["shop", "Shop", ["Payments"]],
    ]);
    expect(tree.maps[1]?.planning.map((t) => t.title)).toEqual(["Grill the cart"]);
    expect(snapshot.efforts.map((e) => [e.name, e.hasSpec, e.map?.fog.length ?? null])).toEqual([
      ["blog", true, null],
      ["shop", false, 1],
    ]);
    expect(nextSteps(snapshot).map((s) => [s.ruleId, s.target])).toEqual([
      ["map-frontier", { kind: "ticket", map: "shop", id: "01" }],
      ["spec-without-tickets", { kind: "spec", map: "blog" }],
    ]);
  });

  it("reports a repo without skills or tracker doc as not set up, with /setup-matt-pocock-skills as the next step", async () => {
    const root = checkout({ "README.md": "hi\n" });

    const { skillSetup, snapshot } = await readProjectState(nodeProcessRunner, root);

    expect(skillSetup.state).toBe("not-set-up");
    expect(nextSteps(snapshot).map((s) => [s.ruleId, s.command])).toEqual([
      ["no-setup-config", "/setup-matt-pocock-skills"],
    ]);
  });

  it("feeds the live sessions it is given into the snapshot, and leaves them unknown when it is given none", async () => {
    const root = checkout({
      "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
      ".scratch/shop/map.md": "# Map: Shop\n\n## Not yet specified\n\nNothing.\n",
      ".scratch/shop/issues/01-cart.md": ticket("Build the cart", "Type: task", "Status: claimed"),
      ".scratch/shop/issues/02-pay.md": ticket("Build payments", "Type: task", "Status: claimed"),
    });
    const sessions = [{ id: "s1", ticket: { map: "shop", id: "02" }, state: "waiting" as const }];

    const live = await readProjectState(nodeProcessRunner, root, sessions);
    const unknown = await readProjectState(nodeProcessRunner, root);

    expect(
      nextSteps(live.snapshot).map((s) => [s.ruleId, s.target.kind === "ticket" ? s.target.id : s.target.kind]),
    ).toEqual([
      ["waiting-session", "session"],
      ["stale-claim", "01"],
    ]);
    expect(nextSteps(unknown.snapshot)).toEqual([]);
  });

  it("reads a claimed ticket the session index knows, with no live session, as paused", async () => {
    const root = checkout({
      "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
      ".scratch/shop/map.md": "# Map: Shop\n\n## Not yet specified\n\nNothing.\n",
      ".scratch/shop/issues/01-cart.md": ticket("Build the cart", "Type: task", "Status: claimed"),
      ".scratch/shop/issues/02-pay.md": ticket("Build payments", "Type: task", "Status: claimed"),
      ".scratch/shop/issues/03-ship.md": ticket("Build shipping", "Type: task", "Status: claimed"),
      ".scratch/shop/issues/04-tax.md": ticket("Build tax", "Type: task", "Status: claimed"),
      ".scratch/shop/issues/05-fees.md": ticket("Build fees", "Type: task", "Status: claimed"),
    });
    execFileSync("git", ["init", "-q"], { cwd: root });
    const seen = (sessionId: string, lastState?: string) => [
      { adapter: "claude-code", sessionId, lastSeen: "2026-10-15T09:00:00.000Z", ...(lastState ? { lastState } : {}) },
    ];
    mkdirSync(join(root, ".git", "dryland"), { recursive: true });
    writeFileSync(
      join(root, ".git", "dryland", "sessions.json"),
      JSON.stringify({
        items: {
          "shop/01": seen("c1", "waiting"),
          "shop/02": seen("c2", "running"),
          "shop/03": seen("c3", "idle"),
          "shop/04": seen("c4"),
        },
      }),
    );
    const sessions = [{ id: "s5", ticket: { map: "shop", id: "05" }, state: "running" as const }];

    const { snapshot } = await readProjectState(nodeProcessRunner, root, sessions);

    expect(snapshot.sessions).toEqual([
      ...sessions,
      { id: "c1", ticket: { map: "shop", id: "01" }, state: "paused", was: "waiting" },
      { id: "c2", ticket: { map: "shop", id: "02" }, state: "paused", was: "interrupted" },
      { id: "c3", ticket: { map: "shop", id: "03" }, state: "paused", was: null },
      { id: "c4", ticket: { map: "shop", id: "04" }, state: "paused", was: null },
    ]);
    expect(nextSteps(snapshot).map((s) => s.ruleId)).toEqual(["paused-was-waiting"]);
  });

  it("calls a claim stale when neither a live session nor the session index knows it", async () => {
    const root = checkout({
      "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
      ".scratch/shop/map.md": "# Map: Shop\n\n## Not yet specified\n\nNothing.\n",
      ".scratch/shop/issues/01-cart.md": ticket("Build the cart", "Type: task", "Status: claimed"),
    });
    execFileSync("git", ["init", "-q"], { cwd: root });

    const { snapshot } = await readProjectState(nodeProcessRunner, root, []);

    expect(nextSteps(snapshot).map((s) => s.ruleId)).toEqual(["stale-claim"]);
  });

  it("leaves sessions unknown, reading no index, when it is given none", async () => {
    const root = checkout({
      "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
      ".scratch/shop/issues/01-cart.md": ticket("Build the cart", "Type: task", "Status: claimed"),
    });
    execFileSync("git", ["init", "-q"], { cwd: root });
    mkdirSync(join(root, ".git", "dryland"), { recursive: true });
    writeFileSync(
      join(root, ".git", "dryland", "sessions.json"),
      JSON.stringify({
        items: { "shop/01": [{ adapter: "claude-code", sessionId: "c1", lastSeen: "2026-10-15T09:00:00.000Z" }] },
      }),
    );

    expect((await readProjectState(nodeProcessRunner, root)).snapshot.sessions).toBeNull();
  });
});

describe("readProjectState with a GitHub tracker and a broken gh", () => {
  const github = () => checkout({ "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n" });
  /** `gh issue list` fails; `gh --version` and `gh auth status` succeed unless named in `failing`. */
  const runner = (failing: string[]): ProcessRunner => ({
    async run(command, args) {
      const call = [command, ...args].join(" ");
      const broken = call.startsWith("git ") ? false : call.startsWith("gh issue") || failing.includes(call);
      return { stdout: "", stderr: broken ? "boom" : "", exitCode: broken ? 1 : 0 };
    },
  });

  it("says gh is missing and what to install, instead of an empty tree", async () => {
    const error = await readProjectState(runner(["gh --version"]), github()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DrylandError);
    expect((error as DrylandError).message).toContain("not installed");
    expect((error as DrylandError).nextAction).toContain("gh auth login");
  });

  it("says gh is logged out and to log in", async () => {
    const error = await readProjectState(runner(["gh auth status"]), github()).catch((e: unknown) => e);

    expect((error as DrylandError).message).toContain("not logged in");
    expect((error as DrylandError).nextAction).toBe("Run `gh auth login`.");
  });
});
