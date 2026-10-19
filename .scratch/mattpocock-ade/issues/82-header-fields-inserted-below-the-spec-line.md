# Header fields inserted below the Spec line

Type: task
Status: resolved

## What to build

When a ticket has no `Status:` line, `dryland ticket triage` (and a claim) adds one below the ticket's `Spec:` line instead of under `Type:`. Seen on mattpocock-ade/81 (fixed by hand in 46aa75b):

```
Type: task

Spec: [spec](../spec.md), user stories 55, 56. ...
Status: ready-for-agent
```

Cause: `rewriteHeaderField` in `packages/core/src/local-markdown.ts` scans the header from the title down. It skips blank lines and counts every `Key: value` line as a field, so the `Spec: ...` line, a separate paragraph below a blank line, counts as part of the header. A missing field is then inserted after the last header line found. `rewriteBlockedBy` uses the same insertion, so `dryland ticket block --add` on a ticket without `Blocked by:` lands in the same wrong place.

Fix: the header block ends at the first blank line after it has started. A missing field is inserted right after the known header fields (`Type:`, `Status:` with its Dryland annotation, `Blocked by:`), in that order, not after whatever key-value line comes last. Existing fields keep their place, and line endings are kept per line as today.

## Acceptance criteria

- [x] Triage and claim on a ticket with `Type:`, a blank line and a `Spec:` line, and no `Status:`, add `Status:` directly under `Type:`; the `Spec:` paragraph is untouched
- [x] `ticket block --add` on such a ticket adds `Blocked by:` in the header block, after `Status:` when there is one
- [x] A `Status:` or `Blocked by:` line already present is still rewritten in place, wherever it is
- [x] CRLF and mixed line endings are kept, as the current tests check
- [ ] Tickets created by `dryland ticket create` read the same through `ticket show` before and after the fix

## Answer

Fixed in ed58898 and 1698913. rewriteHeaderField now treats the header block as the run of fields up to the first blank line and adds a missing Status after Type, a missing Blocked by after Status and its annotation. A field already present anywhere is still rewritten in place. Tests in packages/cli/test/ticket-header-placement.test.ts cover triage, claim, block, CRLF and in-place rewrites. Known limit: no test compares ticket show output for created tickets; createTicket is untouched and its existing tests pass. Edge: a Status below a blank line is not seen as the anchor for a new Blocked by.
