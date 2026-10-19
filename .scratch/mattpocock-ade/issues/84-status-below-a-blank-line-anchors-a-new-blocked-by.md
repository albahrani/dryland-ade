# Status below a blank line anchors a new Blocked by

Type: task
Status: resolved

## Question

Follow-up from mattpocock-ade/82. `rewriteHeaderField` in `packages/core/src/local-markdown.ts` ends the header block at the first blank line. On a hand-edited ticket where `Status:` sits in a later paragraph (`Type:`, blank line, `Status:`), `ticket block --add` ignores that `Status:` and inserts `Blocked by:` under `Type:`, above it. Decide whether such a `Status:` should anchor the insert, and what the block rule is for fields after a blank line. An orphan Dryland annotation with no `Status:` also moves the insert point; cover it too. Neither layout is written by `ticket create` or triage.

## Answer

Decided and built in f4d65af. A Status: line anchors a new Blocked by wherever it sits, including in a later paragraph, and so do the annotation lines directly under it. An annotation with no Status above it anchors nothing, so Blocked by goes under Type. Status itself is still inserted under Type. Tests in packages/cli/test/ticket-header-placement.test.ts. Limit: only the first Status line anchors.
