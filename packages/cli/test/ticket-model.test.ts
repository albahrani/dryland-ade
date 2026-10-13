import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

const LOCAL_TRACKER_DOC = "# Issue tracker: Local Markdown\n\nIssues live in `.scratch/`.\n";
const base = { "docs/agents/issue-tracker.md": LOCAL_TRACKER_DOC };

const FIXTURES = join(import.meta.dirname, "fixtures/real-scratch");

/** This repo's own wayfinding map, its first 22 tickets and its triage vocabulary. */
function realRepo(extra: Record<string, string> = {}): TempRepo {
  const files: Record<string, string> = {
    ...base,
    "docs/agents/triage-labels.md": readFileSync(join(FIXTURES, "triage-labels.md"), "utf8"),
    ".scratch/mattpocock-ade/map.md": readFileSync(join(FIXTURES, "mattpocock-ade/map.md"), "utf8"),
  };
  const issues = join(FIXTURES, "mattpocock-ade/issues");
  for (const name of readdirSync(issues)) {
    files[`.scratch/mattpocock-ade/issues/${name}`] = readFileSync(join(issues, name), "utf8");
  }
  return TempRepo.create({ ...files, ...extra });
}

const SHOP_MAP = [
  "# Map: Shop",
  "",
  "## Destination",
  "",
  "A shop that sells things.",
  "",
  "## Decisions so far",
  "",
  "<!-- the index -->",
  "",
  "- [Cart](issues/01-cart.md): carts are server side",
  "",
  "## Not yet specified",
  "",
  "<!-- see Fog of war -->",
  "",
  "- Payment providers: which one, and whether to proxy webhooks",
  "- Tax rules per region,",
  "  once the shipping model is known",
  "",
  "## Out of scope",
  "",
  "- Marketplace sellers",
  "",
].join("\n");

const shopTicket = (title: string, ...lines: string[]) => [`# ${title}`, "", ...lines, ""].join("\n");

