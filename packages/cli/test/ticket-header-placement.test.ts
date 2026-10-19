import { describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

const CART = ".scratch/shop/issues/01-cart.md";

// The spec line is its own paragraph below the header block, as the agent skills write it.
const SPEC_TICKET = "# Cart\n\nType: task\n\nSpec: [spec](../spec.md), user stories 1, 2.\n\n## Question\n\nGo.\n";

function repoWith(ticket: string): TempRepo {
  return TempRepo.create({
    "docs/agents/issue-tracker.md": "# Issue tracker: Local Markdown\n",
    ".scratch/shop/map.md": "# Map: Shop\n\n## Destination\n\nA shop.\n\n## Decisions so far\n\nNothing.\n",
    [CART]: ticket,
    ".scratch/shop/issues/02-pay.md": "# Pay\n\nType: task\n",
    ".scratch/shop/issues/03-ship.md": "# Ship\n\nType: task\n",
  });
}

describe("where a missing header field is added", () => {
  it("puts Status under Type, not under the Spec paragraph, on triage", async () => {
    const repo = repoWith(SPEC_TICKET);

    await repo.run(["ticket", "triage", "shop/01", "--role", "ready-for-agent"]);

    expect(repo.read(CART)).toBe(SPEC_TICKET.replace("Type: task\n", "Type: task\nStatus: ready-for-agent\n"));
  });

  it("puts Status under Type on claim", async () => {
    const repo = repoWith(SPEC_TICKET);

    await repo.run(["ticket", "claim", "shop/01", "--holder", "me"]);

    expect(repo.read(CART)).toMatch(/^# Cart\n\nType: task\nStatus: claimed\n<!-- dryland: .* -->\n\nSpec: /);
  });

  it("puts Blocked by after Status in the header block", async () => {
    const repo = repoWith(SPEC_TICKET.replace("Type: task\n", "Type: task\nStatus: needs-triage\n"));

    await repo.run(["ticket", "block", "shop/01", "--add", "2"]);

    expect(repo.read(CART)).toBe(
      SPEC_TICKET.replace("Type: task\n", "Type: task\nStatus: needs-triage\nBlocked by: 02\n"),
    );
  });

  it("puts Blocked by under Type when there is no Status", async () => {
    const repo = repoWith(SPEC_TICKET);

    await repo.run(["ticket", "block", "shop/01", "--add", "2"]);

    expect(repo.read(CART)).toBe(SPEC_TICKET.replace("Type: task\n", "Type: task\nBlocked by: 02\n"));
  });

  it("keeps CRLF when it adds Status under Type", async () => {
    const crlf = SPEC_TICKET.replaceAll("\n", "\r\n");
    const repo = repoWith(crlf);

    await repo.run(["ticket", "triage", "shop/01", "--role", "ready-for-agent"]);

    expect(repo.read(CART)).toBe(crlf.replace("Type: task\r\n", "Type: task\r\nStatus: ready-for-agent\r\n"));
  });

  it("still rewrites a Status line in place when a later paragraph holds it", async () => {
    const ticket = "# Cart\n\nType: task\n\nStatus: needs-info\n\n## Question\n\nGo.\n";
    const repo = repoWith(ticket);

    await repo.run(["ticket", "triage", "shop/01", "--role", "ready-for-agent"]);

    expect(repo.read(CART)).toBe(ticket.replace("needs-info", "ready-for-agent"));
  });

  it("still rewrites a Blocked by line in place when a later paragraph holds it", async () => {
    const ticket = "# Cart\n\nType: task\nStatus: ready-for-agent\n\nBlocked by: 03\n\n## Question\n\nGo.\n";
    const repo = repoWith(ticket);

    await repo.run(["ticket", "block", "shop/01", "--add", "2"]);

    expect(repo.read(CART)).toBe(ticket.replace("Blocked by: 03", "Blocked by: 03, 02"));
  });
});
