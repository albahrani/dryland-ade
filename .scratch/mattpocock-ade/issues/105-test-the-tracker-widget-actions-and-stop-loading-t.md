# Test the tracker widget actions and stop loading the whole project for them

Type: task
Status: resolved
Blocked by: 048

## Question

The tracker:widget-action handler (reveal issues folder, open issues in browser through gh/glab) has no test, and it calls projectView() just to get the main checkout path. Move the action into a testable module that takes a runner and an opener, test both actions and their failures, and look the checkout up with findMainCheckout. Also read the tracker doc once in readTrackerInfo instead of twice. Raised in review of ticket 48.

## Answer

Moved the tracker:widget-action handler into packages/desktop/src/main/tracker-widget-action.ts (runTrackerWidgetAction, taking a runner, projectPath and an openPath opener). It looks the main checkout up with findMainCheckout and the forge with readTrackerKind, so the handler no longer loads the whole project view. readTrackerInfo now reads the tracker doc once (readTrackerDoc + trackerKindOf in tracker.ts). Tests in packages/desktop/test/tracker-widget-action.test.ts cover reveal, open-issues through gh and glab, forge failure, opener failure, local markdown, and no repo/unknown action/no project. Commit 23b6a3e. pnpm test and pnpm test:linux pass; no desktop UI changed, so no e2e run.
