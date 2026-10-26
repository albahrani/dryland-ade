# Human gates and inline editing

Type: task
Status: ready-for-agent
Blocked by: 18, 19

## Question

**What to build:** A HITL ticket resolves only after a human confirmation in the UI; humans edit Report, Description and Notes inline with live counters and optional reasons. The HITL flag is set at creation here; ADR 0011 names the field.

- [ ] `ticket create` can mark a ticket HITL, and the ticket shows the flag
- [ ] The engine tells the UI (a human, in process) from a CLI call under a session id (an agent); the gate holds against that agent, and ticket 28's token makes it hold against a hostile one
- [ ] Agent resolve of a HITL ticket is rejected until the UI confirmation
- [ ] Inline editors with live char counter; reason required only when amending a resolved summary
- [ ] No free-form Analysis log editing; humans use the typed entry form
