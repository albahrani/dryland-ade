import { describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

const CART = ".scratch/shop/issues/01-cart.md";
const PAY = ".scratch/shop/issues/02-pay.md";
const MAP = ".scratch/shop/map.md";

const CRLF_TICKET = "# Cart\r\n\r\nType: task\r\nStatus: ready-for-agent\r\n\r\n## Question\r\n\r\nGo.\r\n";
// A hand-edited file: CRLF above, LF in the Comments section and below the Question.
const MIXED_TICKET = "# Pay\r\n\r\nType: task\n\n## Question\r\n\r\nGo.\r\n\n## Comments\n\nOld.\n";

function repoWith(files: Record<string, string>): TempRepo {
  return TempRepo.create({
    "docs/agents/issue-tracker.md": "# Issue tracker: Local Markdown\n",
    [MAP]: "# Map: Shop\n\n## Destination\n\nA shop.\n\n## Decisions so far\n\nNothing.\n",
    ...files,
  });
}

describe("line endings of tracker writes", () => {
  it("keeps CRLF through block, triage and comment", async () => {
    const repo = repoWith({ [CART]: CRLF_TICKET, [PAY]: "# Pay\r\n\r\nType: task\r\n" });

    await repo.run(["ticket", "block", "shop/01", "--add", "2"]);
    await repo.run(["ticket", "triage", "shop/01", "--role", "needs-info"]);
    await repo.run(["ticket", "comment", "shop/01", "--text", "Hi\nthere"]);

    expect(repo.read(CART)).toBe(
      "# Cart\r\n\r\nType: task\r\nStatus: needs-info\r\nBlocked by: 02\r\n\r\n## Question\r\n\r\nGo.\r\n" +
        "\r\n## Comments\r\n\r\nHi\r\nthere\r\n",
    );
  });

  it("leaves earlier lines of a mixed-ending file as they were when commenting", async () => {
    const repo = repoWith({ [PAY]: MIXED_TICKET });

    const result = await repo.run(["ticket", "comment", "shop/02", "--text", "New."]);

    expect(result.exitCode).toBe(0);
    expect(repo.read(PAY)).toBe(`${MIXED_TICKET}\nNew.\n`);
  });

  it("gives a new header line the ending of the line it follows in a mixed-ending file", async () => {
    const repo = repoWith({ [CART]: "# Cart\n", [PAY]: MIXED_TICKET });

    await repo.run(["ticket", "block", "shop/02", "--add", "1"]);

    expect(repo.read(PAY)).toBe(MIXED_TICKET.replace("Type: task\n", "Type: task\nBlocked by: 01\n"));
  });

  it("keeps a file without a final newline without one", async () => {
    const repo = repoWith({ [CART]: "# Cart\n\nType: task\n\n## Comments\n\nOld." });

    await repo.run(["ticket", "comment", "shop/01", "--text", "New."]);

    expect(repo.read(CART)).toBe("# Cart\n\nType: task\n\n## Comments\n\nOld.\n\nNew.");
  });
});
