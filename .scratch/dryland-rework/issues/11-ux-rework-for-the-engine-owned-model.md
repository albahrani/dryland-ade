# UX rework for the engine-owned model

Type: grilling
Status: resolved

## Question

Settle the UX the new model needs: title and fog-item shape within the caps, Description structure, what each screen shows (ticket, analysis log with struck retractions, revisions, map with fog records), and the unslop command's diff-and-accept view. Builds on tickets 02, 04 and 06. Exact caps and entry schema land in the spec.

## Answer

Decision: engine rejects over-cap text with the limit stated, never truncates. Titles name the decision (noun phrase, ~60 chars); fog items are one sentence (~140). Description has three named sections, Problem, Cause, Plan, optional while open, free prose inside, one 1200-char cap; resolve needs Problem and Plan, plus Cause for bugs. Ticket screen: title, status, type, solution summary (once resolved), Description; Analysis log collapsed with a count, retractions struck and collapsed, corrections link their targets; History toggle shows revisions with author kind, time, reason; reopened badge persists until a human dismisses it. Map screen order: Destination and Notes; frontier; blocked and claimed; fog records (open, graduated with ticket link, dropped with reason); out-of-scope collapsed; Decisions so far derived (title plus first sentence of the summary). Mark done appears only with no open tickets or fog and is a plain human confirmation with no summary text; this amends ticket 02, which required a one-liner, since nothing downstream reads it. Unslop (human run): side-by-side word-level diff, char count vs cap, three ticks (clear, dense, nothing cut), Accept disabled until all ticked, Reject discards; agent or workflow runs skip the screen and show an agent-authored mark in History. Human editing: inline editor with live counter for Report, Description, Notes; optional one-line reason per save, required when amending a resolved summary; no free-form Analysis log editing, humans use the same typed entry form as agents. Suggest button: where a human writes a one-liner by hand (resolve by hand, amend summary, reopen or edit reasons), it runs a read-only agent prompt over the ticket text and puts a draft in the field within the cap; the human edits or accepts, and saving counts as human-authored with no agent-suggested tracking. Limits: exact caps, entry schema, visual design left to the spec.
