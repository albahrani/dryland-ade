// PROTOTYPE (throwaway): SAMPLE data layered on the real snapshot so every scenario is visible.
// Everything marked demo:true is invented. Loaded after data.js.
(function () {
  const R = REAL, d = (id, map, title, type, status, blocked, gist) => ({ id, map, title, type, status, blocked, gist, demo: true });

  // the session we are in right now is live and busy
  R.sessions.forEach(s => { if (s.id === "3f4efd51") { s.state = "working"; s.last = new Date().toTimeString().slice(0, 8); } });

  // ---- maps: m1 real; m2 in-flight sample; m3 finished sample; m4 brand new sample
  R.maps = [
    { id: "m1", title: "Matt Pocock ADE", dest: R.dest, fog: R.fog },
    { id: "m2", title: "Checkout redesign", demo: true, dest: "Sample: ship the new one-page checkout with saved payment methods.", fog: ["Fraud checks and 3DS flow", "Analytics events for funnel"] },
    { id: "m3", title: "Docs site migration", demo: true, dest: "Sample: all docs moved to the new site, old URLs redirect.", fog: [] },
    { id: "m4", title: "Mobile offline mode", demo: true, dest: "Sample: the app works for 24h without network.", fog: ["Conflict resolution strategy", "Storage limits", "Sync scheduling", "Telemetry while offline"] }
  ];

  // ---- extra tickets
  R.tickets.push(
    d("12", "m1", "Packaging, auto-update and distribution", "grilling", "open", [], "Graduated from fog (sample)."),
    d("13", "m1", "Testing strategy for rule engine and adapters", "grilling", "open", [], "Graduated from fog (sample)."),
    d("14", "m1", "Settings surface and non-default skill setups", "grilling", "open", ["11"], "Needs the views first (sample)."),
    d("15", "m1", "Spec the rule engine inputs and outputs", "research", "open", ["12", "13"], "Blocked on two open tickets (sample)."),
    d("16", "m1", "Decide the product name", "grilling", "claimed", [], "In a session with Claude Code (sample)."),
    d("17", "m1", "Copilot CLI hook adapter spike", "prototype", "claimed", [], "Parked in an idle Codex session (sample)."),
    d("18", "m1", "Research: GitLab issue API gaps", "research", "claimed", [], "Waiting on you in a Gemini session (sample)."),

    d("21", "m2", "Audit current checkout funnel", "research", "resolved", [], "Drop-off is highest on the address step."),
    d("22", "m2", "Choose payment provider SDK", "research", "resolved", ["21"], "Stripe Elements chosen."),
    d("23", "m2", "One-page layout", "prototype", "open", ["22"], "Three layouts to compare."),
    d("24", "m2", "Saved payment methods UX", "grilling", "open", ["22"], "How to show and delete cards."),
    d("25", "m2", "Error and retry states", "prototype", "blocked", ["23", "24"], "Blocked by layout and saved cards."),
    d("26", "m2", "Implement checkout form", "task", "claimed", ["23"], "Working in a worktree (sample)."),

    d("31", "m3", "Inventory existing docs", "research", "resolved", [], "212 pages found."),
    d("32", "m3", "Pick site generator", "research", "resolved", ["31"], "Chosen."),
    d("33", "m3", "Redirect map", "task", "resolved", ["32"], "Done and verified."),

    d("41", "m4", "Local storage engine choice", "research", "open", [], "SQLite vs. IndexedDB."),
    d("42", "m4", "Offline UX states", "prototype", "open", [], "What the user sees when offline.")
  );

  // ---- extra sessions
  const L = (a) => a.map(x => [x[0], x[1]]), E = (a) => a;
  const S = (id, name, agent, model, ticket, map, state, started, last, log, ev, wt) =>
    ({ id, name, agent, model, ticket, map, state, started, last, events: ev.length, log, ev, typed: null, demo: true, wt });
  R.sessions.push(
    S("c1a2", "Decide the product name", "Claude Code", "claude-sonnet", "16", null, "waiting", "09:12:04", "09:41:50",
      [["u", "/wayfinder continue on Matt Pocock ADE map"], ["a", "I have 5 name candidates. Which direction do you prefer: short and punchy, or descriptive?"]],
      [["09:12:04", "session.start", "claude code in worktree"], ["09:41:50", "tool", "AskUserQuestion name direction"]], "mattpocock-ade/16-decide-the-product-name"),
    S("x7b3", "Copilot CLI hook adapter spike", "Codex CLI", "gpt-5-codex", "17", null, "idle", "08:20:11", "08:58:02",
      [["u", "Build a throwaway spike that reads Copilot hook events"], ["t", "shell node spike.js"], ["a", "Spike reads hook JSON from stdin. Awaiting next instruction."]],
      [["08:20:11", "session.start", "codex in worktree"], ["08:58:02", "tool", "shell node spike.js"]], "mattpocock-ade/17-copilot-cli-hook-adapter"),
    S("g9d4", "GitLab API gap research", "Gemini CLI", "gemini-2.5-pro", "18", null, "waiting", "09:30:00", "09:52:31",
      [["u", "List what the GitLab issue API cannot express"], ["a", "Found 3 gaps. Do you want me to continue with the board API?"]],
      [["09:30:00", "session.start", "gemini in worktree"], ["09:52:31", "tool", "web_fetch docs.gitlab.com"]], "mattpocock-ade/18-research-gitlab-issue-api-gaps"),
    S("k5e6", "Implement checkout form", "Claude Code", "claude-sonnet", "26", null, "working", "09:05:00", "09:59:01",
      [["u", "Implement the one-page checkout"], ["t", "Edit src/checkout/Form.tsx"], ["t", "Bash pnpm test checkout"], ["a", "Tests are running..."]],
      [["09:05:00", "session.start", "claude code in worktree"], ["09:58:40", "tool", "Edit src/checkout/Form.tsx"], ["09:59:01", "tool", "Bash pnpm test checkout"]], "mattpocock-ade/26-implement-checkout-form"),
    S("m2f7", "Checkout redesign map", "Claude Code", "claude-sonnet", null, "m2", "working", "09:50:00", "09:59:00",
      [["u", "/wayfinder continue on Checkout redesign map"], ["a", "Reading the map and frontier..."]],
      [["09:50:00", "session.start", "claude code in worktree"]], "mattpocock-ade/map-m2"),
    S("u8h1", "Explore flaky test", "Claude Code", "claude-sonnet", null, null, "working", "09:20:00", "09:58:30",
      [["u", "Why is the login e2e flaky?"], ["t", "Bash pnpm test:e2e --repeat 20"]],
      [["09:20:00", "session.start", "claude code in worktree"], ["09:58:30", "tool", "Bash pnpm test:e2e --repeat 20"]], "scratch/flaky-login"),
    S("u3j9", "Quick question about CSS", "GitHub Copilot", "gpt-5", null, null, "idle", "07:40:00", "07:55:00",
      [["u", "How do I center a div?"], ["a", "Use flexbox: display:flex; place-items:center."]],
      [["07:40:00", "session.start", "copilot in main checkout"]], null),
    S("d4p5", "Redirect map", "Claude Code", "claude-sonnet", "33", null, "ended", "Yesterday 16:00", "Yesterday 17:10",
      [["u", "Do the redirect map"], ["a", "Done, all 212 URLs verified."]],
      [["16:00:00", "session.start", "claude code in worktree"], ["17:10:00", "session.end", "ticket resolved"]], "mattpocock-ade/33-redirect-map")
  );

  // ---- worktrees for sessions that own one (changes relative to main)
  const base = R.files.map(f => [f[0], "", 0]);
  const wt = (branch, changes, commits) => ({ branch, files: base.concat(changes), commits: commits.concat(R.commits) });
  R.wt = {
    c1a2: wt("mattpocock-ade/16-decide-the-product-name", [["names/candidates.md", "A", 0]], [["a1b2c3d", "draft name candidates", 0, "40m"]]),
    x7b3: wt("mattpocock-ade/17-copilot-cli-hook-adapter", [["spike/hook.js", "A", 1], ["spike/README.md", "A", 0]], [["b2c3d4e", "spike: read hook events", 0, "1h"]]),
    g9d4: wt("mattpocock-ade/18-research-gitlab-issue-api-gaps", [["research/gitlab-gaps.md", "A", 0]], []),
    k5e6: wt("mattpocock-ade/26-implement-checkout-form", [["src/checkout/Form.tsx", "A", 1], ["src/checkout/Form.test.tsx", "A", 0], ["package.json", "M", 0]], [["c3d4e5f", "checkout: scaffold form", 0, "2h"], ["d4e5f6a", "checkout: validation", 0, "1h"]]),
    m2f7: wt("mattpocock-ade/map-m2", [["maps/checkout-redesign.md", "M", 0]], []),
    u8h1: wt("scratch/flaky-login", [["e2e/login.spec.ts", "M", 0]], []),
    d4p5: wt("mattpocock-ade/33-redirect-map", [], [["e5f6a7b", "add redirect map", 0, "yesterday"]])
  };
})();
