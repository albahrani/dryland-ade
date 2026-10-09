// PROTOTYPE helper (throwaway): snapshots real project data into data.js. Run: node gen-data.js
const fs = require("fs"), path = require("path"), cp = require("child_process"), os = require("os");
const root = path.resolve(__dirname, "../../../..");
const eff = path.join(root, ".scratch/mattpocock-ade");
const sh = (c) => cp.execSync(c, { cwd: root, encoding: "utf8" });
const short = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// ---- tickets + map
const map = fs.readFileSync(path.join(eff, "map.md"), "utf8");
const section = (name) => (map.split(new RegExp("^## " + name + "\\s*$", "m"))[1] || "").split(/^## /m)[0];
const fog = section("Not yet specified").split(/`r`n|\r?\n/).map(l => l.replace(/^-\s*/, "").trim()).filter(Boolean).map(l => short(l, 110));
const dest = short(section("Destination"), 400);
const tickets = fs.readdirSync(path.join(eff, "issues")).sort().map(f => {
  const txt = fs.readFileSync(path.join(eff, "issues", f), "utf8").replace(/\r/g, "");
  const get = (k) => (txt.match(new RegExp("^" + k + ":[ \\t]*(.*)$", "m")) || [, ""])[1].trim();
  const sec = (n) => ((txt.split(new RegExp("^## " + n + "\\s*$", "m"))[1] || "").split(/^## /m)[0] || "").trim();
  return { id: f.slice(0, 2), file: "issues/" + f, map: "m1", title: txt.split("\n")[0].replace(/^#\s*/, ""),
    type: get("Type"), status: get("Status"), blocked: get("Blocked by").split(",").map(s => s.trim()).filter(Boolean),
    gist: short(sec("Answer") || sec("Question"), 260) };
});

// ---- git
const status = sh("git status --porcelain -uall").split(/\r?\n/).filter(Boolean).map(l => ({ x: l[0], y: l[1], p: l.slice(3).replace(/"/g, "") }));
const sMap = Object.fromEntries(status.map(s => [s.p, s]));
const all = sh("git ls-files").split(/\r?\n/).filter(Boolean);
status.forEach(s => { if (!all.includes(s.p)) all.push(s.p); });
const files = all.sort().map(p => { const s = sMap[p]; if (!s) return [p, "", 0]; const st = s.y === "?" ? "A" : (s.x !== " " && s.x !== "?" ? s.x : s.y); return [p, st === "?" ? "A" : st, s.x !== " " && s.x !== "?" ? 1 : 0]; });
const commits = sh('git log "--format=%h;%s;%ar"').split(/\r?\n/).filter(Boolean).map(l => { const [h, m, a] = l.split(";"); return [h, m, 0, a.replace(" ago", "")]; });
const branch = sh("git rev-parse --abbrev-ref HEAD").trim();

// ---- copilot sessions
const dbIds = [
  ["a2a58d96-00fd-4d09-b5e7-c02dff73a76e", null], ["80f15280-b5e5-4da9-aec2-16f83ce43d59", null], ["6502aa71-c43a-45be-a7e4-4ca8771829c3", null],
  ["125d2449-343b-4f97-a09a-9c0b2d8e4c76", null], ["7d23a249-f70e-40ee-9cc9-28d7ab2d8f4f", null],
  ["df14a91e-485c-4a0b-beb5-5f3dfa3854ee", { map: "m1" }], ["3f4efd51-3424-425b-b1ef-3be3ff891368", { ticket: "11" }]];
const names = { "a2a58d96": "Setup Matt Pocock Skills", "80f15280": "Setup Matt Pocock Skills (retry)", "6502aa71": "Develop ADE for Matt Pocock Skills", "125d2449": "Update Wayfinder Map", "7d23a249": "Implement Wayfinder Feature", "df14a91e": "Continue Wayfinder ADE Map", "3f4efd51": "Continue Wayfinder on ADE Map" };
const hhmm = (t) => new Date(t).toTimeString().slice(0, 8);
const argSummary = (a) => { if (!a) return ""; if (typeof a === "string") return short(a, 70); return short(a.command || a.path || a.pattern || a.query || a.url || a.description || a.prompt || a.skill || JSON.stringify(a), 70); };
const sessions = dbIds.map(([id, link]) => {
  const f = path.join(os.homedir(), ".copilot/session-state", id, "events.jsonl");
  const log = [], ev = []; let first = null, last = null, model = "";
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line) continue; let j; try { j = JSON.parse(line); } catch { continue; }
    const t = j.timestamp, d = j.data || {}; first = first || t; last = t;
    if (j.type === "session.start") { model = d.selectedModel || ""; ev.push([hhmm(t), "session.start", "copilot " + (d.copilotVersion || "") + " " + model]); }
    else if (j.type === "user.message") { log.push(["u", short(d.content, 240)]); ev.push([hhmm(t), "user.prompt", short(d.content, 80)]); }
    else if (j.type === "assistant.message" && d.content) log.push(["a", short(d.content, 420)]);
    else if (j.type === "tool.execution_start") { const s = d.toolName + " " + argSummary(d.arguments); log.push(["t", s]); ev.push([hhmm(t), "tool", s]); }
    else if (j.type === "skill.invoked") ev.push([hhmm(t), "skill", d.name]);
    else if (j.type === "subagent.started") ev.push([hhmm(t), "subagent", short(d.agentName || d.name || "", 60)]);
  }
  const live = last && Date.now() - new Date(last).getTime() < 3 * 3600 * 1000;
  const s = { id: id.slice(0, 8), name: names[id.slice(0, 8)], agent: "GitHub Copilot", model, ticket: link?.ticket || null, map: link?.map || null,
    state: id.startsWith("3f4efd51") ? "waiting" : "ended", started: first && hhmm(first), last: last && hhmm(last), events: ev.length,
    log: log.slice(-40), ev: ev.slice(-60), typed: null };
  return s;
});

// ---- file contents (first 80 lines) and diffs for changed files
const content = {}, diffs = {};
files.forEach(([p]) => { if (!/\.(md|ts|tsx|js|json|html|txt|ya?ml|css)$/i.test(p) || /^\.scratch\/mattpocock-ade\/prototype\//.test(p) || /package-lock/.test(p)) return;
  try { content[p] = fs.readFileSync(path.join(root, p), "utf8").replace(/\r/g, "").split("\n").slice(0, 80).map(l => l.slice(0, 160)).join("\n"); } catch { } });
files.filter(f => f[1] === "M").forEach(([p]) => { try {
  const d = sh('git diff HEAD -- "' + p + '"').replace(/\r/g, "").split("\n"), i = d.findIndex(l => l.startsWith("@@"));
  if (i >= 0) diffs[p] = d.slice(i, i + 120).filter(l => !l.startsWith("\\")).map(l => l === "" ? " " : l.slice(0, 160)); } catch { } });
fs.writeFileSync(path.join(__dirname, "data.js"), "// generated by gen-data.js (real snapshot)\nconst REAL=" + JSON.stringify({ project: path.basename(root), branch, dest, fog, tickets, files, commits, sessions, content, diffs }, null, 0) + ";\n");
console.log("tickets", tickets.length, "files", files.length, "changed", files.filter(f => f[1]).length, "sessions", sessions.map(s => s.id + ":" + s.events).join(" "), "fog", fog.length);
