// PROTOTYPE (throwaway), ticket 71: the Sessions view at scale.
// Question: how does the Sessions view read with 4 open session tabs, ~30 hidden live sessions and 14 paused ones,
// and how do a ticket and a map show their paused session? Three variants on the existing shell, ?variant=B|C|D
// (A is the round 6 view, unchanged). Loaded after the main script; overrides a few of its functions.
// Model (ADR 0010): open = live session with a tab; hidden = live, tab closed, PTY still running; paused = no process,
// resumable by id. Stop session pauses (claim kept). "..." menu > "Simulate quit and restart" shows tab restore.
(function () {
  document.head.insertAdjacentHTML("beforeend", `<style>
  .row .ha{display:none;margin-left:2px}.row:hover .ha{display:inline-flex}
  button.mini{padding:0 6px;font-size:11px;line-height:16px}
  .tb{display:grid;grid-template-columns:18px 18px 1fr 34px 74px 46px 30px;font-size:12px;align-items:center}
  .tb>.r{display:contents;cursor:pointer}.tb>.r>*{padding:3px 2px;border-bottom:1px solid #2c2c2c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tb>.r:hover>*{background:#2a2d2e}.tb>.r.sel>*{background:#37373d}.tb>.r.w>*:first-child{box-shadow:inset 3px 0 0 #d6b36a}
  .tb>.h>*{color:#888;font-size:11px;cursor:pointer;background:#252526;position:sticky;top:0}
  .pane{display:flex;align-items:center;gap:6px;height:24px;padding:0 8px 0 4px;cursor:pointer;position:sticky;top:0;z-index:2;
    background:#2d2e32;border-top:1px solid #3e4045;border-bottom:1px solid #1d1d1f;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#e4e4e4}
  .pane:hover{background:#34363b}.pane.op{border-bottom-color:#3e4045}.pane .pc{width:14px;text-align:center;color:#bbb}
  .pane .pn{font-weight:600;letter-spacing:0;background:#45474d;color:#ddd;border-radius:8px;padding:0 6px;line-height:15px;font-size:10px}
  .pane .pw{background:#4a3f1c;color:#e9c46a}.pane button{text-transform:none;letter-spacing:0;font-weight:400}
  .pstack{overflow:hidden!important;display:flex;flex-direction:column}
  .pbox{display:flex;flex-direction:column;min-height:0}.pbox:not(.cl){min-height:60px}
  .pbox .pane{position:static;flex:none;height:26px;background:#2f3035}.pbox:first-child .pane{border-top-color:#2f3035}
  .pbox .pc{transition:transform .12s}
  .pbody{flex:1;min-height:0;overflow:auto}
  .sash{flex:none;height:4px;margin:-2px 0;position:relative;z-index:3;cursor:ns-resize}.sash:hover,.sash.on{background:#007fd4}
  </style>`);

  SRANK.paused = 4;

  // ---------- model helpers ----------
  const LIVE = s => ["working", "waiting", "idle"].includes(s.state);
  const isOpen = s => tabs.some(t => (t.k === "ticket" && t.i === s.ticket) || (t.k === "map" && !s.ticket && t.i === s.map) || (t.k === "session" && t.i === s.id));
  const vis = s => s.state === "ended" ? "ended" : isOpen(s) ? "open" : s.state === "paused" ? "paused" : "hidden";
  const pLab = s => s.was === "waiting" ? "was waiting on you" : s.was === "interrupted" ? "interrupted" : "paused";
  const itemT = s => s.ticket && byId(s.ticket) ? byId(s.ticket).title : s.map ? mapOf(s.map).title + " (map)" : s.name;
  const attn = s => s.state === "waiting" ? 0 : s.state === "paused" ? (s.was === "waiting" ? 1 : s.was === "interrupted" ? 4 : 5) : s.state === "working" ? 2 : 3;
  const bySt = (a, b) => attn(a) - attn(b);
  const short = a => (a || "").replace(" ago", "").replace("yesterday", "1d");
  const notEnded = () => SESS.filter(s => s.state !== "ended");
  function counts() {
    const o = { open: 0, hidden: 0, paused: 0, hw: 0, ow: 0, pw: 0, all: 0 };
    notEnded().forEach(s => { const v = vis(s); o[v]++; o.all++; if (s.state === "waiting") v === "hidden" ? o.hw++ : o.ow++; if (s.state === "paused" && s.was === "waiting") o.pw++; });
    return o;
  }
  const resumeCmd = s => s.agent === "GitHub Copilot" ? "copilot --resume " + s.cliId : s.agent === "Codex CLI" ? "codex resume " + s.cliId : s.agent === "Claude Code" ? "claude --resume " + s.cliId : "(picker)";

  // ---------- actions ----------
  function resumeS(s, show) {
    if (s.gone) { s.log.push(["t", "session " + s.cliId + " is not in Copilot's history: opened Copilot's session picker in the worktree"]); msg = "Session not found: opened the CLI's picker"; }
    else s.log.push(["t", "resumed: " + resumeCmd(s)]);
    if (s.was === "waiting") s.log.push(["a", "(the earlier question did not survive the stop: tell the agent to go on)"]);
    s.state = "idle"; s.was = null; s.ago = "now"; s.restored = false; s.gone = false;
    if (show) openItem(s);
  }
  function stopS(s) {
    s.was = s.state === "waiting" ? "waiting" : s.state === "working" ? "interrupted" : null;
    s.state = "paused"; s.ago = "now"; s.log.push(["t", "session stopped; claim kept, resumable as " + s.cliId]);
  }
  const needsAsk = s => s.state === "working" || ((s.state === "waiting" || s.state === "idle") && s.unseen);
  const openItem = s => s.ticket ? openTab("ticket", s.ticket) : s.map ? openTab("map", s.map) : openTab("session", s.id);
  let stopping = null, fC = "all", tD = "all", sD = "attn";
  const selD = new Set(), G = {}, DEF = {};
  const isCol = k => G[k] === undefined ? DEF[k] : G[k];
  const byIdS = id => SESS.find(s => s.id === id);

  const _a2 = action2;
  action2 = function (a) {
    if ((a === "sgexp" || a === "sgcol") && cur() !== "A") { Object.keys(DEF).forEach(k => G[k] = a === "sgcol"); return true; }
    if (!a.startsWith("sc:")) return _a2(a);
    const rest = a.slice(3), j = rest.indexOf(":"), op = j < 0 ? rest : rest.slice(0, j), arg = j < 0 ? "" : rest.slice(j + 1);
    if (op === "tg") G[arg] = !isCol(arg);
    if (op === "resume") resumeS(byIdS(arg), true);
    if (op === "resumeall") { const l = notEnded().filter(s => vis(s) === "paused" && (!arg || mapOfS(s) === arg)); l.forEach(s => resumeS(s, false)); msg = "Resumed " + l.length + " paused session(s) as hidden sessions"; }
    if (op === "stop") { const s = byIdS(arg); if (needsAsk(s)) { stopping = s; modal = "scstop"; } else { stopS(s); msg = "Stopped: " + itemT(s) + " is paused"; } }
    if (op === "stopgo") { stopS(stopping); msg = "Stopped: " + itemT(stopping) + " is paused"; modal = null; stopping = null; }
    if (op === "fc") fC = arg;
    if (op === "cs") cStyle = arg;
    if (op === "td") { tD = arg; selD.clear(); }
    if (op === "sd") sD = arg;
    if (op === "sel") selD.has(arg) ? selD.delete(arg) : selD.add(arg);
    if (op === "bulk") {
      const l = [...selD].map(byIdS);
      if (arg === "resume") { const p = l.filter(s => s.state === "paused"); p.forEach(s => resumeS(s, false)); msg = "Resumed " + p.length + " as hidden sessions"; }
      if (arg === "stop") { const p = l.filter(LIVE), ask = p.filter(needsAsk).length; p.forEach(stopS); msg = "Stopped " + p.length + (ask ? " (would ask once for " + ask + " running or unseen)" : ""); }
      selD.clear();
    }
    if (op === "restart") {
      let n = 0, r = 0; notEnded().filter(LIVE).forEach(s => { const o = isOpen(s); stopS(s); n++; if (o) { s.restored = true; r++; } });
      msg = "Quit + start: " + n + " sessions paused, " + r + " tabs restored (each resumes when first shown)";
    }
    if (op === "reset") location.reload();
    return true;
  };
  const _vm = VM.sessions;
  VM.sessions = () => (cur() === "A" ? _vm() : [["Expand All Groups", "sgexp"], ["Collapse All Groups", "sgcol"]]).concat(cur() === "B" ? ["-", ["Map counts: ●2 12", "sc:cs:dot", cStyle === "dot"], ["Map counts: W:2 H:12", "sc:cs:letters", cStyle === "letters"], ["Map counts: (2/12)", "sc:cs:fraction", cStyle === "fraction"]] : [])
    .concat(["-", ["Prototype: simulate quit and restart", "sc:restart"], ["Prototype: reset sample data", "sc:reset"]]);
  // opening a session clears its unseen-output dot
  document.addEventListener("click", e => { const x = e.target.closest("[data-opensess]"); if (x && !e.target.closest("[data-act]")) { const s = byIdS(x.dataset.opensess); if (s) s.unseen = false; } }, true);

  const _mh = modalHtml;
  modalHtml = function () {
    if (modal !== "scstop") return _mh();
    const s = stopping, why = s.state === "working" ? "It is running." : "It has output you have not seen.";
    return `<div class="m2" style="width:440px"><h3 style="margin:0 0 6px">Stop session?</h3><div><b>${esc(itemT(s))}</b> (${s.agent}). ${why}</div>
    <div class="dim" style="margin-top:6px">The claim stays. The session becomes paused${s.state === "working" ? " (interrupted)" : ""} and can be resumed by id.</div>
    <div class="dim" style="margin-top:6px;font-size:11px">Asks when running, or waiting/idle with unseen output (Settings).</div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end"><button data-closemodal="1">Cancel</button><button class="pri" data-act="sc:stopgo">Stop session</button></div></div>`;
  };

  // ---------- how tickets and maps show a paused session ----------
  const _sIcon = sIcon;
  sIcon = function (s) {
    if (s.state !== "paused") return _sIcon(s);
    const [p] = SPATH.paused, c = s.was === "waiting" ? "#d6b36a" : s.was === "interrupted" ? "#e09a8a" : SPATH.paused[1];
    return `<span class="ic ag off"${tip(s.agent + " paused: " + pLab(s) + " · " + s.ago + (s.restored ? "\nrestored tab: resumes when shown" : ""))}>${aSvg(s.agent)}${SVG(p, c, "so")}</span>`;
  };
  function pausedBox(s) {
    const w = WT[s.id] || WT.main, a = s.log.filter(x => x[0] === "a").slice(-1);
    const head = s.was === "waiting" ? `<span class="warn">was waiting on you</span>` : s.was === "interrupted" ? `<span class="bad">interrupted</span>` : "paused";
    const note = s.was === "waiting" ? "It asked a question when it stopped. The prompt does not survive a stop: after resuming, answer or tell it to go on."
      : s.was === "interrupted" ? "It was stopped mid-turn. After resuming, ask it to continue." : "It was idle when it stopped.";
    return `<div class="empty"><div class="box" style="max-width:560px">
     <div style="font-size:15px;color:#fff;margin-bottom:4px">${sIcon(s)} Paused session &middot; ${head}</div>
     <div class="dim">${s.agent} session <code>${esc(s.cliId)}</code>, last seen ${esc(s.ago)}. The claim stays on <code>${esc(w.branch)}</code>.</div>
     <div class="mono" style="background:#101010;padding:6px 8px;border-radius:3px;margin:10px 0;white-space:pre-wrap">${a.map(x => esc(x[1])).join("\n") || '<span class="dim">(no transcript line)</span>'}</div>
     <div class="dim" style="margin-bottom:12px">${note}</div>
     <button class="pri" data-act="sc:resume:${s.id}">&#9654; Resume</button> <button data-act="toast:Would open the CLI's session picker in the worktree">Pick another session&hellip;</button> <button data-act="toast:Would open a fresh session with the next-step command pre-typed">Start fresh</button>
     <div class="dim mono" style="font-size:11px;margin-top:8px">${esc(resumeCmd(s))}${s.agent === "GitHub Copilot" ? "  (checked against Copilot's history first)" : ""}</div></div></div>`;
  }
  function mapStrip(m) {
    const l = notEnded().filter(s => mapOfS(s) === m.id); if (!l.length) return "";
    const n = { open: 0, hidden: 0, paused: 0 }; l.forEach(s => n[vis(s)]++);
    const hw = l.filter(s => s.state === "waiting").length, p = l.filter(s => vis(s) === "paused").sort(bySt);
    return `<div style="padding:4px 12px 8px 32px;font-size:12px;border-top:1px solid #333"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
     <span class="dim">Sessions on this map:</span><span>${n.open} open</span><span>${n.hidden} hidden${hw ? ` <span class="warn">(${hw} waiting)</span>` : ""}</span><span>${n.paused} paused</span>
     <span style="flex:1"></span>${p.length ? `<button class="mini" data-act="sc:resumeall:${m.id}">Resume all on this map</button>` : ""}</div>
     ${p.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px">${p.slice(0, 6).map(s => `<span class="pill" style="cursor:pointer" data-opensess="${s.id}"${tip(itemT(s) + "\n" + pLab(s) + " · " + s.ago)}>${sIcon(s)}${esc(itemT(s))}</span>`).join("")}${p.length > 6 ? `<span class="dim">+${p.length - 6} more</span>` : ""}</div>` : ""}</div>`;
  }
  const _header = header;
  header = function (c, v) {
    let h = _header(c, v);
    if (c.t && c.s && c.s.state === "paused") h = h.replace(`<span class="dim">${c.s.agent}</span></span>`, `<span class="dim">${c.s.agent}</span></span><span class="pill" style="${s2(c.s)}">&#10074;&#10074; ${pLab(c.s)}</span>`);
    if (c.isMap) h = h.replace(/<\/div>$/, mapStrip(c.m) + "</div>");
    return h;
  };
  const s2 = s => s.was === "waiting" ? "background:#4a3f1c;color:#e9c46a" : s.was === "interrupted" ? "background:#3d2a2a;color:#e09a8a" : "";
  const _terminal = terminal;
  terminal = function (c) {
    if (c.s && c.s.state === "paused") { if (c.s.restored) { resumeS(c.s, false); msg = "Restored tab resumed on first show"; return _terminal(c); } return pausedBox(c.s); }
    return _terminal(c);
  };
  const _mapRow = mapRow;
  mapRow = function (m) {
    const l = notEnded().filter(s => mapOfS(s) === m.id), p = l.filter(s => s.state === "paused").length, w = l.filter(s => s.state === "waiting" || (s.state === "paused" && s.was === "waiting")).length;
    const chip = (w ? `<span class="warn" style="font-size:11px"${tip(w + " session(s) waiting or paused while waiting")}>&#9679;${w}</span>` : "") + (p ? `<span class="dim" style="font-size:11px"${tip(p + " paused session(s)")}>&#10074;&#10074;${p}</span>` : "");
    return _mapRow(m).replace(`<span class="dim" style="margin-left:auto">`, `<span style="margin-left:auto"></span>${chip}<span class="dim">`);
  };
  const _sb = statusBar;
  statusBar = function (c) {
    const n = counts();
    return _sb(c).replace(/>\d+ live \/ \d+ sessions</, `>${n.open} open &middot; ${n.hidden} hidden${n.hw ? " (" + n.hw + " waiting)" : ""} &middot; ${n.paused} paused<`);
  };

  // ---------- rows ----------
  const selS = s => { const c = ctx(); return c && c.s && c.s.id === s.id; };
  const mapChip = s => { const m = mapOf(mapOfS(s)); return m ? `<span class="mc" style="background:${mcol(m)}26;color:${mcol(m)}"${tip("Map: " + m.title)}>${mcode(m)}</span>` : `<span class="mc" style="background:#3335;color:#999"${tip("Unlinked")}>&#8960;</span>`; };
  const stLine = s => s.state === "waiting" ? "waiting on you: " + (s.q || s.lastLine) : s.state === "paused" ? (s.restored ? "restored tab · resumes when shown" : pLab(s) + " · " + s.lastLine) : s.state + " · " + s.lastLine;
  const tipS = s => itemT(s) + "\n" + s.agent + " · " + (s.state === "paused" ? "paused (" + pLab(s) + ")" : STXT[s.state]) + "\n" + ({ open: "open in a tab", hidden: "hidden: tab closed, still running", paused: "paused: no process, resumable by id" })[vis(s)] + "\nbranch: " + (WT[s.id] || WT.main).branch + "\nsession id: " + s.cliId + "\nlast: " + s.lastLine + " (" + s.ago + ")";
  const visIc = s => { const v = vis(s); return v === "open" ? `<span class="ic" style="width:12px;color:#9cdcfe;font-size:11px"${tip("Open in a tab")}>&#9635;</span>` : v === "hidden" ? `<span class="ic" style="width:12px;color:#666;font-size:11px"${tip("Hidden: tab closed, the session keeps running")}>&#9675;</span>` : `<span class="ic" style="width:12px;color:#777;font-size:9px"${tip("Paused: no process, resumable")}>&#10074;&#10074;</span>`; };
  const unseenDot = s => s.unseen ? `<span style="color:#4fa6ed;font-size:9px;flex:none"${tip("New output since you last looked")}>&#9679;</span>` : "";
  const acts = s => `<span class="ha">${s.state === "paused" ? `<button class="mini" data-act="sc:resume:${s.id}">Resume</button>` : `<span class="ib2" data-act="sc:stop:${s.id}"${tip("Stop session: claim kept, it becomes paused")}>&#9632;</span>`}</span>`;
  const pPill = s => `<span class="pill" style="font-size:10px;flex:none;${s2(s)}"${tip(pLab(s))}>${pLab(s).replace(" on you", "")}</span><span class="dim" style="font-size:11px;flex:none;width:22px;text-align:right">${short(s.ago)}</span>`;
  const wBar = s => s.state === "waiting" ? ' style="box-shadow:inset 3px 0 0 #d6b36a"' : "";
  function lineRow(s, o = {}) {
    return `<div class="row ${o.cls || ""} ${selS(s) ? "sel" : ""}" data-opensess="${s.id}"${tip(tipS(s))}${wBar(s)}>${o.vis ? visIc(s) : ""}${sIcon(s)}<span class="lbl">${esc(itemT(s))}</span>${unseenDot(s)}<span style="margin-left:auto"></span>${o.chip === false ? "" : mapChip(s)}${s.state === "paused" ? pPill(s) : `<span class="dim" style="font-size:11px;flex:none;width:44px;text-align:right">${s.state === "waiting" ? '<span class="warn">waiting</span>' : short(s.ago)}</span>`}${acts(s)}</div>`;
  }
  function fullRow(s, o = {}) {
    const col = s.state === "waiting" || s.was === "waiting" ? "color:#d6b36a" : "";
    return `<div class="row ${selS(s) ? "sel" : ""}" data-opensess="${s.id}"${tip(tipS(s))} style="flex-direction:column;align-items:stretch;gap:1px;padding:4px 8px 4px 10px${s.state === "waiting" ? ";box-shadow:inset 3px 0 0 #d6b36a" : ""}">
     <div style="display:flex;gap:6px;align-items:center">${o.vis ? visIc(s) : ""}${sIcon(s)}<span class="lbl" style="color:#eee">${esc(itemT(s))}</span>${unseenDot(s)}<span style="margin-left:auto"></span>${mapChip(s)}${acts(s)}</div>
     <div class="dim" style="display:flex;gap:6px;padding-left:${o.vis ? 38 : 20}px;font-size:11px"><span style="overflow:hidden;text-overflow:ellipsis;${col}">${esc(stLine(s))}</span><span style="margin-left:auto;flex:none">${esc(s.agent)} &middot; ${short(s.ago)}</span></div></div>`;
  }
  function sec(key, label, cnt, extra, def, color) {
    DEF[key] = def; const cl = isCol(key);
    return `<div class="sech" data-act="sc:tg:${key}" style="align-items:center;margin-top:1px${color ? ";color:" + color : ""}"><span style="width:10px">${cl ? "&#9656;" : "&#9662;"}</span><span>${label}</span><span style="font-weight:400;color:#999">${cnt}</span><span style="margin-left:auto;display:flex;gap:4px;text-transform:none;font-weight:400">${extra || ""}</span></div>`;
  }
  function sub(key, label, cnt, def) {
    DEF[key] = def; const cl = isCol(key);
    return `<div class="row grp" data-act="sc:tg:${key}"><span style="width:12px;font-size:10px">${cl ? "&#9656;" : "&#9662;"}</span><span class="lbl">${esc(label)}</span><span class="dim" style="margin-left:auto;font-weight:400">${cnt}</span></div>`;
  }
  const none = t => `<div class="dim" style="padding:4px 12px">${t}</div>`;
  const wTag = n => n ? ` <span class="warn">(${n} waiting)</span>` : "";
  const resumeAll = n => n ? `<button class="mini" data-act="sc:resumeall"${tip("Resume every paused session as a hidden session")}>Resume all</button>` : "";

  // ---------- variant B (round 2, user feedback): Hidden, Paused, then Open (the tabs already show open sessions);
  // the three sections are pane headers like VS Code's side bar panes; map groups carry compact counts, full table in the tooltip.
  // round 3: Hidden / Paused / Open are VS Code-style split panes: headers never scroll away, each body scrolls on its own,
  // sashes between expanded panes resize them, a header click collapses the pane to its header.
  let cStyle = "fraction";
  const wCol = "#d6b36a", PW = { "B:hid": 3, "B:pau": 2, "B:open": 2 };
  const CHEV = open => `<svg class="pc" width="12" height="12" viewBox="0 0 12 12" style="transform:rotate(${open ? 90 : 0}deg)"><path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="#ddd" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  function pane(key, label, n, w, wWord, extra, def) {
    DEF[key] = def; const cl = isCol(key);
    return `<div class="pane ${cl ? "" : "op"}" data-act="sc:tg:${key}"${tip(label + ": " + (w ? w + " " + wWord + ", " : "") + n + " in all\nClick to " + (cl ? "expand" : "collapse") + "; drag the line between panes to resize")}>${CHEV(!cl)}<span>${label}</span>${w ? `<span class="pn pw">${w}</span>` : ""}<span class="pn">${n}</span><span style="margin-left:auto;display:flex;gap:4px">${extra || ""}</span></div>`;
  }
  function paneBox(key, head, body) {
    const cl = isCol(key);
    return `<div class="pbox ${cl ? "cl" : ""}" data-pk="${key}" style="flex:${cl ? "none" : PW[key] + " 1 0"}">${head}${cl ? "" : `<div class="pbody" data-pb="${key}">${body}</div>`}</div>`;
  }
  let drag = null;
  document.addEventListener("mousedown", e => {
    const s = e.target.closest(".sash"); if (!s) return; e.preventDefault();
    const all = [...s.parentElement.querySelectorAll(":scope>.pbox")], idx = all.indexOf(s.previousElementSibling), ex = p => !p.classList.contains("cl");
    const up = all.slice(0, idx + 1).reverse().find(ex), dn = all.slice(idx + 1).find(ex); if (!up || !dn) return;
    all.filter(ex).forEach(p => p.style.flex = p.offsetHeight + " 1 0");
    drag = { y: e.clientY, up, dn, hu: up.offsetHeight, hd: dn.offsetHeight, all }; document.body.style.cursor = "ns-resize"; s.classList.add("on");
  });
  document.addEventListener("mousemove", e => {
    if (!drag) return; const min = 60, tot = drag.hu + drag.hd;
    const hu = Math.max(min, Math.min(tot - min, drag.hu + e.clientY - drag.y));
    drag.up.style.flex = hu + " 1 0"; drag.dn.style.flex = (tot - hu) + " 1 0";
  });
  document.addEventListener("mouseup", () => {
    if (!drag) return; drag.all.filter(p => !p.classList.contains("cl")).forEach(p => PW[p.dataset.pk] = p.offsetHeight);
    drag = null; document.body.style.cursor = ""; document.querySelectorAll(".sash.on").forEach(x => x.classList.remove("on"));
  });
  // keep each pane's scroll position across re-renders
  const _render = render;
  render = function () {
    const sc = {}; document.querySelectorAll("[data-pb]").forEach(x => sc[x.dataset.pb] = x.scrollTop);
    _render();
    document.querySelectorAll("[data-pb]").forEach(x => { if (sc[x.dataset.pb]) x.scrollTop = sc[x.dataset.pb]; });
  };
  // compact count for a map group: the waiting-like count (gold) and the total, in one of three styles
  function mcount(w, n, wLetter) {
    if (cStyle === "letters") return `${w ? `<span style="color:${wCol}">W:${w}</span> ` : ""}<span class="dim">${wLetter}:${n}</span>`;
    if (cStyle === "fraction") return w ? `<span class="dim">(</span><span style="color:${wCol}">${w}</span><span class="dim">/${n})</span>` : `<span class="dim">${n}</span>`;
    return `${w ? `<span style="color:${wCol}">&#9679;${w}</span> ` : ""}<span class="dim">${n}</span>`;
  }
  function statusTable(title, l, rows) {
    const num = n => String(n).padStart(3, " ");
    return title + "\n" + rows.map(([lab, f]) => num(l.filter(f).length) + "   " + lab).join("\n") + "\n" + num(l.length) + "   total";
  }
  function mapGroups(l, key, float, wLetter, rowsFor) {
    const ks = MAPS.map(m => m.id).concat("-"), grp = ks.map(k => [k, l.filter(s => (mapOfS(s) || "-") === k)]).filter(x => x[1].length);
    grp.sort((a, b) => b[1].filter(float).length - a[1].filter(float).length);
    return grp.map(([k, g]) => {
      const fl = g.filter(float), gk = key + k, name = k === "-" ? "Unlinked" : mapOf(k).title; DEF[gk] = true; const cl = isCol(gk);
      return `<div class="row grp" data-act="sc:tg:${gk}"${tip(statusTable(name + " · " + (wLetter === "H" ? "hidden" : "paused") + " sessions", g, rowsFor))}><span style="width:12px;font-size:10px">${cl ? "&#9656;" : "&#9662;"}</span><span class="lbl">${esc(name)}</span><span style="margin-left:auto;font-weight:400;font-size:12px;flex:none">${mcount(fl.length, g.length, wLetter)}</span></div>`
        + (cl ? fl : g).map(s => lineRow(s, { cls: "child", chip: false })).join("");
    }).join("");
  }
  function viewB() {
    const A = notEnded().sort(bySt), c = counts();
    const open = A.filter(s => vis(s) === "open"), hid = A.filter(s => vis(s) === "hidden"), pau = A.filter(s => vis(s) === "paused");
    const h = pane("B:hid", "Hidden", hid.length, c.hw, "waiting", "", false);
    const hb = isCol("B:hid") ? "" : mapGroups(hid, "B:h:", s => s.state === "waiting", "H",
      [["waiting on you", s => s.state === "waiting"], ["working", s => s.state === "working"], ["idle", s => s.state === "idle"], ["new output unseen", s => s.unseen]]) || none("No hidden sessions");
    const p = pane("B:pau", "Paused", pau.length, c.pw, "were waiting", resumeAll(pau.length), false);
    const pb = isCol("B:pau") ? "" : mapGroups(pau, "B:p:", s => s.was === "waiting", "P",
      [["was waiting on you", s => s.was === "waiting"], ["interrupted", s => s.was === "interrupted"], ["paused", s => !s.was]]) || none("Nothing paused");
    const q = pane("B:open", "Open", open.length, c.ow, "waiting", "", false);
    const qb = isCol("B:open") ? "" : open.map(s => fullRow(s)).join("") || none("No session tabs open");
    const sash = '<div class="sash"></div>';
    return paneBox("B:hid", h, hb) + sash + paneBox("B:pau", p, pb) + sash + paneBox("B:open", q, qb);
  }

  // ---------- variant C: attention inbox, flat by what you have to do; open/hidden/paused is an attribute ----------
  function viewC() {
    const A = notEnded(), c = counts();
    const chips = `<div class="chips">${[["all", "All", c.all], ["open", "Open", c.open], ["hidden", "Hidden", c.hidden], ["paused", "Paused", c.paused]].map(([k, l, n]) => `<span class="fc ${fC === k ? "on" : ""}" data-act="sc:fc:${k}">${l} ${n}</span>`).join("")}</div>`;
    const L = A.filter(s => fC === "all" || vis(s) === fC), vo = s => ({ open: 0, hidden: 1, paused: 2 })[vis(s)];
    const sorted = l => l.sort((a, b) => attn(a) - attn(b) || vo(a) - vo(b));
    const needs = sorted(L.filter(s => s.state === "waiting" || (s.state === "paused" && s.was === "waiting")));
    const work = sorted(L.filter(s => s.state === "working")), idle = sorted(L.filter(s => s.state === "idle")), pz = sorted(L.filter(s => s.state === "paused" && s.was !== "waiting"));
    let o = chips + sec("C:n", "Needs you", needs.length, "", false, "#d6b36a");
    if (!isCol("C:n")) o += needs.map(s => fullRow(s, { vis: true })).join("") || none("Nobody is waiting on you");
    o += sec("C:w", "Working", work.length, "", false);
    if (!isCol("C:w")) o += work.map(s => lineRow(s, { vis: true })).join("");
    o += sec("C:i", "Idle", idle.length, "", idle.length > 6);
    if (!isCol("C:i")) o += idle.map(s => lineRow(s, { vis: true })).join("");
    o += sec("C:p", "Paused", pz.length, resumeAll(c.paused), true);
    if (!isCol("C:p")) o += pz.map(s => lineRow(s, { vis: true })).join("");
    return o;
  }

  // ---------- variant D: wide sortable table behind Open / Hidden / Paused tabs, with bulk actions ----------
  function viewD() {
    const A = notEnded(), c = counts();
    const tb = `<div style="display:flex;border-bottom:1px solid #333">${[["all", "All", c.all], ["open", "Open", c.open], ["hidden", "Hidden", c.hidden, c.hw], ["paused", "Paused", c.paused, c.pw]].map(([k, l, n, w]) => `<div class="stab ${tD === k ? "on" : ""}" data-act="sc:td:${k}">${l} <span class="pill">${n}</span>${w ? `<span class="warn" style="font-size:10px"${tip(w + " waiting")}> &#9679;${w}</span>` : ""}</div>`).join("")}</div>`;
    const L = A.filter(s => tD === "all" || vis(s) === tD);
    const SK = { attn: (a, b) => attn(a) - attn(b), item: (a, b) => itemT(a).localeCompare(itemT(b)), map: (a, b) => (mapOfS(a) || "~").localeCompare(mapOfS(b) || "~") || attn(a) - attn(b), where: (a, b) => vis(a).localeCompare(vis(b)) || attn(a) - attn(b) };
    L.sort(SK[sD]);
    const bulk = selD.size ? `<div class="gl" style="background:#04395e;gap:6px">${selD.size} selected<span style="flex:1"></span><button class="mini" data-act="sc:bulk:resume">Resume</button><button class="mini" data-act="sc:bulk:stop">Stop</button><button class="mini" data-act="sc:bulk:clear">Clear</button></div>`
      : `<div class="gl dim" style="font-size:11px">${L.length} sessions &middot; sorted by ${sD === "attn" ? "attention" : sD}${tD === "paused" && L.length ? `<span style="flex:1"></span>${resumeAll(L.length)}` : ""}</div>`;
    const stTxt = s => s.state === "paused" ? `<span style="${s2(s)};background:none">${s.restored ? "restored" : pLab(s).replace("was waiting on you", "was waiting")}</span>` : s.state === "waiting" ? '<span class="warn">waiting</span>' : s.state;
    const H = (k, l) => `<span data-act="sc:sd:${k}"${tip("Sort by " + l)}>${l}${sD === k ? " &#9662;" : ""}</span>`;
    const rows = L.map(s => `<div class="r ${selS(s) ? "sel" : ""} ${s.state === "waiting" ? "w" : ""}" data-opensess="${s.id}"${tip(tipS(s))}>
      <span data-act="sc:sel:${s.id}" style="text-align:center">${selD.has(s.id) ? "&#9745;" : "&#9744;"}</span><span>${sIcon(s)}</span><span>${esc(itemT(s))} ${unseenDot(s)}</span><span>${mapChip(s)}</span><span>${stTxt(s)}</span>
      <span class="dim">${vis(s)}</span><span class="dim" style="text-align:right">${short(s.ago)}</span></div>`).join("");
    return tb + bulk + `<div class="tb"><div class="r h"><span></span>${H("attn", "&#9679;")}${H("item", "Item")}${H("map", "Map")}<span>State</span>${H("where", "Where")}<span>Last</span></div>${rows}</div>` + (L.length ? "" : none("Nothing here"));
  }

  // ---------- register variants ----------
  const _sv = sessView;
  const wrapV = (fn, wide) => () => {
    sessView = fn; let h = VA(); const c = counts();
    h = h.replace(/<span class="badge">\d+<\/span>/, c.hw + c.ow ? `<span class="badge" style="background:#d6b36a;color:#111">${c.hw + c.ow}</span>` : "");
    if (wide && leftSel === "sessions") h = h.replace(`class="side" style="width:290px"`, `class="side" style="width:${wide}px"`);
    if (fn === viewB && leftSel === "sessions") h = h.replace(`<div class="body">`, `<div class="body pstack">`);
    return h;
  };
  V.A = [V.A[0], () => { sessView = _sv; return VA(); }];
  V.B = ["Sessions at scale: Hidden, Paused, Open split panes", wrapV(viewB)];
  V.C = ["Sessions at scale: attention inbox", wrapV(viewC)];
  V.D = ["Sessions at scale: table with tabs", wrapV(viewD, 440)];
  keys.push("B", "C", "D");
  // the power user's workspace: four session tabs open, the rest hidden or paused
  tabs = [{ k: "ticket", i: "16" }, { k: "ticket", i: "26" }, { k: "map", i: "m2" }, { k: "ticket", i: REAL.scaleOpen[0] }]; act = 0; leftSel = "sessions";
  if (!new URLSearchParams(location.search).get("variant")) try { history.replaceState(null, "", "?variant=B"); } catch (e) { }
  render();
})();
