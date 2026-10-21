// Generates THIRD_PARTY_NOTICES.md: the Orca attribution plus the licences of what Dryland ships.
// Usage: node scripts/third-party-notices.mjs [--check]   (--check exits 1 when the file is out of date)
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NOTICES = "THIRD_PARTY_NOTICES.md";

/** Direct dependencies that are build, test or type tooling and never reach an installed app. */
const NOT_SHIPPED = new Set([
  "@playwright/test",
  "@vitejs/plugin-react",
  "electron-vite",
  "vite",
  "@types/react",
  "@types/react-dom",
]);

/** Pieces copied from Orca, each `{ what, where }`; empty until something is copied, and then it is listed here. */
export const ORCA_COPIES = [];

const ORCA_LICENCE = `MIT License

Copyright (c) 2026 Lovecast Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/** The names of the dependencies the packages under `packages/` ship, from their package.json files. */
function shippedDependencies(root) {
  const names = new Set();
  const owners = new Map();
  for (const dir of readdirSync(join(root, "packages"), { withFileTypes: true })) {
    const file = join(root, "packages", dir.name, "package.json");
    if (!dir.isDirectory() || !existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
      if (name.startsWith("@dryland/") || name.startsWith("@types/") || NOT_SHIPPED.has(name)) continue;
      names.add(name);
      owners.set(name, join(root, "packages", dir.name));
    }
  }
  return [...names].sort().map((name) => ({ name, from: owners.get(name) }));
}

/** Packages whose own runtime dependencies are not shipped with them (Electron's are its download tooling). */
const LEAF = new Set(["electron"]);

/** The installed package `name` as `from` sees it, found the way Node resolves it: in the nearest `node_modules`. */
function locate(from, name) {
  for (let dir = realpathSync(from); ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (dirname(dir) === dir) throw new Error(`${name} is not installed; run pnpm install first.`);
  }
}

/** The shipped packages and, transitively, their runtime dependencies, sorted by name and version. */
function installedClosure(root) {
  const found = new Map();
  const visit = (dir) => {
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const key = `${manifest.name}@${manifest.version}`;
    if (found.has(key)) return;
    found.set(key, { name: manifest.name, version: manifest.version, license: manifest.license, dir });
    if (LEAF.has(manifest.name)) return;
    // Optional dependencies are left out: which are installed depends on the OS, and the file must not.
    for (const dependency of Object.keys(manifest.dependencies ?? {})) visit(locate(dir, dependency));
  };
  for (const { name, from } of shippedDependencies(root)) visit(locate(from, name));
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/** The licence file of an installed package; its text, trimmed of line-ending differences. */
function licenceText(dir) {
  const file = readdirSync(dir).find((entry) => /^(licen[cs]e|copying)(\..*)?$/i.test(entry));
  if (file === undefined) throw new Error(`${dir} has no licence file; add it to THIRD_PARTY_NOTICES by hand.`);
  return readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n").trim();
}

/** The full text of THIRD_PARTY_NOTICES.md for the repo at `root`; the same on every OS for the same install. */
export function buildNotices(root = ROOT) {
  const out = [
    "# Third-party notices",
    "",
    "Dryland ADE is MIT licensed (see `LICENSE`). This file is generated by `node scripts/third-party-notices.mjs`;",
    "CI fails when it is out of date.",
    "",
    "## Orca",
    "",
    "Dryland ADE is an unofficial, fresh build. It takes inspiration from [Orca](https://github.com/stablyai/orca)",
    "(MIT) and may copy small pieces from it, always attributed here.",
    "",
  ];
  if (ORCA_COPIES.length === 0) out.push("No code has been copied from Orca so far.", "");
  else {
    out.push("Pieces copied from Orca:", "");
    for (const { what, where } of ORCA_COPIES) out.push(`- ${what} (\`${where}\`)`);
    out.push("");
  }
  out.push("```text", ORCA_LICENCE, "```", "", "## Bundled and shipped packages", "");
  for (const { name, version, license, dir } of installedClosure(root)) {
    out.push(`### ${name} ${version}`, "", `Licence: ${license}`, "", "```text", licenceText(dir), "```", "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = join(ROOT, NOTICES);
  const wanted = buildNotices();
  if (process.argv.includes("--check")) {
    const current = existsSync(target) ? readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== wanted) {
      console.error(`${NOTICES} is out of date; run: node scripts/third-party-notices.mjs`);
      process.exit(1);
    }
  } else writeFileSync(target, wanted);
}
