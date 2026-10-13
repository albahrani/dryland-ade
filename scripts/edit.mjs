// Applies a batch of text replacements described by a JSON spec file.
// Usage: node scripts/edit.mjs <spec.json> [--dry-run]
//
// Write the spec with the Write tool, so no shell quoting or escaping touches it. Paths are relative to the
// current directory. Edits to one file apply in order, and nothing is written unless every edit matches.
//
//   {
//     "edits": [
//       { "file": "src/a.ts", "find": "oldName", "replace": "newName" },
//       { "file": "src/b.ts", "find": "import \\{ x \\} from \"(.+)\"", "replace": "import { y } from \"$1\"", "regex": true },
//       { "file": "src/c.ts", "find": "TODO", "replace": "DONE", "count": 2 }
//     ]
//   }
//
// - `find` is literal text; with `"regex": true` it is a JavaScript regular expression and `replace` may use $1, $&.
// - Every match is replaced. `count`, when given, is the number of matches the edit must find.
// - An edit that finds nothing, or a different count, fails the whole run with the file and edit named.
import { readFileSync, writeFileSync } from "node:fs";

const [specPath, ...flags] = process.argv.slice(2);
if (specPath === undefined) {
  console.error("Usage: node scripts/edit.mjs <spec.json> [--dry-run]");
  process.exit(2);
}
const dryRun = flags.includes("--dry-run");

const { edits } = JSON.parse(readFileSync(specPath, "utf8"));
if (!Array.isArray(edits)) {
  console.error(`${specPath}: expected {"edits": [...]}`);
  process.exit(2);
}

const contents = new Map();
const failures = [];
const report = [];

edits.forEach((edit, index) => {
  const label = `edit ${index + 1} (${edit.file})`;
  if (typeof edit.file !== "string" || typeof edit.find !== "string" || typeof edit.replace !== "string") {
    failures.push(`${label}: needs string "file", "find" and "replace"`);
    return;
  }
  if (!contents.has(edit.file)) contents.set(edit.file, readFileSync(edit.file, "utf8"));
  const text = contents.get(edit.file);

  let matches = 0;
  let next;
  if (edit.regex === true) {
    matches = [...text.matchAll(new RegExp(edit.find, "g"))].length;
    next = text.replace(new RegExp(edit.find, "g"), edit.replace);
  } else {
    next = text.split(edit.find).join(edit.replace);
    matches = text.split(edit.find).length - 1;
  }

  if (matches === 0) failures.push(`${label}: no match for ${JSON.stringify(edit.find)}`);
  else if (typeof edit.count === "number" && edit.count !== matches) {
    failures.push(`${label}: expected ${edit.count} matches, found ${matches}`);
  } else {
    contents.set(edit.file, next);
    report.push(`${label}: ${matches} replaced`);
  }
});

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error("Nothing written.");
  process.exit(1);
}

if (!dryRun) for (const [file, text] of contents) writeFileSync(file, text);
for (const line of report) console.log(line);
if (dryRun) console.log("Dry run: nothing written.");
