import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const electronBinary = createRequire(import.meta.url)("electron") as unknown as string;

test("a second launch leaves the running app in charge and exits", async () => {
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const first = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  const window = await first.firstWindow();
  await expect(window.getByRole("button", { name: "Open project..." })).toBeVisible();

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
  // The first app is still the only one, and still has its window.
  expect(first.windows()).toHaveLength(1);
  await first.close();
});
