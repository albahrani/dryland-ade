# Show the approximate marking on the Sessions view's last-output line

Type: task
Status: resolved

## Question

In the Sessions view, a session row shows its last output line instead of its state label (SessionsView.tsx, line ?? stateLabel(...)), so for a hookless CLI the (approximate) marking is hidden whenever a last line exists; only the badge tooltip carries it. Decide how the row should show it (for example a small mark beside the badge) and do it, with a test where one is possible. Raised in review of ticket 44.

## Answer

Done in 0871bcf. A session row in the Sessions view's open pane that shows its last output line now carries a small ≈ mark before the line, with the tooltip 'working (approximate)' (or the state's label). The mark comes from approximateMark in shared/session-meta.ts, tested in session-meta.test.ts: shown for a guessed state, not for a hook-reported or ended one. Rows without a last line still show the full '(approximate)' label. Known limit: no e2e test for the rendered mark. Full suite passed except installed-launcher.test.ts, which failed with ENOSPC (C: temp disk full); the Linux Docker run was skipped for the same reason.
