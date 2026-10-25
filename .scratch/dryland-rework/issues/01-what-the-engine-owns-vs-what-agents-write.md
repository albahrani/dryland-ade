# What the engine owns vs. what agents write

Type: grilling
Status: resolved
Blocked by: 03

## Question

Draw the determinism boundary. Which fields, states, transitions and checks are enforced by the workflow engine in code, and which parts remain agent-written prose? Settle what an agent may and may not do to a ticket, map or fog item, and how violations of the rules are prevented or caught. Use the rule inventory from the upstream skills research as the baseline.

## Answer

Decision: the engine is the only writer of structured state; agents supply prose through commands. Engine owns: ticket type, status (open, claimed, resolved), blocking edges (acyclic), claim-before-work, atomic resolve, one resolve per session (research excepted), required sections, map section order, and the computed frontier. Derived: Decisions so far from resolved tickets; fog and out-of-scope items are records; graduating fog is one atomic command (create ticket, wire blockers, remove item). Gates: a HITL ticket resolves only after a human-authored confirmation in the UI. Prose: engine checks shape at write time and rejects (structured fields, length caps with overflow to a link, lint for hedges, filler, long sentences; no paths, line numbers or bare ids); meaning stays with model and human; engine never calls a model. Concurrency: atomic compare-and-set per command within one repo. Edits: anything editable later via a command only; each edit appends a revision (time, author kind human/agent/engine, reason), old text kept; agent amends are marked in the UI. Unslop command: agent proposes a denser rewrite, human accepts from a diff-like view, recorded as agent-authored and human-approved; UX goes to the UX rework fog. Bypass: prevented by sandboxing agent CLIs (new ticket), detect-and-reject as backup; depends on storage. DeltaDB (Zed) is inspiration only (author kind, append-only history, restore); no dependency. Limits: exact caps, lint rules and style guide wording are left to the spec.
