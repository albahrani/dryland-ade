# Restore session tabs on start and Resume all

Type: task
Status: resolved
Blocked by: 76, 41

Spec: [spec](../spec.md), user story 100. "Sessions, pausing and resuming". ADRs 0003 (consent), 0010.

## What to build

Getting back to where the user left off, without every agent starting at once.

- **Restore**: the session tabs open at quit come back at start (the per-project tab list already persists). A restored tab whose session is paused resumes, as in "Resume a paused session", only when it is first shown.
- **Resume all**: a Session menu action that resumes every paused session as a hidden session, opening no tabs. A map tab offers "Resume all on this map" for that map's paused sessions.
- **Resume sessions on start**: a setting, off by default. When on, startup resumes every paused session as hidden; restored tabs show as usual.

## Acceptance criteria

- [x] After quit and start the session tabs are back, none of them running until shown; showing one resumes it
- [x] Resume all resumes every paused session hidden and opens no tab
- [x] Resume all on a map resumes only that map's paused sessions
- [x] With "Resume sessions on start" on, startup resumes every paused session hidden; it is off by default
- [x] A restored session that cannot be resumed by id falls back like Resume does

## Comments

From mattpocock-ade/41 (bc47448): quitting keeps the saved tab list, but parseTabs in packages/desktop/src/shared/tabs.ts drops every terminal tab when it reads it ('Terminals never outlive the app, so they are not saved'), and terminal tabs are keyed by the PTY's id, which a restart does not keep. Restoring session tabs means saving session tabs by their item and session instead, and keeping them through parseTabs.

## Answer

Built in 7f51de4 and 6e330dc. Session tabs are saved by their ticket (SessionRef in shared/tabs.ts, savedTabs/replaceTab, kept by parseTabs); a restored tab shows 'Resuming...' and, once shown, becomes the running session (replayed), the resumed paused one, or its ticket tab. Resume all: main resumeAllPaused (sequential, main/resume-all.ts) from the Sessions menu ('Resume All Paused Sessions') and a map tab's 'Resume all on this map'; sessions reach the window by IPC sessions:started and open no tab. Setting resumeOnStart (Sessions menu checkbox, off by default) resumes all hidden at start. resumeSession refuses a ticket whose session already runs, so a restored tab and resume-on-start cannot start two. Known limits: tickets only (map sessions wait for ticket 79); startup resumes only the last-opened project; failures of Resume all show as one notice; Resume all asks no confirmation (not a tracker write).
