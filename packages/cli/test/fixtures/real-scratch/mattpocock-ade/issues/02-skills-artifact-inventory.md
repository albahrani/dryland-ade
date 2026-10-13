# Matt Pocock skills artifact and workflow inventory

Type: research
Status: resolved
Blocked by:

## Question

From `.agents/skills`, `AGENTS.md`, `docs/agents/*` and `skills-lock.json` (and the upstream skills repo if needed), inventory: every skill, the artifacts it reads/writes and where, the default layouts set by `setup-matt-pocock-skills` (tracker docs, triage labels, domain docs, local-markdown conventions: `Status:`, `Type:`, `Blocked by:`, `## Comments`, `## Answer`), the intended workflow order between skills, and which workflow state is derivable from files + git alone. Write to `.scratch/mattpocock-ade/research/skills-inventory.md`.

## Answer

Full findings: `.scratch/mattpocock-ade/research/skills-inventory.md`.

Gist: inventoried all 34 installed skills (`.agents/skills/<name>/SKILL.md` plus supporting files) against `skills-lock.json`, `AGENTS.md`, and `docs/agents/*`. This repo is configured by `setup-matt-pocock-skills` for the **local-markdown issue tracker**, **default 5-role triage labels** (identity-mapped), and **single-context domain docs** (`GLOSSARY.md` + `docs/adr/`) — the three seed templates it writes (`issue-tracker.md`, `triage-labels.md`, `domain.md`) match this repo's `docs/agents/*.md` exactly. `ask-matt/SKILL.md` is the authoritative workflow-order map: `grill-with-docs` → `to-spec` → `to-tickets` → `implement`/`implement-spec` (driving `tdd` + `code-review`) → `pr` → `retro`, with on-ramps via `triage` (external issues) and `wayfinder` (foggy efforts, handing to `to-spec` once its map clears). For the local tracker, `Status:`/`Type:`/`Blocked by:` lines, `## Comments`/`## Answer` sections, and the map's Decisions-so-far are all file-derivable with no API dependency; claim races and session/process state are explicitly NOT file-derivable, and this repo has zero commits/remote so no git-derived state exists yet either. A 9-file spot-check against the live `mattpocock/skills` GitHub repo found zero drift from the locally installed copies.
