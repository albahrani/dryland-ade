# Restore session tabs on start and Resume all

Type: task
Status: ready-for-agent
Blocked by: 76, 41

Spec: [spec](../spec.md), user story 100. "Sessions, pausing and resuming". ADRs 0003 (consent), 0010.

## What to build

Getting back to where the user left off, without every agent starting at once.

- **Restore**: the session tabs open at quit come back at start (the per-project tab list already persists). A restored tab whose session is paused resumes, as in "Resume a paused session", only when it is first shown.
- **Resume all**: a Session menu action that resumes every paused session as a hidden session, opening no tabs. A map tab offers "Resume all on this map" for that map's paused sessions.
- **Resume sessions on start**: a setting, off by default. When on, startup resumes every paused session as hidden; restored tabs show as usual.

## Acceptance criteria

- [ ] After quit and start the session tabs are back, none of them running until shown; showing one resumes it
- [ ] Resume all resumes every paused session hidden and opens no tab
- [ ] Resume all on a map resumes only that map's paused sessions
- [ ] With "Resume sessions on start" on, startup resumes every paused session hidden; it is off by default
- [ ] A restored session that cannot be resumed by id falls back like Resume does
