import { describe, expect, it } from "vitest";
import { createPretyper } from "../src/main/pretype.ts";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(submit: boolean) {
  const written: string[] = [];
  const pretyper = createPretyper({
    text: "/go",
    write: (key) => written.push(key),
    blocks: () => false,
    submit,
    timing: { quietMs: 10, charDelayMs: 2 },
  });
  return { written, pretyper };
}

describe("the pre-typer", () => {
  it("types the command and no Enter while auto-submit is off", async () => {
    const { written, pretyper } = setup(false);
    pretyper("prompt");
    await pause(80);
    expect(written.join("")).toBe("/go");
  });

  it("presses Enter after the command when auto-submit is on", async () => {
    const { written, pretyper } = setup(true);
    pretyper("prompt");
    await pause(80);
    expect(written.join("")).toBe("/go\r");
  });

  it("types nothing, and submits nothing, once the user has typed before it started", async () => {
    const { written, pretyper } = setup(true);
    pretyper("prompt");
    pretyper.cancel();
    await pause(80);
    expect(written).toEqual([]);
  });

  it("stops mid-command and never submits when the user types while it types", async () => {
    const { written, pretyper } = setup(true);
    pretyper("prompt");
    await pause(14);
    pretyper.cancel();
    const sofar = written.length;
    await pause(80);
    expect(written).toHaveLength(sofar);
    expect(written).not.toContain("\r");
  });
});
