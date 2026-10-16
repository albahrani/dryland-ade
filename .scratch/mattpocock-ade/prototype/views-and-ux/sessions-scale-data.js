// PROTOTYPE (throwaway), ticket 71: SAMPLE data for the Sessions view at scale.
// A power user with 4 open session tabs, ~30 hidden live sessions and 14 paused sessions over four maps.
// Everything here is invented (demo:true). Loaded after scenarios.js, before the main script.
(function () {
  const R = REAL;
  R.maps.push({ id: "m5", title: "Billing v2", demo: true, dest: "Sample: usage-based billing with prorated plan changes.", fog: ["Revenue recognition export"] });

  const POOL = {
    m1: ["Session index read and write", "Reconcile the index on window focus", "Hidden tab output buffer", "Stop session confirmation rule", "Resume by id for Claude Code",
      "Copilot session-exists check", "Claim holder becomes the worktree branch", "Paused-was-waiting rule", "Retention cleanup of index entries",
      "Restore session tabs on start", "Resume all action", "Quit dialog lists live sessions", "Adapter --session-id launch", "Settings: resume on start", "Strip CLAUDE_CODE_CHILD_SESSION"],
    m2: ["Address autocomplete", "Saved cards list", "3DS challenge flow", "Coupon field", "Order summary sidebar", "Guest checkout", "Tax calculation service",
      "Shipping options picker", "Checkout analytics events", "Payment error copy"],
    m4: ["SQLite schema for drafts", "Sync queue", "Conflict banner UX", "Offline indicator", "Background sync scheduler", "Storage quota warning", "Retry backoff policy", "Offline telemetry buffer"],
    m5: ["Invoice PDF renderer", "Proration rules", "Dunning emails", "Usage metering export", "Plan change preview", "Tax IDs on invoices", "Billing portal links", "Webhook replay tool"]
  };
  // per map: how many live (open or hidden) before the rest become paused; which live index waits; which one is open in a tab
  const PLAN = { m1: { live: 9, waiting: [2], open: [] }, m2: { live: 7, waiting: [4], open: [] }, m4: { live: 5, waiting: [], open: [] }, m5: { live: 6, waiting: [1], open: [0] } };
  const TYPES = ["task", "task", "grilling", "task", "prototype", "research"];
  const AG = ["Claude Code", "Claude Code", "GitHub Copilot", "Claude Code", "Codex CLI"];
  const LIVE_ST = ["working", "idle", "working", "idle", "idle", "working", "idle"];
  const WAS = ["waiting", "interrupted", null, "waiting", "interrupted", null, null];
  const AGO = ["14m ago", "2h ago", "yesterday", "3d ago", "5d ago", "6d ago", "40m ago"];
  const ASK = ["Run the migration against the dev database now?", "Two designs fit. Should saved cards sit above or below the new-card form?", "Allow `pnpm add pdfkit`?", "Which retry cap do you want: 5 or 10?"];
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28);
  let n = 100, k = 0, ask = 0;
  R.scaleOpen = [];
  Object.keys(POOL).forEach(map => {
    const P = PLAN[map];
    POOL[map].forEach((title, i) => {
      const id = "s" + (++n), type = TYPES[i % TYPES.length], agent = AG[k % AG.length], sid = "z" + n;
      R.tickets.push({ id, map, title, type, status: "claimed", blocked: [], gist: "Sample claimed ticket (ticket 71 scale data).", demo: true });
      const br = "mattpocock-ade/" + id + "-" + slug(title);
      const isLive = i < P.live, waiting = P.waiting.includes(i);
      const state = !isLive ? "paused" : waiting ? "waiting" : LIVE_ST[k % LIVE_ST.length];
      const pi = i - P.live, was = isLive ? null : WAS[(k + pi) % WAS.length];
      const q = waiting || was === "waiting" ? ASK[ask++ % ASK.length] : null;
      const last = state === "working" ? "Running pnpm test " + slug(title) + " ..." : q ? q : state === "paused" && was === "interrupted" ? "Editing src/" + slug(title) + ".ts ..." : "Done. Want me to commit this?";
      const log = [["u", "/implement " + id], ["t", "Read .scratch/" + map + "/issues/" + id + ".md"], ["a", last]];
      const s = {
        id: sid, name: title, agent, model: agent === "Claude Code" ? "claude-sonnet" : "", ticket: id, map: null, state,
        started: (8 + (k % 3)) + ":" + String(10 + k % 49).padStart(2, "0") + ":00", last: "09:" + String(59 - k % 50).padStart(2, "0") + ":10",
        events: 3, log, ev: [["09:00:00", "session.start", agent + " in worktree"], ["09:10:00", "tool", "Read issue"], ["09:20:00", state === "waiting" ? "notification" : "tool", last]],
        typed: null, demo: true, was, q, lastLine: last, ago: isLive ? (k % 4) + 1 + "m ago" : AGO[(k + pi) % AGO.length],
        unseen: isLive && state === "idle" && k % 2 === 0, gone: !isLive && agent === "GitHub Copilot" && pi === 0, cliId: (agent === "GitHub Copilot" ? "" : "") + (n * 7919).toString(16) + "-4c1e-9a"
      };
      R.sessions.push(s);
      R.wt[sid] = { branch: br, files: R.files.map(f => [f[0], "", 0]).concat([["src/" + slug(title) + ".ts", "A", 0]]), commits: R.commits };
      if (P.open.includes(i)) R.scaleOpen.push(id);
      k++;
    });
  });
  // the hand-written sample sessions from scenarios.js keep their states; give them the extra fields
  R.sessions.forEach(s => {
    if (s.lastLine) return;
    const l = s.log.filter(x => x[0] === "a").at(-1) || s.log.at(-1);
    s.lastLine = l ? l[1] : ""; s.ago = s.state === "ended" ? "yesterday" : "1m ago"; s.q = s.state === "waiting" ? s.lastLine : null;
    s.cliId = s.cliId || s.id + "-7d2f-41b0";
  });
})();
