import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const ticket = (title: string, ...header: string[]) => `# ${title}\n\n${header.join("\n")}\n\nBuild it.\n`;

/** A committed repo on `main` with one ready ticket (shop/02) and one blocked by it (shop/03). */
export function fixtureRepo(): string {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "dryland-desktop-repo-")));
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
    ".scratch/shop/map.md": "# Map: Shop\n\n## Not yet specified\n\nNothing.\n",
    ".scratch/shop/issues/02-grill.md": ticket("Grill the cart", "Type: task", "Status: ready-for-agent"),
    ".scratch/shop/issues/03-cart.md": ticket(
      "Build the cart",
      "Type: task",
      "Status: ready-for-agent",
      "Blocked by: 02",
    ),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), content);
  }
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  // `dryland` commits its tracker writes here.
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  git("add", ".");
  git("commit", "-q", "-m", "Fixture");
  return repo;
}
