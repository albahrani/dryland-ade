import { describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

const LOCAL_TRACKER_DOC = "# Issue tracker: Local Markdown\n\nIssues live in `.scratch/`.\n";
const MAP = "# Map: Shop\n\n## Destination\n\nA shop.\n\n## Decisions so far\n\nNothing.\n";
const CART = ".scratch/shop/issues/01-cart.md";
const PAY = ".scratch/shop/issues/02-pay.md";

function shopRepo(files: Record<string, string> = {}): TempRepo {
  return TempRepo.create({
    "docs/agents/issue-tracker.md": LOCAL_TRACKER_DOC,
    ".scratch/shop/map.md": MAP,
    [CART]: "# Build the cart\n\nType: task\nStatus: ready-for-agent\n\n## Question\n\nCarts live on the server.\n",
    [PAY]: "# Pay\n\nType: task\nStatus: ready-for-agent\n\n## Question\n\nTake payment.\n",
    ...files,
  });
}

async function frontier(repo: TempRepo): Promise<string[]> {
  const tickets = JSON.parse((await repo.run(["map", "frontier", "shop", "--json"])).stdout) as { id: string }[];
  return tickets.map((t) => t.id);
}

describe("dryland ticket block", () => {
  it("adding a blocker removes the ticket from the frontier and removing it puts it back", async () => {
    const repo = shopRepo();
    expect(await frontier(repo)).toEqual(["01", "02"]);

    const added = await repo.run(["ticket", "block", "shop/02", "--add", "01"]);

    expect(added.exitCode).toBe(0);
    expect(await frontier(repo)).toEqual(["01"]);
    const shown = JSON.parse((await repo.run(["ticket", "show", "shop/02", "--json"])).stdout);
    expect(shown.blockers).toEqual(["01"]);
    expect(repo.log()[0]).toBe("Block shop/02 by 01");
    expect(repo.git("status", "--porcelain")).toBe("");

    const removed = await repo.run(["ticket", "block", "shop/02", "--remove", "01"]);

    expect(removed.exitCode).toBe(0);
    expect(await frontier(repo)).toEqual(["01", "02"]);
    expect(repo.read(PAY)).not.toContain("Blocked by");
    expect(repo.log()[0]).toBe("Unblock shop/02 from 01");
  });
});

describe("dryland ticket block failures", () => {
  it("commits only the ticket and keeps the other header lines and a claim annotation", async () => {
    const repo = shopRepo();
    repo.write("unrelated.txt", "dirty");
    await repo.run(["ticket", "claim", "shop/02"], repo.path, { DRYLAND_SESSION_ID: "session-a" });
    const before = repo.read(PAY);

    const result = await repo.run(["ticket", "block", "shop/02", "--add", "1"]);

    expect(result.exitCode).toBe(0);
    expect(repo.read(PAY)).toBe(before.replace("\n\n## Question", "\nBlocked by: 01\n\n## Question"));
    expect(repo.git("status", "--porcelain")).toBe("?? unrelated.txt");
  });

  it("rejects a missing, self, repeated or absent blocker with the next action, changing nothing", async () => {
    const repo = shopRepo();
    await repo.run(["ticket", "block", "shop/02", "--add", "01"]);
    const head = repo.git("rev-parse", "HEAD");

    const attempts = [
      ["ticket", "block", "shop/02", "--add", "09"],
      ["ticket", "block", "shop/02", "--add", "02"],
      ["ticket", "block", "shop/02", "--add", "01"],
      ["ticket", "block", "shop/01", "--remove", "02"],
      ["ticket", "block", "shop/02"],
    ];
    for (const args of attempts) {
      const result = await repo.run(args);
      expect(result.exitCode, args.join(" ")).not.toBe(0);
      expect(result.stderr, args.join(" ")).toContain("Next:");
    }
    expect(repo.git("rev-parse", "HEAD")).toBe(head);
    expect(repo.git("status", "--porcelain")).toBe("");
  });
});

describe("dryland ticket comment", () => {
  it("creates the Comments heading when missing and commits only that ticket", async () => {
    const repo = shopRepo();
    repo.write("unrelated.txt", "dirty");

    const result = await repo.run(["ticket", "comment", "shop/01", "--text", "Looks good."]);

    expect(result.exitCode).toBe(0);
    expect(repo.read(CART)).toBe(
      "# Build the cart\n\nType: task\nStatus: ready-for-agent\n\n## Question\n\nCarts live on the server.\n\n## Comments\n\nLooks good.\n",
    );
    const shown = JSON.parse((await repo.run(["ticket", "show", "shop/01", "--json"])).stdout);
    expect(shown.comments).toEqual(["Looks good."]);
    expect(repo.log()[0]).toBe("Comment on shop/01");
    expect(repo.git("status", "--porcelain")).toBe("?? unrelated.txt");
  });

  it("appends after earlier comments and leaves them untouched", async () => {
    const earlier = "# Pay\n\nType: task\n\n## Question\n\nTake payment.\n\n## Comments\n\n### Ada\n\nFirst thought.\n";
    const repo = shopRepo({ [PAY]: earlier });

    const result = await repo.run(["ticket", "comment", "shop/02", "--text", "Second thought."]);

    expect(result.exitCode).toBe(0);
    expect(repo.read(PAY)).toBe(`${earlier}\nSecond thought.\n`);
  });

  it("inserts into the Comments section even when an Answer section follows it", async () => {
    const resolved =
      "# Pay\n\nType: task\nStatus: resolved\n\n## Question\n\nTake payment.\n\n## Comments\n\nOld.\n\n## Answer\n\nStripe.\n";
    const repo = shopRepo({ [PAY]: resolved });

    await repo.run(["ticket", "comment", "shop/02", "--text", "New."]);

    expect(repo.read(PAY)).toBe(
      "# Pay\n\nType: task\nStatus: resolved\n\n## Question\n\nTake payment.\n\n## Comments\n\nOld.\n\nNew.\n\n## Answer\n\nStripe.\n",
    );
  });
});

const TRIAGE_DOC = [
  "# Triage Labels",
  "",
  "| Label in mattpocock/skills | Label in our tracker |",
  "| -------------------------- | -------------------- |",
  "| `needs-triage`             | `to-look-at`         |",
  "| `needs-info`               | `Need-Info`          |",
  "| `ready-for-agent`          | `agent-ready`        |",
  "| `ready-for-human`          | `human-ready`        |",
  "| `wontfix`                  | `nope`               |",
  "",
].join("\n");

describe("dryland ticket triage", () => {
  it("writes the repo's label for a role and the ticket reads back with that role", async () => {
    const repo = shopRepo({ "docs/agents/triage-labels.md": TRIAGE_DOC });

    const result = await repo.run(["ticket", "triage", "shop/01", "--role", "needs-info"]);

    expect(result.exitCode).toBe(0);
    expect(repo.read(CART)).toContain("\nStatus: Need-Info\n");
    const shown = JSON.parse((await repo.run(["ticket", "show", "shop/01", "--json"])).stdout);
    expect(shown).toMatchObject({ state: "open", triageRole: "needs-info" });
    expect(repo.log()[0]).toBe("Triage shop/01 as needs-info");
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("writes the default role string when the repo has no triage labels doc", async () => {
    const repo = shopRepo();

    await repo.run(["ticket", "triage", "shop/01", "--role", "wontfix"]);

    expect(repo.read(CART)).toContain("\nStatus: wontfix\n");
  });

  it("adds a Status line to a ticket that has none", async () => {
    const repo = shopRepo({ [PAY]: "# Pay\n\nType: task\n\n## Question\n\nTake payment.\n" });

    await repo.run(["ticket", "triage", "shop/02", "--role", "needs-triage"]);

    expect(repo.read(PAY)).toBe("# Pay\n\nType: task\nStatus: needs-triage\n\n## Question\n\nTake payment.\n");
  });

  it("rejects an unknown role and lists the valid ones, changing nothing", async () => {
    const repo = shopRepo();

    const result = await repo.run(["ticket", "triage", "shop/01", "--role", "urgent"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("urgent");
    for (const role of ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"]) {
      expect(result.stderr).toContain(role);
    }
    expect(result.stderr).toContain("Next:");
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("refuses to retriage a claimed or resolved ticket and states the next action", async () => {
    const repo = shopRepo();
    await repo.run(["ticket", "claim", "shop/01"], repo.path, { DRYLAND_SESSION_ID: "session-a" });
    await repo.run(["ticket", "resolve", "shop/02", "--answer", "Done."]);

    const claimed = await repo.run(["ticket", "triage", "shop/01", "--role", "needs-info"]);
    const resolved = await repo.run(["ticket", "triage", "shop/02", "--role", "needs-info"]);

    for (const result of [claimed, resolved]) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Next:");
    }
    expect(repo.read(CART)).toContain("Status: claimed");
  });
});

describe("review fixes", () => {
  it("keeps the order and spelling of existing blockers when adding one", async () => {
    const repo = shopRepo({
      ".scratch/shop/issues/03-ship.md": "# Ship\n\nType: task\nBlocked by: 2, 01\n\n## Question\n\nShip it.\n",
    });

    await repo.run(["ticket", "create", "--map", "shop", "--title", "Extra", "--type", "task"]); // 04
    const added = await repo.run(["ticket", "block", "shop/03", "--add", "04"]);

    expect(added.exitCode).toBe(0);
    expect(repo.read(".scratch/shop/issues/03-ship.md")).toContain("\nBlocked by: 2, 01, 04\n");
  });

  it("rejects a comment that would open a new section", async () => {
    const repo = shopRepo();

    const result = await repo.run(["ticket", "comment", "shop/01", "--text", "Fine.\n## Answer\nSneaky."]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Next:");
    expect(repo.git("status", "--porcelain")).toBe("");
  });
});
