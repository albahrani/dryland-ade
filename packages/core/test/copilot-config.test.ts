import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COPILOT_CLI,
  copilotHookFile,
  copilotHooksStatus,
  copilotPaths,
  installCopilotHooks,
  readTrustedFolders,
  removeCopilotHooks,
  trustFolders,
  untrustFolders,
} from "../src/index.ts";

function copilotHome(config?: string) {
  const home = mkdtempSync(join(tmpdir(), "dryland-copilot-"));
  const paths = copilotPaths({}, home);
  mkdirSync(paths.dir, { recursive: true });
  if (config !== undefined) writeFileSync(paths.config, config);
  const folder = join(home, "wt");
  mkdirSync(folder);
  return { paths, folder: realpathSync.native(folder), read: () => readFileSync(paths.config, "utf8") };
}

const CONFIG = `{
  "model": "gpt-5",
  "trustedFolders": [
    "C:\\\\work\\\\one",
    "C:\\\\work\\\\two"
  ],
  "banner": "never"
}
`;

describe("Copilot trusted folders", () => {
  it("leaves the config byte-identical after a folder is trusted and untrusted again", async () => {
    const { paths, folder, read } = copilotHome(CONFIG);

    expect((await trustFolders(paths, [folder])).status).toBe("changed");
    expect(await readTrustedFolders(paths)).toContain(folder);
    expect((await untrustFolders(paths, [folder])).status).toBe("changed");

    expect(read()).toBe(CONFIG);
  });

  it("changes nothing but the one entry: every other key and its layout is kept", async () => {
    const { paths, folder, read } = copilotHome(CONFIG);

    await trustFolders(paths, [folder]);

    expect(read()).toBe(CONFIG.replace('two"\n', `two",\n    ${JSON.stringify(folder)}\n`));
    expect(JSON.parse(read())).toMatchObject({ model: "gpt-5", banner: "never" });
  });

  it("round-trips a config whose list is empty, and one written on a single line", async () => {
    for (const config of ['{"trustedFolders": []}', '{"a":1,"trustedFolders":["x"],"b":2}']) {
      const { paths, folder, read } = copilotHome(config);

      await trustFolders(paths, [folder]);
      expect(await readTrustedFolders(paths)).toContain(folder);
      await untrustFolders(paths, [folder]);

      expect(read().replace(/\s/g, "")).toBe(config.replace(/\s/g, ""));
    }
  });

  it("adds the list to a config that has none, and does not trust a folder twice", async () => {
    const { paths, folder, read } = copilotHome('{\n  "model": "gpt-5"\n}\n');

    await trustFolders(paths, [folder]);
    const again = await trustFolders(paths, [folder]);

    expect(again.status).toBe("unchanged");
    expect(JSON.parse(read())).toEqual({ model: "gpt-5", trustedFolders: [folder] });
  });

  it("skips a config that is not valid JSON, with a warning, and never rewrites it", async () => {
    const { paths, folder, read } = copilotHome("{ not json");

    const result = await trustFolders(paths, [folder]);

    expect(result.status).toBe("skipped");
    expect(result.warning).toMatch(/not valid JSON/);
    expect(read()).toBe("{ not json");
  });

  it("does not create a config Copilot has not written yet", async () => {
    const { paths, folder } = copilotHome();

    expect((await trustFolders(paths, [folder])).status).toBe("skipped");
    expect(existsSync(paths.config)).toBe(false);
  });

  it("waits for Copilot's lock, writes once it is released, and leaves no lock of its own behind", async () => {
    const { paths, folder, read } = copilotHome(CONFIG);
    writeFileSync(paths.lock, "");
    setTimeout(() => rmSync(paths.lock), 150);

    const result = await trustFolders(paths, [folder], { lockWaitMs: 3000 });

    expect(result.status).toBe("changed");
    expect(read()).toContain(JSON.stringify(folder));
    expect(existsSync(paths.lock)).toBe(false);
  });

  it("leaves the config alone, with a warning, while the lock stays held", async () => {
    const { paths, folder, read } = copilotHome(CONFIG);
    writeFileSync(paths.lock, "");

    const result = await trustFolders(paths, [folder], { lockWaitMs: 100 });

    expect(result.status).toBe("skipped");
    expect(result.warning).toMatch(/holds/);
    expect(read()).toBe(CONFIG);
    expect(existsSync(paths.lock)).toBe(true);
  });

  it("keeps both sides' changes when Copilot rewrites the config between the read and the write", async () => {
    const { paths, folder, read } = copilotHome(CONFIG);
    let rewritten = false;

    const result = await trustFolders(paths, [folder], {
      afterRead: () => {
        if (rewritten) return;
        rewritten = true;
        writeFileSync(paths.config, CONFIG.replace('"never"', '"always",\n  "theme": "dark"'));
      },
    });

    expect(result.status).toBe("changed");
    expect(JSON.parse(read())).toMatchObject({ banner: "always", theme: "dark" });
    expect(JSON.parse(read()).trustedFolders).toContain(folder);
  });
});

describe("Copilot hook file", () => {
  it("is installed, reported, and removed without touching other hook files", async () => {
    const { paths } = copilotHome();
    const other = join(paths.dir, "hooks", "rtk-rewrite.json");
    mkdirSync(join(paths.dir, "hooks"), { recursive: true });
    writeFileSync(other, "{}");

    expect(await copilotHooksStatus(paths, COPILOT_CLI)).toBe("missing");
    expect(await installCopilotHooks(paths, COPILOT_CLI)).toBe(true);
    expect(await installCopilotHooks(paths, COPILOT_CLI)).toBe(false);
    expect(await copilotHooksStatus(paths, COPILOT_CLI)).toBe("installed");
    writeFileSync(paths.hookFile, "{}");
    expect(await copilotHooksStatus(paths, COPILOT_CLI)).toBe("outdated");
    expect(await removeCopilotHooks(paths)).toBe(true);

    expect(await copilotHooksStatus(paths, COPILOT_CLI)).toBe("missing");
    expect(readFileSync(other, "utf8")).toBe("{}");
  });

  it("registers one gated hook per native event, never the lazy sessionStart", () => {
    const { hooks } = copilotHookFile(COPILOT_CLI);

    expect(Object.keys(hooks).sort()).toEqual(
      [
        "agentStop",
        "notification",
        "permissionRequest",
        "postToolUse",
        "preToolUse",
        "sessionEnd",
        "userPromptSubmitted",
      ].sort(),
    );
    for (const [event, [hook]] of Object.entries(hooks)) {
      expect(hook?.bash).toContain("DRYLAND_PANE_KEY");
      expect(hook?.powershell).toContain("$env:DRYLAND_PANE_KEY");
      expect(hook?.bash).toContain(`dryland agent-hook copilot-cli ${event}`);
    }
  });
});
