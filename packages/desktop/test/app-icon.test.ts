import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../electron-builder.json" with { type: "json" };
import { installLayout } from "../src/main/install-layout.ts";

const desktop = join(import.meta.dirname, "..");
const build = (name: string) => join(desktop, "build", name);

describe("the app icon", () => {
  it("is a 1024 px PNG", () => {
    const png = readFileSync(build("icon.png"));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
  });

  it("is a Windows icon holding the sizes the shell asks for, up to 256 px", () => {
    const ico = readFileSync(build("icon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico[6 + 16 * i] || 256);
    expect(sizes).toEqual(expect.arrayContaining([16, 32, 48, 256]));
  });

  it("is a macOS icon of the declared length with a 1024 px entry", () => {
    const icns = readFileSync(build("icon.icns"));
    expect(icns.subarray(0, 4).toString()).toBe("icns");
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    expect(icns.includes(Buffer.from("ic10"))).toBe(true);
  });

  it("is found by electron-builder in its default build resources folder", () => {
    expect((config as { directories: { buildResources?: string } }).directories.buildResources).toBeUndefined();
    expect(existsSync(build("icon.png"))).toBe(true);
  });

  it("is shipped beside the app and used for the window on every platform", () => {
    const shipped = config.extraResources.find((r: { to: string }) => r.to === "icon.png");
    expect(shipped?.from).toBe("build/icon.png");
    const base = { resourcesPath: "/res", builtCli: "/out/dryland.js", userDataBin: "/data/bin" };
    expect(installLayout({ ...base, packaged: true }).icon).toBe(join("/res", "icon.png"));
    expect(installLayout({ ...base, packaged: false, sourceIcon: "/src/icon.png" }).icon).toBe("/src/icon.png");
  });
});
