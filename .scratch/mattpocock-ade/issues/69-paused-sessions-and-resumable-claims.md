# Paused sessions and resumable claims

Type: grilling
Status: resolved

## Question

How should Dryland behave when the app is closed mid-session (for example mid-grilling): what happens to claims and sessions at quit, how a session is linked to its ticket or map without new tracker state, what counts as a held, paused or possibly stale claim, how sessions are resumed and restored on start, and how closing a tab and stopping a session differ? Derive as much as possible from the Agent CLIs and the skill artifacts; best effort for work done outside Dryland.

## Answer

Grilled with the user after ticket 39 left every Dryland claim reading stale after a restart. Recorded in ADR 0010, the spec (stories 55, 56, 63, 96 to 103, "Sessions, pausing and resuming") and the glossary (Session, Paused session, Claim, Stale claim).

- Terms: a session is the Agent CLI's own session, resumable, live while its process runs in Dryland. No Dryland "work session" or "task session" noun (fights the CLIs' established meaning; "task" is also a ticket type). Dryland's unit of work is the item: a ticket, a map or a scratch worktree. A paused session is a known, resumable session of a claimed item with no live process.
- Claim holder is always a branch (the ticket's worktree branch for sessions Dryland starts), never a Dryland session id. A claim is live (a session runs in Dryland), paused (the index knows a resumable session) or possibly stale (neither, and its branch is no checked-out ticket worktree). A default-branch claim with no known session is possibly stale.
- Session index at <git common dir>/dryland/sessions.json: one file for the main checkout and all worktrees, ignored and never committed by git, beside the tracker lock. Keyed by item; per session the CLI, its session id, last seen and, for sessions the app ran, last state. It is a cache: startup and window focus reconcile it with the tracker, git and each CLI's history for the item's worktree (found sessions carry no last state). Rejected: committing it to main (commit churn, lock contention, machine-local ids in a shared file), session ids in ticket metadata (a write per /clear, network writes on GitHub/GitLab, one-machine ids), resuming by "continue newest in this directory" (ambiguous on the main checkout).
- Writers: the app from its sessions' hooks, including the new id after /clear. Every mutating dryland ticket command run inside an Agent CLI session (adapter session env var, e.g. CLAUDE_CODE_SESSION_ID) links that session to the ticket, app open or not. dryland status stays a no-op without the app: recording nothing beats recording something wrong about work outside Dryland.
- Paused labels from the last state: "was waiting on you" (a permission prompt does not survive a stop; the user tells the agent to go on), "interrupted" (stopped mid-turn), plain "Paused". Next steps: live waiting, then paused-was-waiting, then stale claims.
- Resume uses the CLI's resume-by-id, falling back to the CLI's picker in the item's directory, then a fresh start with the pre-typed command.
- Closing a session tab only hides it: the PTY keeps running, output is buffered (bounded) and replayed on reopen. Stop session is separate and asks when the session is running, or waiting or idle with output not seen since; the rule is a setting.
- Quit lists all live sessions (hidden too, unseen first), stops them and keeps every claim; nothing is released at quit or shutdown. Ticket 41 was rewritten accordingly.
- Startup restores the session tabs open at quit, resuming each lazily when first shown. Resume all action plus an opt-in "Resume sessions on start" setting (off by default, ADR 0003 consent).
- A paused session drops out when its ticket is resolved or its claim released; index entries expire after a retention setting, default 30 days.
- Follow-ups: research ticket 70 (session ids, resume and /clear per CLI), prototype ticket 71 (Sessions view at scale); build tickets graduate from the fog once both resolve.
