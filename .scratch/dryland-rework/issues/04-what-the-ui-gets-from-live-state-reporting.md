# What the UI gets from live state reporting

Type: research
Status: resolved

## Question

Audit the live event pipeline: the event schema, who sends events, who consumes them in the desktop app, and what each consumer would lose without them. Separate what non-UI parts (hooks, session status, rule engine, claims) need from what only the UI shows. Read-only code audit; record findings with file references.

## Answer

Live events carry only session state (hook-fed) and a ticket.changed refresh nudge; no CLI write, claim or ticket path needs them. Only the desktop main process depends on them (rule engine waiting rank, session index lastState); the events panel, badges, waiting counts and instant forge refresh are UI-only. Audit with file references: .scratch/dryland-rework/research/live-state-reporting-audit.md.
