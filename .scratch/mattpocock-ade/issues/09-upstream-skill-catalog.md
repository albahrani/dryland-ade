# Upstream skill catalog and workflow routing

Type: research
Status: resolved
Blocked by:

## Question

Survey ALL skills in https://github.com/mattpocock/skills (current upstream, incl. `to-spec`, `to-tickets`, `triage`, `implement*`, `pr`, `retro`, `wayfinder`, any newer ones not in our local `skills-lock.json`) and https://www.aihero.dev/skills (and linked pages). For each: purpose, when it is invoked, the artifacts it reads/writes, which skills it hands off to, and how the user invokes it (slash command, args). Derive: (1) the complete workflow graph (main flow and on-ramps) and which skills a deterministic next-step rule engine should recommend vs leave user-initiated; (2) which skills in upstream are missing from the local install; (3) anything on aihero.dev that differs from or extends the repo (e.g. recommended order, new skills, naming). Build on `.scratch/mattpocock-ade/research/skills-inventory.md`, don't repeat it. Write to `.scratch/mattpocock-ade/research/skills-catalog.md` with source links, flagging anything unverified.

## Answer

Findings: `.scratch/mattpocock-ade/research/skills-catalog.md`.

Gist: `skills-lock.json` actually locks **38** skills (prior inventory said 34 — stale, now corrected here), and this is a complete, exact 1:1 mirror of everything in `mattpocock/skills` upstream today — **no upstream skills are missing locally, and no local skills are extras**. aihero.dev describes the same skill set (confirmed renames `to-prd`→`to-spec`, `to-issues`→`to-tickets`, `/review`→`code-review` are historical, not live divergences) and is current through its "v1.3" changelog entry (Oct 5, 2026); its six-category hub taxonomy (Getting Started/Main Flow/Shaping/Engineering/Productivity/Reference) differs in *naming* from both the GitHub folder layout and `ask-matt`'s main-flow/on-ramp model, but the actual category-page bodies 404'd, so skill-to-category assignment there is flagged **Unverified**. The workflow graph (main flow, on-ramps, vocabulary layer, handoff edges, standalone utilities) is restated as explicit edges. For next-step routing: only **6 of 38** skills have a clean, close-to-mechanical artifact-state trigger a deterministic rule engine could fire on confidently (`setup-matt-pocock-skills`, `triage`, `to-tickets`, `implement`/`implement-spec`, `pr`, `code-review` as a sub-call); a further ~6 are partially checkable but need judgment layered on top; the remaining ~26 are irreducibly user-initiated/judgment-based (routers, utilities, and subjective-moment skills like `retro`, `wayfinder`, `improve-codebase-architecture`, the `writing-*` family).
