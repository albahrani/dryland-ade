import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { watchProject } from "../src/main/watch-project.ts";

// The long spelling of the path: libuv aborts a recursive watch whose events come in the 8.3 short spelling.
const tempRoot = () => realpathSync.native(mkdtempSync(join(tmpdir(), "dryland-watch-")));

let stop: (() => void) | undefined;
afterEach(() => stop?.());

describe("watchProject", () => {
  it("reports a skill that appears under a skills directory created after the watch began", async () => {
    const root = tempRoot();
    const onChange = vi.fn();
    stop = watchProject(root, onChange, 20);

    mkdirSync(join(root, ".agents", "skills", "tdd"), { recursive: true });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    onChange.mockClear();

    writeFileSync(join(root, ".agents", "skills", "tdd", "SKILL.md"), "# tdd\n");
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("reports an edit to a skill already installed", async () => {
    const root = tempRoot();
    mkdirSync(join(root, ".claude", "skills", "tdd"), { recursive: true });
    const onChange = vi.fn();
    stop = watchProject(root, onChange, 20);

    writeFileSync(join(root, ".claude", "skills", "tdd", "SKILL.md"), "# changed\n");
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
  });
});
