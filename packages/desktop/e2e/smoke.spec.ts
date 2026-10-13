import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const ticket = (title: string, ...header: string[]) => `# ${title}\n\n${header.join("\n")}\n\n## Question\n\nWhat?\n`;

function fixtureRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "dryland-e2e-repo-"));
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
    ".scratch/shop/map.md": "# Map: Shop\n\n## Destination\n\nSell things.\n\n## Not yet specified\n\n- Payments\n",
    ".scratch/shop/issues/01-done.md": ticket("Set up repo", "Type: task", "Status: resolved"),
    ".scratch/shop/issues/02-grill.md": ticket("Grill the cart", "Type: grilling", "Status: ready-for-agent"),
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
  execFileSync("git", ["init", "-q", repo]);
  return repo;
}

test("opens a repo, shows its tickets tree, refreshes on disk changes and reopens the project", async () => {
  const repo = fixtureRepo();
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const launch = () => electron.launch({ args: [".", `--user-data-dir=${userData}`] });

  // First run: open the project through the folder picker, which the test answers.
  const first = await launch();
  await first.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  let window = await first.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();

  await expect(window.getByRole("button", { name: /Shop/ })).toBeVisible();
  await expect(window.getByText("Grill the cart")).toBeVisible();
  await expect(window.getByText("blocked by 02")).toBeVisible();
  await expect(window.getByRole("img", { name: "Ready" }).first()).toHaveAttribute("title", "Ready");
  await expect(window.getByRole("complementary", { name: "Legend" })).toBeVisible();

  // Done tickets are folded into one line that expands.
  await expect(window.getByText("Set up repo")).toHaveCount(0);
  await window.getByRole("button", { name: /1 done/ }).click();
  await expect(window.getByText("Set up repo")).toBeVisible();

  // Editing a ticket file on disk updates the tree without a restart.
  writeFileSync(
    join(repo, ".scratch/shop/issues/02-grill.md"),
    ticket("Grill the cart", "Type: grilling", "Status: resolved"),
  );
  await expect(window.getByRole("button", { name: /2 done/ })).toBeVisible();
  await expect(window.getByText("blocked by 02")).toHaveCount(0);

  await window.getByRole("button", { name: "Dismiss legend" }).click();
  await first.close();

  // Second run: same user data, no picker. The project is back and the legend stays dismissed.
  const second = await launch();
  window = await second.firstWindow();
  await expect(window.getByRole("button", { name: /Shop/ })).toBeVisible();
  await expect(window.getByText("Build the cart")).toBeVisible();
  await expect(window.getByRole("complementary", { name: "Legend" })).toHaveCount(0);
  await second.close();
});
