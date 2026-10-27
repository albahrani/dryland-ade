// Lists the tickets an agent can start: `Status: ready-for-agent` with every `Blocked by` ticket resolved.
// Usage: node scripts/next-tickets.mjs [map]   (reads .scratch/<map>/issues/NN-*.md; default: every map)
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const scratch = new URL("../.scratch/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const only = process.argv[2];

const maps = readdirSync(scratch).filter(
  (name) => (!only || name === only) && existsSync(join(scratch, name, "issues")),
);

for (const map of maps) {
  const dir = join(scratch, map, "issues");
  const tickets = new Map();
  for (const file of readdirSync(dir).filter((name) => /^\d+-.*\.md$/.test(name))) {
    const text = readFileSync(join(dir, file), "utf8");
    const id = Number(file.match(/^(\d+)-/)[1]);
    const status = text.match(/^Status:\s*(.+)$/m)?.[1].trim();
    const blockedBy = text.match(/^Blocked by:\s*(.+)$/m)?.[1].trim() ?? "none";
    const blockers = blockedBy === "none" ? [] : blockedBy.split(",").map((part) => Number(part.trim()));
    tickets.set(id, { id, file, status, blockers, title: text.match(/^# (.+)$/m)?.[1] ?? file });
  }
  for (const ticket of tickets.values()) {
    if (ticket.status !== "ready-for-agent") continue;
    if (!ticket.blockers.every((id) => tickets.get(id)?.status === "resolved")) continue;
    console.log(`${map}/${ticket.id}\t${ticket.title}\t.scratch/${map}/issues/${ticket.file}`);
  }
}
