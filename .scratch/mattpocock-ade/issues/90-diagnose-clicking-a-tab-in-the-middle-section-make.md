# Diagnose: clicking a tab in the middle section makes the tabs disappear

Type: task
Status: resolved

## Question

Clicking a tab in the middle section makes the tab strip disappear. Reproduce it (open the UI on our own project, open several tabs, click one), find the cause, fix it with a regression test.

## Answer

Cause: .tabbar was a shrinkable flex child of the column .editor (overflow-x:auto gives it min-height 0), so a tab with tall content, such as a long file, squeezed the strip to zero height and .editor covered the tabs. Fix: flex: none on .tabbar (commit 7049d29). Regression test: e2e/tab-strip.spec.ts opens a 400-line file and clicks tabs; it failed before the fix (click intercepted by .editor) and passes after, on Windows and Linux. A terminal tab did not reproduce it.
