# Show the approximate marking on the Sessions view's last-output line

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-22T07:24:39.339Z","was":""}} -->

## Question

In the Sessions view, a session row shows its last output line instead of its state label (SessionsView.tsx, line ?? stateLabel(...)), so for a hookless CLI the (approximate) marking is hidden whenever a last line exists; only the badge tooltip carries it. Decide how the row should show it (for example a small mark beside the badge) and do it, with a test where one is possible. Raised in review of ticket 44.
