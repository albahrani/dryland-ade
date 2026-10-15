import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const electronBinary = createRequire(import.meta.url)("electron") as unknown as string;
const lockFile = () => join(process.env.DRYLAND_APP_DIR ?? "", "live.json");

test("a second launch leaves the running app in charge and exits", async () => {
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const first = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  const window = await first.firstWindow();
  await expect(window.getByRole("button", { name: "Open project..." })).toBeVisible();
  const lock = readFileSync(lockFile(), "utf8");

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const second = spawn(electronBinary, [".", `--user-data-dir=${userData}`], { env, stdio: "ignore" });
  const exitCode = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      second.kill();
      resolve(null);
    }, 20_000);
    second.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

  expect(exitCode).toBe(0);
  // The first app still answers `dryland`, and still has its window.
  expect(readFileSync(lockFile(), "utf8")).toBe(lock);
  expect(first.windows()).toHaveLength(1);
  await first.close();
});
