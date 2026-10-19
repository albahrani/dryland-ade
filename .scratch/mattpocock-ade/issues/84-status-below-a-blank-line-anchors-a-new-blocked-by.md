# Status below a blank line anchors a new Blocked by

Type: task

## Question

Follow-up from mattpocock-ade/82. `rewriteHeaderField` in `packages/core/src/local-markdown.ts` ends the header block at the first blank line. On a hand-edited ticket where `Status:` sits in a later paragraph (`Type:`, blank line, `Status:`), `ticket block --add` ignores that `Status:` and inserts `Blocked by:` under `Type:`, above it. Decide whether such a `Status:` should anchor the insert, and what the block rule is for fields after a blank line. An orphan Dryland annotation with no `Status:` also moves the insert point; cover it too. Neither layout is written by `ticket create` or triage.
