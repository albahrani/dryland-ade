import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const ticket = (title: string, ...header: string[]) => `# ${title}\n\n${header.join("\n")}\n\n## Question\n\nWhat?\n`;

/** A map with fog, a frontier ticket (02) and a ticket blocked by it (03). */
function fixtureRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "dryland-e2e-next-up-"));
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
    ".scratch/shop/map.md": "# Map: Shop\n\n## Not yet specified\n\n- Payments\n",
    ".scratch/shop/issues/02-grill.md": ticket("Grill the cart", "Type: grilling"),
    ".scratch/shop/issues/03-cart.md": ticket("Grill the checkout", "Type: grilling", "Blocked by: 02"),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), content);
  }
  execFileSync("git", ["init", "-q", repo]);
  return repo;
}

test("marks the next-up items, explains them, answers why not, and follows the files on disk", async () => {
  const repo = fixtureRepo();
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  const window = await app.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();

  // The frontier ticket carries the marker, with the one-sentence reason as its tooltip; the blocked one does not.
  const reason02 = 'Ticket 02 "Grill the cart" is open, unblocked and unclaimed on map shop.';
  const marked = window.locator(".tickets li.next-up");
  await expect(marked).toHaveCount(1);
  await expect(marked).toContainText("Grill the cart");
  await expect(marked.getByRole("img", { name: `Next up: ${reason02}` })).toHaveAttribute("title", reason02);

  // The Maps view marks the map whose ticket is next.
  // The Maps view marks a map only when the map itself is next, never for one of its tickets.
  await window.getByRole("button", { name: "Maps" }).click();
  await expect(window.locator(".map-list li.next-up")).toHaveCount(0);
  await window.getByRole("button", { name: "Tickets" }).click();

  // The details view of a marked ticket: rule, reason and evidence naming artifact and field.
  await window.getByRole("button", { name: "Grill the cart" }).click();
  const why = window.getByRole("region", { name: "Why this next" });
  await expect(why.getByText(reason02)).toBeVisible();
  await expect(why.getByText("map-frontier")).toBeVisible();
  await expect(why.getByText("/wayfinder shop")).toBeVisible();
  const evidence = why.getByRole("table", { name: "Evidence" });
  await expect(evidence.getByRole("row", { name: /shop\/02 Blocked by none/ })).toBeVisible();

  // "Why not this?" on the blocked ticket lists its unresolved blocker.
  await window.getByRole("button", { name: "Grill the checkout" }).click();
  await window.getByRole("button", { name: "Why not this?" }).click();
  await expect(window.getByText("Blocked by 02: not resolved yet.")).toBeVisible();

  // Resolving 02 on disk moves the marker to 03.
  writeFileSync(
    join(repo, ".scratch/shop/issues/02-grill.md"),
    ticket("Grill the cart", "Type: grilling", "Status: resolved"),
  );
  await expect(marked).toHaveCount(1);
  await expect(marked).toContainText("Grill the checkout");

  // With only fog left, the map itself carries the marker.
  writeFileSync(
    join(repo, ".scratch/shop/issues/03-cart.md"),
    ticket("Grill the checkout", "Type: grilling", "Blocked by: 02", "Status: resolved"),
  );
  await expect(marked).toHaveCount(0);
  await expect(window.locator(".tickets .branch-head.next-up")).toContainText("Shop");
  await expect(
    window.getByRole("img", {
      name: "Next up: Map shop has no open ticket left and 1 item of fog, so the map itself is next.",
    }),
  ).toBeVisible();
  await window.getByRole("button", { name: "Maps" }).click();
  await expect(window.locator(".map-list li.next-up")).toContainText("Shop");

  // The map's tab explains the marker.
  await window.getByRole("button", { name: /^Shop/ }).click();
  await expect(window.getByRole("region", { name: "Why this next" }).getByText("map-fog-only")).toBeVisible();
  await app.close();
});
