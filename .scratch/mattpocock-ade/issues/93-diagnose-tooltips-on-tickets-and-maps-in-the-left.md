# Diagnose: tooltips on tickets and maps in the left panel do not show reliably

Type: task
Status: resolved

## Question

Hovering a ticket or map in the left tree often shows no tooltip. Reproduce it, find the cause (native title attribute, row re-rendering on refresh, overflow), fix it, and add a test where one is possible.

## Answer

Cause: only a ticket row with a Next-up marker had a title attribute (its reason); every other ticket row and every map row had none, so hovering mostly showed nothing. Not a refresh or overflow issue. Fixed in ac7aa10: ticketTooltip and mapTooltip in packages/desktop/src/shared/tree-tooltips.ts, set as the title of every ticket li (id, full title, status, claimant, blockers, Next-up reason) and of each map head. Unit tests in packages/desktop/test/tree-tooltips.test.ts. Verified with pnpm test, pnpm test:linux, and the Playwright suite natively and on Linux (pnpm test:e2e:linux), all passing. Limit: native tooltips are not in the DOM, so no e2e hover test.