describe("dryland ticket show", () => {
  it("returns the full normalized model with --json", async () => {
    const repo = TempRepo.create({
      ...base,
      ".scratch/shop/issues/01-cart.md": shopTicket("Build the cart", "Type: task", "Status: resolved"),
      ".scratch/shop/issues/02-checkout.md": [
        "# Build checkout",
        "",
        "Type: grilling",
        "Status: claimed",
        "Claimed by: alex",
        "Blocked by: 01, #03",
        "Spec: [spec](../spec.md)",
        "",
        "## Question",
        "",
        "How does checkout talk to payments?",
        "",
        "## Answer",
        "",
        "Through a hosted page.",
        "",
        "## Comments",
        "",
        "### First",
        "",
        "Looks right.",
        "",
        "---",
        "",
        "Second thought.",
        "",
      ].join("\n"),
    });

    const result = await repo.run(["ticket", "show", "shop/02", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      id: "02",
      map: "shop",
      title: "Build checkout",
      type: "grilling",
      state: "claimed",
      claimant: null,
      blockers: ["01", "03"],
      triageRole: null,
      body: "## Question\n\nHow does checkout talk to payments?",
      answer: "Through a hosted page.",
      comments: ["### First\n\nLooks right.", "Second thought."],
      raw: { "Claimed by": "alex", Spec: "[spec](../spec.md)" },
    });
  });

  it("prints blockers, answer and comments as plain text", async () => {
    const repo = TempRepo.create({
      ...base,
      ".scratch/shop/issues/01-cart.md": shopTicket("Build the cart", "Type: task", "Status: resolved"),
      ".scratch/shop/issues/02-checkout.md": [
        "# Build checkout",
        "",
        "Type: grilling",
        "Status: resolved",
        "Blocked by: 01",
        "",
        "## Question",
        "",
        "How?",
        "",
        "## Answer",
        "",
        "Hosted page.",
        "",
        "## Comments",
        "",
        "Nice.",
        "",
      ].join("\n"),
    });

    const result = await repo.run(["ticket", "show", "02"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("shop/02  Build checkout");
    expect(result.stdout).toContain("Blocked by: 01");
    expect(result.stdout).toContain("State: resolved");
    expect(result.stdout).toContain("Answer:\nHosted page.");
    expect(result.stdout).toContain("Nice.");
  });

  it("maps a status to its triage role using the repo's triage vocabulary", async () => {
    const repo = TempRepo.create({
      ...base,
      "docs/agents/triage-labels.md": [
        "| Label in mattpocock/skills | Label in our tracker | Meaning |",
        "| --- | --- | --- |",
        "| `needs-triage` | `inbox` | look at it |",
        "| `ready-for-agent` | `afk` | go |",
      ].join("\n"),
      ".scratch/shop/issues/01-a.md": shopTicket("A", "Type: task", "Status: afk"),
      ".scratch/shop/issues/02-b.md": shopTicket("B", "Status: inbox"),
      ".scratch/shop/issues/03-c.md": shopTicket("C", "Status: ready-for-agent"),
      ".scratch/shop/issues/04-d.md": shopTicket("D", "Status: resolved"),
    });

    const result = await repo.run(["ticket", "list", "--json"]);

    const roles = (JSON.parse(result.stdout) as { id: string; triageRole: string | null }[]).map((t) => t.triageRole);
    expect(roles).toEqual(["ready-for-agent", "needs-triage", "ready-for-agent", null]);
  });

  it("treats a ticket without a Blocked by line as having no blockers", async () => {
    const repo = TempRepo.create({
      ...base,
      ".scratch/shop/issues/01-cart.md": shopTicket("Build the cart", "Type: task"),
    });

    const result = await repo.run(["ticket", "show", "shop/01", "--json"]);

    expect(JSON.parse(result.stdout)).toMatchObject({ blockers: [], answer: null, comments: [], claimant: null });
  });

  it("reports blockers as unknown when the line holds no ticket numbers, and keeps such tickets off the frontier", async () => {
    const repo = TempRepo.create({
      ...base,
      ".scratch/shop/map.md": SHOP_MAP,
      ".scratch/shop/issues/01-vague.md": shopTicket("Vague", "Type: task", "Blocked by: the payments PR"),
    });

    const shown = await repo.run(["ticket", "show", "shop/01", "--json"]);
    const frontier = await repo.run(["map", "frontier", "shop"]);

    expect(JSON.parse(shown.stdout)).toMatchObject({ blockers: "unknown" });
    expect(frontier.stdout).toBe("No frontier tickets.\n");
  });

  it("does not split a ticket at ## lines inside a code fence", async () => {
    const repo = TempRepo.create({
      ...base,
      ".scratch/shop/issues/01-fence.md": shopTicket(
        "Fence",
        "Type: task",
        "## What to build",
        "",
        "```md",
        "## Answer",
        "not an answer",
        "```",
        "",
        "## Answer",
        "",
        "Real.",
      ),
    });

    const result = await repo.run(["ticket", "show", "shop/01", "--json"]);

    expect(JSON.parse(result.stdout)).toMatchObject({ answer: "Real." });
    expect(JSON.parse(result.stdout).body).toContain("not an answer");
  });

  it("asks for the map when a bare id exists in several maps", async () => {
    const repo = TempRepo.create({
      ...base,
      ".scratch/shop/issues/01-cart.md": shopTicket("Cart", "Type: task"),
      ".scratch/blog/issues/01-posts.md": shopTicket("Posts", "Type: task"),
    });

    const result = await repo.run(["ticket", "show", "01"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("blog/01");
    expect(result.stderr).toContain("shop/01");
    expect(result.stderr).toContain("Next:");
  });

  it("exits non-zero and names the next action for an unknown ticket", async () => {
    const repo = TempRepo.create({ ...base, ".scratch/shop/issues/01-cart.md": shopTicket("Cart", "Type: task") });

    const result = await repo.run(["ticket", "show", "shop/09"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("dryland ticket list");
  });

  it("rejects a malformed reference before reading the tracker", async () => {
    const repo = TempRepo.create({}); // no tracker doc: only the reference check can explain the failure

    const result = await repo.run(["ticket", "show", "shop/"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('"shop/" is not a ticket reference');
    expect(result.stderr).toContain("<map>/<number>");
  });

  it("parses the same with a dryland annotation as without", async () => {
    const plain = shopTicket(
      "Build checkout",
      "Type: grilling",
      "Status: claimed",
      "Blocked by: 01",
      "",
      "## Question",
      "",
      "How?",
    );
    const annotated = [
      "# Build checkout",
      "<!-- dryland: created-by=dryland -->",
      "",
      "Type: grilling",
      "Status: claimed <!-- dryland: claimed-at=2026-01-01 -->",
      "Blocked by: 01",
      "",
      "## Question",
      "<!-- dryland: note",
      "spanning lines -->",
      "",
      "How?",
      "",
    ].join("\n");
    const a = TempRepo.create({ ...base, ".scratch/shop/issues/02-checkout.md": plain });
    const b = TempRepo.create({ ...base, ".scratch/shop/issues/02-checkout.md": annotated });

    const [fromPlain, fromAnnotated] = await Promise.all([
      a.run(["ticket", "show", "shop/02", "--json"]),
      b.run(["ticket", "show", "shop/02", "--json"]),
    ]);

    expect(fromAnnotated.exitCode).toBe(0);
    expect(JSON.parse(fromAnnotated.stdout)).toEqual(JSON.parse(fromPlain.stdout));
  });

  it("shows this repo's real resolved ticket with its answer", async () => {
    const result = await realRepo().run(["ticket", "show", "mattpocock-ade/13", "--json"]);

    expect(result.exitCode).toBe(0);
    const ticket = JSON.parse(result.stdout);
    expect(ticket).toMatchObject({
      id: "13",
      title: "ADE write policy and non-default skill setups",
      type: "grilling",
      state: "resolved",
      blockers: [],
      triageRole: null,
    });
    expect(ticket.body).toMatch(/^## Question/);
    expect(ticket.answer).toMatch(/^Decided in a grilling session/);
  });

  it("shows this repo's real open ticket with its blockers and triage role", async () => {
    const result = await realRepo().run(["ticket", "show", "mattpocock-ade/22", "--json"]);

    expect(JSON.parse(result.stdout)).toMatchObject({
      id: "22",
      type: "task",
      state: "open",
      blockers: ["20"],
      triageRole: "ready-for-agent",
      answer: null,
    });
  });
});

describe("dryland map show", () => {
  it("groups tickets by kind and lists the fog and decisions", async () => {
    const repo = TempRepo.create({
      ...base,
      ".scratch/shop/map.md": SHOP_MAP,
      ".scratch/shop/issues/01-cart.md": shopTicket("Cart", "Type: grilling", "Status: resolved"),
      ".scratch/shop/issues/02-research.md": shopTicket("Gateways", "Type: research"),
      ".scratch/shop/issues/03-build.md": shopTicket("Build cart", "Type: task", "Status: ready-for-agent"),
    });

    const result = await repo.run(["map", "show", "shop"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      [
        "Map: Shop (shop)",
        "",
        "Destination: A shop that sells things.",
        "",
        "Planning:",
        "  shop/01  resolved  grilling  Cart",
        "  shop/02  open      research  Gateways",
        "",
        "Implementation:",
        "  shop/03  open  task  Build cart",
        "",
        "Fog:",
        "  - Payment providers: which one, and whether to proxy webhooks",
        "  - Tax rules per region, once the shipping model is known",
        "",
      ].join("\n"),
    );
  });

  it("returns the parsed map with --json", async () => {
    const repo = TempRepo.create({
      ...base,
      ".scratch/shop/map.md": SHOP_MAP,
      ".scratch/shop/issues/01-cart.md": shopTicket("Cart", "Type: grilling", "Status: resolved"),
    });

    const result = await repo.run(["map", "show", "shop", "--json"]);

    const map = JSON.parse(result.stdout);
    expect(map).toMatchObject({
      name: "shop",
      title: "Shop",
      destination: "A shop that sells things.",
      decisions: ["[Cart](issues/01-cart.md): carts are server side"],
      fog: [
        "Payment providers: which one, and whether to proxy webhooks",
        "Tax rules per region, once the shipping model is known",
      ],
    });
    expect(map.tickets).toHaveLength(1);
    expect(map).not.toHaveProperty("kind");
    expect(map.tickets[0]).not.toHaveProperty("kind");
  });

  it("exits non-zero and names the next action for an unknown map", async () => {
    const repo = TempRepo.create(base);

    const result = await repo.run(["map", "show", "nope"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(".scratch/nope/map.md");
    expect(result.stderr).toContain("Next:");
  });

  it("parses the same with a dryland annotation as without", async () => {
    const annotated = SHOP_MAP.replace(
      "- Tax rules per region,",
      "<!-- dryland: seen-by=app -->\n- Tax rules per region,",
    ).replace("## Out of scope", "## Out of scope <!-- dryland: x -->");
    const a = TempRepo.create({ ...base, ".scratch/shop/map.md": SHOP_MAP });
    const b = TempRepo.create({ ...base, ".scratch/shop/map.md": annotated });

    const [plain, withAnnotation] = await Promise.all([
      a.run(["map", "show", "shop", "--json"]),
      b.run(["map", "show", "shop", "--json"]),
    ]);

    expect(JSON.parse(withAnnotation.stdout)).toEqual(JSON.parse(plain.stdout));
  });

  it("parses this repo's real map: no fog while the map says Nothing", async () => {
    const result = await realRepo().run(["map", "show", "mattpocock-ade", "--json"]);

    expect(result.exitCode).toBe(0);
    const map = JSON.parse(result.stdout);
    expect(map.title).toBe("Matt Pocock ADE");
    expect(map.destination).toMatch(/^A product spec plus an ADR set/);
    expect(map.fog).toEqual([]);
    expect(map.decisions.length).toBeGreaterThan(10);
    expect(map.decisions[0]).toMatch(/^\[?Skills artifact/i);
    expect(map.tickets).toHaveLength(22);
  });
});

describe("dryland map frontier", () => {
  it("returns only open, unblocked, unclaimed tickets, lowest number first", async () => {
    const repo = TempRepo.create({
      ...base,
      ".scratch/shop/map.md": SHOP_MAP,
      ".scratch/shop/issues/01-done.md": shopTicket("Done", "Type: task", "Status: resolved"),
      ".scratch/shop/issues/02-claimed.md": shopTicket("Claimed", "Type: task", "Status: claimed"),
      ".scratch/shop/issues/03-blocked.md": shopTicket("Blocked", "Type: task", "Blocked by: 02"),
      ".scratch/shop/issues/04-partly.md": shopTicket("Partly", "Type: task", "Blocked by: 01, 02"),
      ".scratch/shop/issues/05-free-after-done.md": shopTicket("Free after done", "Type: task", "Blocked by: 01"),
      ".scratch/shop/issues/07-free.md": shopTicket("Free", "Type: research", "Blocked by:"),
      ".scratch/shop/issues/06-dangling.md": shopTicket("Dangling", "Type: task", "Blocked by: 99"),
      ".scratch/other/issues/01-elsewhere.md": shopTicket("Elsewhere", "Type: task"),
    });

    const json = await repo.run(["map", "frontier", "shop", "--json"]);
    const plain = await repo.run(["map", "frontier", "shop"]);

    expect((JSON.parse(json.stdout) as { id: string }[]).map((t) => t.id)).toEqual(["05", "07"]);
    expect(plain.stdout).toBe(
      ["shop/05  open  task      Free after done", "shop/07  open  research  Free", ""].join("\n"),
    );
  });

  it("says so when nothing is on the frontier", async () => {
    const repo = TempRepo.create({
      ...base,
      ".scratch/shop/map.md": SHOP_MAP,
      ".scratch/shop/issues/01-done.md": shopTicket("Done", "Type: task", "Status: resolved"),
    });

    const result = await repo.run(["map", "frontier", "shop"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("No frontier tickets.\n");
  });

  it("computes the frontier of this repo's real map", async () => {
    const result = await realRepo().run(["map", "frontier", "mattpocock-ade", "--json"]);

    // Of the first 22 tickets only 20 is open and unblocked; 21 and 22 wait for it.
    expect((JSON.parse(result.stdout) as { id: string }[]).map((t) => t.id)).toEqual(["20"]);
  });

  it("writes nothing to the repo", async () => {
    const repo = realRepo();
    const before = repo.git("status", "--porcelain");

    await repo.run(["ticket", "show", "mattpocock-ade/22"]);
    await repo.run(["map", "show", "mattpocock-ade"]);
    await repo.run(["map", "frontier", "mattpocock-ade"]);

    expect(repo.git("status", "--porcelain")).toBe(before);
    expect(repo.log()).toEqual(["Initial commit"]);
  });
});
