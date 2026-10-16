# A claim is recorded as a Dryland annotation under the `Status:` line

ADR 0001 and the spec require a claim to record its holder (branch or session id) and a timestamp, while ADR 0008 keeps the local-markdown format unchanged from the default skills. The default skills know only `Status: claimed`, which says nothing about who holds it. ADR 0003 allows an ADE-owned annotation if it is delimited so skills ignore it, is written through `dryland`, and is optional for every feature, and asks that each type be its own decision. This is that decision.

`dryland ticket claim` sets `Status: claimed` and adds one line directly under it in the ticket header:

```
<!-- dryland: {"claim":{"holder":"<session or branch>","at":"<ISO timestamp>","was":"<previous Status value>"}} -->
```

Amended by ADR 0010: `holder` is always a branch, the branch of the working directory `dryland ticket claim` runs in (for work Dryland starts, the ticket's worktree branch), even inside a Dryland session. Claims written earlier may still name a session id.

`was` is the `Status:` value before the claim, such as a triage role. `ticket release` restores it, so claim then release leaves the file as it was. Claiming a ticket by hand (`Status: claimed` alone) stays valid: the claimant is simply unknown, and release removes the `Status:` line because the previous value is not known.

## Consequences

- Skills and humans see an ordinary `Status: claimed`; the comment is invisible in rendered Markdown and ignored by parsers that do not know it.
- Only the header block is read for a claim, so annotations in prose are never mistaken for one.
- A `dryland` write touches only the `Status:` line and this annotation line; line endings and everything else are preserved.
