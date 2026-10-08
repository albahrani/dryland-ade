# Matt Pocock skills: artifact and workflow inventory

All 34 skills locked in `skills-lock.json` (`<repo>\skills-lock.json:1-171`) are sourced from GitHub repo `mattpocock/skills` and installed locally under `.agents\skills\<name>\SKILL.md`. This repo currently (`git log`/`git status`, 2026-10-08) has **no commits and no remote** — everything is untracked, so no git-derived state (branches, commits, trailers) exists yet; only the local-markdown tracker in `.scratch/` carries workflow state today. The repo is configured, via `setup-matt-pocock-skills`, for the **local-markdown issue tracker**, the **default 5-role triage label vocabulary** (identity-mapped), and **single-context domain docs** (`GLOSSARY.md` + `docs/adr/`), as recorded in `AGENTS.md` and `docs/agents/*.md`. A 9-file GitHub spot-check (setup-matt-pocock-skills, wayfinder, triage, to-tickets, handoff, research, tdd, grilling, pr) found the installed local copies **byte-identical** to the live `mattpocock/skills` repo content — no drift detected.

## Default layouts from setup-matt-pocock-skills

`setup-matt-pocock-skills` (`.agents\skills\setup-matt-pocock-skills\SKILL.md:1-96`) is a prompt-driven, non-deterministic scaffolding skill (`disable-model-invocation: true`, run manually once). It explores the repo (`git remote -v`, `AGENTS.md`/`CLAUDE.md`, `GLOSSARY.md`/`GLOSSARY-MAP.md`, `docs/adr/`, `docs/agents/`, `.scratch/`, whether `triage` is installed, monorepo signals) then asks three questions in order and writes:

1. **Issue tracker** (Section A, lines 37-46): choice of GitHub (`gh` CLI), GitLab (`glab` CLI), local-markdown (`.scratch/<feature>/`), or "other" (freeform). Writes the choice to `docs/agents/issue-tracker.md` from one of three seed templates in the skill folder: `issue-tracker-github.md`, `issue-tracker-gitlab.md`, `issue-tracker-local.md`. GitHub/GitLab templates carry a "PRs/MRs as a request surface" flag defaulted **off**.
2. **Triage labels** (Section B, lines 48-52): skipped entirely if the `triage` skill isn't installed. Otherwise asks to keep the 5 canonical role strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) or supply overrides; writes `docs/agents/triage-labels.md` from `triage-labels.md`.
3. **Domain docs** (Section C, lines 54-56): defaults to single-context (`GLOSSARY.md` + `docs/adr/` at root) without asking; only asks when monorepo signals are found, offering multi-context (`GLOSSARY-MAP.md` + per-context `GLOSSARY.md`). Writes `docs/agents/domain.md` from `domain.md`.

It then edits `CLAUDE.md` if present, else `AGENTS.md`, else asks which to create (never both) (lines 74-82), inserting/updating an `## Agent skills` block with three sub-sections (`### Issue tracker`, `### Triage labels`, `### Domain docs`) each pointing at the corresponding `docs/agents/*.md` file — exactly what this repo's root `AGENTS.md` contains (`<repo>\AGENTS.md:1-13`).

### The three issue-tracker variants (seed templates in `.agents\skills\setup-matt-pocock-skills\`)

All three define a **"Wayfinding operations"** section consumed by `/wayfinder`, plus "publish to the issue tracker" / "fetch the relevant ticket" conventions consumed by `/to-tickets`, `/to-spec`, `/implement`, `/code-review`, etc.

- **Local markdown** (`issue-tracker-local.md:1-26`, confirmed live at `docs\agents\issue-tracker.md:1-26`):
  - One feature per dir `.scratch/<feature-slug>/`; spec at `.scratch/<feature-slug>/spec.md`; tickets at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, one file per ticket.
  - Triage state as a `Status:` line near the top of each issue file.
  - Comments/history appended under a `## Comments` heading.
  - Wayfinding: **map** = `.scratch/<effort>/map.md` (Notes/Decisions-so-far/Fog body). **Child ticket** = `.scratch/<effort>/issues/NN-<slug>.md` with `Type:` line (`research`/`prototype`/`grilling`/`task`) and `Status:` line (`claimed`/`resolved`). **Blocking** = `Blocked by: NN, NN` line; unblocked when every listed file is `resolved`. **Frontier** = scan for files open+unblocked+unclaimed, first by number wins. **Claim** = set `Status: claimed` and save before work. **Resolve** = append answer under `## Answer`, set `Status: resolved`, append a context pointer to the map's Decisions-so-far.
- **GitHub** (`issue-tracker-github.md:1-27`): uses `gh issue create/view/comment/edit --add-label/close`; sub-issues via `gh issue create --parent` or `--add-sub-issue`; "PRs as a request surface" flag (off by default). Wayfinding: map = single issue labelled `wayfinder:map`; children are GitHub sub-issues; blocking via GitHub's native issue-dependencies API (`issues/<child>/dependencies/blocked_by`); frontier = open children minus those with open blockers/assignee; claim = `gh issue edit --add-assignee @me`; resolve = comment + close + append pointer to map.
- **GitLab** (`issue-tracker-gitlab.md:1-26`): `glab issue`/`glab mr` equivalents ("notes" not "comments", "merge requests" not PRs); blocking via `/blocked_by` quick action (Premium/Ultimate) or a `Blocked by:` body fallback; otherwise same shape as GitHub variant.

### Triage labels (`.agents\skills\setup-matt-pocock-skills\triage-labels.md:1-14`, live at `docs\agents\triage-labels.md:1-14`)

5-row table mapping canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) to this repo's actual label strings — currently identity-mapped (defaults accepted).

### Domain docs (`.agents\skills\setup-matt-pocock-skills\domain.md:1-44`, live at `docs\agents\domain.md:1-44`)

Tells consuming skills to read `GLOSSARY.md` (or `GLOSSARY-MAP.md` + per-context glossaries) and relevant `docs/adr/*` **before exploring**, proceeding silently if absent (files are created lazily by `/domain-modeling`). Shows single-context vs multi-context file-tree layouts. Instructs using the glossary's exact vocabulary and flagging ADR conflicts rather than silently overriding.

## Skill-by-skill artifact inventory

Legend: path column is relative to `<repo>\.agents\skills\<name>\` unless stated otherwise.

| Skill | Reads | Writes | Key conventions | References other skills |
|---|---|---|---|---|
| **ask-matt** | Every other skill's SKILL.md (router; reads before stating what a skill does) — `ask-matt\SKILL.md:9` | Nothing | Describes "main flow" and "on-ramps" (see Workflow section below) — `ask-matt\SKILL.md:1-109` | All 33 other skills, by name, as a map of the whole system |
| **chief-of-staff** | Ambient repo/session state | Nothing fixed; delegates writes to subagents | "Context pointers"; "pit of success"; "no workarounds" rule — `chief-of-staff\SKILL.md:1-33` | None named explicitly; coordinates subagents generically |
| **claude-handoff** | Current conversation | A handoff summary file in OS temp dir (`$TMPDIR`/`/tmp`/`%TEMP%`); launches `claude --bg` with it as prompt — `claude-handoff\SKILL.md:7-9` | "Suggested skills" section in output; redacts secrets | Any skill named in its own "suggested skills" output |
| **code-review** | `git diff`/`git log` vs a user-given fixed point; issue tracker (via tracker doc) for spec source; `CODING_STANDARDS.md`/`CONTRIBUTING.md` — `code-review\SKILL.md:13-37` | Nothing persistent (returns `## Standards` / `## Spec` report to caller) | Two parallel sub-agents; Fowler smell baseline list (12 smells) — `code-review\SKILL.md:39-61` | Invoked by `implement`, `implement-spec` |
| **codebase-design** | N/A (reference/vocabulary skill) | Nothing | Glossary: Module/Interface/Depth/Seam/Adapter/Leverage/Locality — `codebase-design\SKILL.md:1-100`; see also `DEEPENING.md`, `DESIGN-IT-TWICE.md` | Referenced by `tdd`, `improve-codebase-architecture`, `setup-ts-deep-modules` |
| **diagnosing-bugs** | `GLOSSARY.md`, ADRs, env/tooling | Debug scripts/harnesses (throwaway), tagged `[DEBUG-...]` logs (removed at cleanup); regression test | 6-phase loop: feedback loop → reproduce/minimise → hypothesise → instrument → fix+test → cleanup — `diagnosing-bugs\SKILL.md:1-98`; uses `scripts/hitl-loop.template.sh` | None named; feeds `retro`/`improve-codebase-architecture` per `ask-matt` |
| **domain-modeling** | `GLOSSARY.md`, `GLOSSARY-MAP.md`, `docs/adr/`, codebase | `GLOSSARY.md` (lazily created), `docs/adr/NNNN-*.md` (lazily created) | Format refs: `GLOSSARY-FORMAT.md`, `ADR-FORMAT.md`; ADR offered only when hard-to-reverse + surprising + real trade-off — `domain-modeling\SKILL.md:1-66` | Run via `grill-with-docs`, `wayfinder`, `improve-codebase-architecture`, `triage` |
| **git-guardrails-claude-code** | `.claude/settings.json` / `~/.claude/settings.json` | Hook script `.claude/hooks/block-dangerous-git.sh` (project or global) + settings JSON edit | Blocks `git push`, `reset --hard`, `clean -f(d)`, `branch -D`, `checkout .`/`restore .` — `git-guardrails-claude-code\SKILL.md:1-66` | None |
| **grill-me** | N/A | Nothing (stateless) | One-liner: calls Skill tool with "grilling" — `grill-me\SKILL.md:7` | `grilling` |
| **grill-with-docs** | N/A | Via `grilling`+`domain-modeling` | One-liner: calls both skills — `grill-with-docs\SKILL.md:7` | `grilling`, `domain-modeling` |
| **grilling** | User answers only (facts delegated to subagents) | Nothing itself (consumers persist decisions) | "Design tree"/"frontier"/rounds format with ❓/➡️ — `grilling\SKILL.md:1-19` | None directly; is itself referenced by ~6 skills |
| **handoff** | Current conversation | Handoff doc in OS temp dir | Same shape as `claude-handoff` but doesn't auto-launch a session — `handoff\SKILL.md:1-11` | Named in its own "suggested skills" section |
| **implement** | Spec/tickets (fetched from tracker if referenced) | Code; commits to current branch | Calls `tdd` at seams, then `code-review`; runs typecheck/tests — `implement\SKILL.md:1-13` | `tdd`, `code-review` |
| **implement-spec** | Spec + tickets (task graph) from tracker | Integration branch, per-ticket worktrees/branches, optional draft PR; resolves tickets | "Implementer subagents" in background per ticket; merges to integration branch; one `code-review` at end — `implement-spec\SKILL.md:1-33` | `tdd` (per implementer), `code-review` |
| **improve-codebase-architecture** | `git log`, `GLOSSARY.md`, ADRs, codebase | Self-contained HTML report to OS temp dir (`architecture-review-<timestamp>.html`); `GLOSSARY.md`/ADR edits during grilling loop | "Deletion test"; recommendation badges Strong/Worth exploring/Speculative — `improve-codebase-architecture\SKILL.md:1-56`; see `HTML-REPORT.md` | `codebase-design`, `grilling`, `domain-modeling` |
| **loop-me** | `workflows/*.md`, `NOTES.md` in current dir | `workflows/*.md` specs | "Loop"/"workflow"/"trigger"/"checkpoint"/"push right"/"brief" vocabulary — `loop-me\SKILL.md:1-26` | Runs `grilling` discipline internally |
| **migrate-to-shoehorn** | Test files with `as`/`as unknown as` assertions | Edits test files to use `fromPartial`/`fromAny`/`fromExact`; installs `@total-typescript/shoehorn` | Test-code-only; grep pattern `" as [A-Z]"` — `migrate-to-shoehorn\SKILL.md:1-95` | None |
| **pr** | `GLOSSARY.md` for domain language | PR body text (not committed to a file; produced as output) | Template: Summary/Evidence/Merge Danger (Door, Blast Radius) — `pr\SKILL.md:1-14`; credited to humanlayer `show-me` | None (model-invoked whenever writing a PR body) |
| **prototype** | User prompt, surrounding code | Throwaway prototype code/HTML near the module it prototypes; a `prototype/<name>` branch out of main | Branches to `LOGIC.md` (state-machine HTML demo) or `UI.md` (variant switcher); "capture it when done" rule — `prototype\SKILL.md:1-33` | Branches into `LOGIC.md`/`UI.md`; referenced by `wayfinder`, `ask-matt` |
| **research** | Primary sources (docs, source code, APIs) via background agent | Single cited Markdown file "where the repo already keeps such notes" | Background-agent delegation; cite every claim — `research\SKILL.md:1-9` | Feeds `grill-with-docs` per `ask-matt` |
| **retro** | Session logs, `package.json`/CI scripts, `CLAUDE.md`/`AGENTS.md`, `CODING_STANDARDS.md` | Nothing itself; proposes changes to env (presented to user) | 6 candidate-improvement categories (Navigation, Automated checks, Coding standards, Global AGENTS.md, Tool economy, No-ops, Information access) — `retro\SKILL.md:1-45` | `writing-for-agents` (style guide) |
| **scaffold-exercises** | A "plan" (section/exercise names) | `exercises/<section>/<NN.MM-name>/{problem,solution,explainer}/readme.md` (+`main.ts`) | Dash-case naming; lint via `pnpm ai-hero-cli internal lint`; `git mv` for renames — `scaffold-exercises\SKILL.md:1-89` | None |
| **setup-matt-pocock-skills** | `git remote -v`, `AGENTS.md`/`CLAUDE.md`, `GLOSSARY.md`/`GLOSSARY-MAP.md`, `docs/adr/`, `docs/agents/`, `.scratch/`, installed skills | `AGENTS.md`/`CLAUDE.md` `## Agent skills` block; `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/domain.md` | See "Default layouts" section above — `setup-matt-pocock-skills\SKILL.md:1-96` | Gatekeeps `to-tickets`, `triage`, `to-spec`, `wayfinder`, `code-review`, `implement-spec` (all tell user to run this if config missing) |
| **setup-pre-commit** | `package-lock.json`/`pnpm-lock.yaml`/`yarn.lock`/`bun.lockb` | `.husky/pre-commit`, `.lintstagedrc`, `.prettierrc` (if missing); edits `package.json` | Husky v9+, lint-staged + Prettier + typecheck + test — `setup-pre-commit\SKILL.md:1-74` | None |
| **setup-ts-deep-modules** | `pnpm-lock.yaml` etc., existing `.dependency-cruiser.*`, `src/packages` or `packages` | `.dependency-cruiser.cjs`, `lint:boundaries` script, example package (`index.ts`/`lib/impl.ts`/`tests/`), `<packages-root>/README.md`, pointer in `CLAUDE.md`/`AGENTS.md` | 4 enforced rules: entry-point boundary, intra-package freedom, tests-through-entrypoints, no cycles — `setup-ts-deep-modules\SKILL.md:1-85` | `codebase-design` (vocabulary) |
| **tdd** | `GLOSSARY.md`, ADRs | Tests + implementation code (vertical slices) | Seams confirmed with user first; anti-patterns: implementation-coupled, tautological, horizontal-slicing — `tdd\SKILL.md:1-29`; see `tests.md`, `mocking.md` | `codebase-design` (when seam shape is in question) |
| **teach** | `MISSION.md`, `RESOURCES.md`, `./learning-records/*.md`, `./assets/*` in current dir | `MISSION.md`, `./reference/*.html`, `RESOURCES.md`, `./learning-records/000N-*.md`, `./lessons/000N-*.html`, `./assets/*`, `NOTES.md` | Fluency vs storage strength; ZPD; format refs `GLOSSARY-FORMAT.md`, `MISSION-FORMAT.md`, `RESOURCES-FORMAT.md`, `LEARNING-RECORD-FORMAT.md` — `teach\SKILL.md:1-70` | None |
| **to-questionnaire** | Conversation context | `to-questionnaire-<slug>.md` in current dir | "Grill the send, not the subject"; questionnaire template — `to-questionnaire\SKILL.md:1-56` | Feeds `grill-with-docs`/`to-spec` per `ask-matt` |
| **to-spec** | Conversation context, codebase, `GLOSSARY.md`, ADRs | Spec published to issue tracker (`ready-for-agent` label applied) | Spec template: Problem/Solution/User Stories/Implementation Decisions/Testing Decisions/Out of Scope/Further Notes — `to-spec\SKILL.md:1-66` | Gated by `setup-matt-pocock-skills` config |
| **to-tickets** | Plan/spec/conversation, codebase | Tickets published to tracker: local files `.scratch/<feature-slug>/issues/<NN>-<slug>.md` OR tracker issues with native blocking | "Tracer bullet" vertical slices; expand-contract for "wide refactors"; local-ticket-template has `Status:`/`Blocked by:` lines — `to-tickets\SKILL.md:1-100` | Gated by `setup-matt-pocock-skills` config |
| **triage** | Issue tracker, `.out-of-scope/*.md`, codebase | Tracker labels/comments/closures; `.out-of-scope/*.md` (for rejected enhancements) | 2 category + 5 state roles; AI disclaimer on every comment; reference docs `AGENT-BRIEF.md`, `OUT-OF-SCOPE.md` — `triage\SKILL.md:1-90` | `grilling`, `domain-modeling` (step 4, "if needed") |
| **wait-what** | `GLOSSARY.md`/`GLOSSARY-MAP.md` | Nothing (re-pitches in conversation) | ASD-STE100 Simplified Technical English — `wait-what\SKILL.md:1-7` | None |
| **wayfinder** | Issue tracker (map + tickets); tracker doc's "Wayfinding operations" section | Map (issue/file labelled `wayfinder:map`), child tickets with `Type:`/`Status:`/`Blocked by:` or native equivalents, research branches `research/<name>` | See full Workflow section below — `wayfinder\SKILL.md:1-110` | `grilling`, `domain-modeling`, `research`, `prototype` (per ticket type) |
| **wizard** | `.env`/`.env.example`, README, `docker-compose*`, `.github/workflows/*` | Bash wizard script (from `template.sh`), optionally committed to `scripts/` | Stage-by-stage HITL script; `ask_secret`/`write_env`/`set_secret` helpers — `wizard\SKILL.md:1-61` | None |
| **writing-beats** | Raw-material markdown file, article file in progress | Appends one beat at a time to article file | "Grounding" (prerequisite vs introduced concepts); re-reads file before every write — `writing-beats\SKILL.md:1-59` | None |
| **writing-for-agents** | N/A (reference skill) | Nothing | "Context pointers", "two loads" (context/cognitive), information hierarchy, leading words, pruning — `writing-for-agents\SKILL.md:1-56`; see `SKILL-MECHANICS.md` | Referenced by `retro` |
| **writing-fragments** | Existing fragments file | Appends fragments (heterogeneous, `---`-separated) to a markdown file | H1 working title on first write; "leading word" concept — `writing-fragments\SKILL.md:1-56` | None |
| **writing-shape** | Raw-material pile file (read-only), article file in progress | Appends paragraphs/blocks to a separate article file | "Grounding"; 2-3 candidate openings; format-choice arguments — `writing-shape\SKILL.md:1-55` | None |

## Workflow order between skills

`ask-matt\SKILL.md:1-109` is the authoritative map of intended sequencing (itself a router, reading every other SKILL.md before answering). Its structure:

**Precondition** (line 107): `/setup-matt-pocock-skills` must run before any other engineering flow — it supplies the tracker/labels/domain config several skills explicitly check for ("If not, tell the user to run `/setup-matt-pocock-skills`", e.g. `to-tickets\SKILL.md:9`, `to-spec\SKILL.md:7`, `triage\SKILL.md:25`, `implement-spec\SKILL.md:7`, `wayfinder\SKILL.md:21`, `code-review\SKILL.md:15`).

**Main flow** (`ask-matt\SKILL.md:11-33`, "idea → ship"):
1. `grill-with-docs` (or `grill-me` with no working directory) sharpens the idea, building `GLOSSARY.md`/ADRs.
2. Branch: a question needing a runnable answer detours through `handoff` → `prototype` → `handoff` back.
3. Branch: multi-session build → `to-spec` → `to-tickets` (tracer-bullet tickets with blocking edges) → either `implement` per ticket (clearing context between) or `implement-spec` for the whole spec at once (task-graph, parallel implementer subagents, one integration branch). Single-session → `implement` directly.
   - Both `implement` and `implement-spec` drive `tdd` (red-green slices) and close with `code-review` (two-axis Standards+Spec review).
   - `pr` shapes the PR body when work goes up as a PR (model-invoked automatically).
4. `retro` closes the loop after a build, proposing environment/coding-standard/tooling changes, not code changes.

**On-ramps** (merge onto the main flow):
- Bugs/requests piling up → `triage` (produces agent-ready issues) → picked up later by `implement`. (Triage is only for externally-arriving issues, never for `to-tickets` output, which is already agent-ready — `ask-matt\SKILL.md:37`.)
- Something's broken → `diagnosing-bugs` (6-phase loop) → `retro` in the same session afterward; if the finding is "no good seam exists," that's a job for `improve-codebase-architecture`.
- Huge/foggy effort (greenfield, big feature, > one session) → `wayfinder` charts a map of decision tickets, resolves them one at a time (never more than one per session except research tickets), then **hands off to `to-spec`** when the map clears (merges onto the main flow at step 3 above) — `ask-matt\SKILL.md:47`.

**Codebase health** (not feature work): `improve-codebase-architecture` surfaces "deepening opportunities"; picking one generates an idea fed into `grill-with-docs` (main flow step 1); it is the survey, `codebase-design` is "the bench you design the chosen one on" — `ask-matt\SKILL.md:51-53`.

**Vocabulary layer** (runs beneath other skills, not a sequence step): `domain-modeling` (domain language, invoked by `grill-with-docs`, `wayfinder`, `triage`, `improve-codebase-architecture`) and `codebase-design` (deep-module vocabulary, invoked by `tdd`, `improve-codebase-architecture`, `setup-ts-deep-modules`).

**Standalone** (off the main flow): `grill-me`, `grilling` (the shared primitive `grill-me`/`grill-with-docs`/`triage`/`wayfinder`/`improve-codebase-architecture` all call), `prototype`, `research` (feeds into `grill-with-docs`), `to-questionnaire` (feeds `grill-with-docs`/`to-spec`), `wizard`, `wait-what`, `teach`, `writing-for-agents`.

**`wayfinder` internal ticket-type dispatch** (`wayfinder\SKILL.md:40-45`): `research` tickets resolved by a subagent calling `research`; `prototype` tickets resolved via `prototype`; `grilling` tickets (default) always call both `grilling` and `domain-modeling`; `task` tickets are manual work (AFK or HITL), not resolved via another skill.

**Phase boundaries** (`ask-matt\SKILL.md:93-105`, detailed in `PHASE-BOUNDARIES.md`): at the boundary between phases, choose Continue / `/clear` / `handoff` / Subagent / `/compact` (the default).

## File+git-derivable workflow state vs not

**Derivable from files alone (local-markdown tracker, this repo's configured tracker):**
- Per-ticket triage/wayfinding state: the `Status:` line (`claimed`/`resolved` for wayfinder children, or a triage role like `ready-for-agent` for `to-tickets` output) — `issue-tracker-local.md:9,25`; `to-tickets\SKILL.md` local-ticket-template `Status:` field.
- Ticket type: the `Type:` line (`research`/`prototype`/`grilling`/`task`) — `issue-tracker-local.md:24`.
- Blocking edges: the `Blocked by: NN, NN` line — `issue-tracker-local.md:25`; `to-tickets\SKILL.md` "Blocked by" field.
- Frontier computation: scan `.scratch/<effort>/issues/` for files that are open + unblocked (`Blocked by` targets all resolved) + unclaimed (`Status:` not `claimed`) — purely a file scan, no DB/API — `issue-tracker-local.md:26`.
- Map state: `## Decisions so far`, `## Not yet specified`, `## Out of scope`, `## Notes`, `## Destination` sections of `map.md` — `wayfinder\SKILL.md:30-45`.
- Resolution record: the `## Answer` heading appended on resolve — `issue-tracker-local.md:26`.
- Conversation/comment history: appended under `## Comments` — `issue-tracker-local.md:13`.
- Domain-doc state: presence/absence and content of `GLOSSARY.md`, `GLOSSARY-MAP.md`, `docs/adr/*.md` — directly readable files.
- Configured tracker/labels/domain layout: `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/domain.md`, and the `## Agent skills` block in `AGENTS.md`/`CLAUDE.md` — directly readable files.
- Skill inventory and provenance: `skills-lock.json` (name, source repo, skillPath, computedHash) and the installed `.agents/skills/<name>/` tree — directly readable.
- Prototype/research provenance (once git history exists): branch names `prototype/<name>` / `research/<name>` and context pointers left in tickets — `prototype\SKILL.md:33`, `wayfinder\SKILL.md:40`.
- Worktree/branch naming convention per this repo's map notes: `<effort>/<NN>-<slug>` naming or a commit trailer as fallback — `.scratch\mattpocock-ade\map.md` Notes section (this repo's own ADE design decision, not a skill default).
- **Currently in THIS repo**: there are no commits yet (`git log` returns "No commits yet on main", `git status` shows everything untracked) — so today, *zero* git-derived state exists; all derivable state above comes from the `.scratch/` files only.

**NOT derivable from files/git alone:**
- GitHub/GitLab tracker state when that variant is configured instead of local-markdown: label application, assignee-as-claim, native issue-dependency "blocked_by" links, sub-issue relationships, and comment history all require live `gh`/`glab` API calls, not local files — `issue-tracker-github.md:1-27`, `issue-tracker-gitlab.md:1-26`. (This repo uses local-markdown, so this gap is latent, not currently active.)
- Session/process state: which agent CLI sessions are currently running, which ticket a running session is working on, PTY/terminal output — this is runtime state no skill persists to disk (per this repo's own ADE map notes on "Session observation design" being "not yet specified").
- Claim races / concurrent-session coordination: the local-markdown tracker's claim mechanism (`Status: claimed`) is a plain file edit with no locking — two concurrent sessions could race on claiming the same ticket; nothing in the skill files addresses this beyond "set Status: claimed and save before any work" (`issue-tracker-local.md:26`), which is advisory, not enforced.
- External validations referenced by triage (e.g., "is the bug reproducible," "does the diff do what it claims") are live-verified during a session, not stored as structured state afterward beyond prose in the ticket body/comments.
- `teach` workspace state (MISSION.md, learning-records) and `loop-me` workflow specs are file-derivable in principle but track user-specific/offline-life state with no connection to this repo's git history.
- Cross-referencing "which commit/PR resolved which ticket" is only as good as whatever context pointer a human/agent manually typed into the ticket or map (`Decisions so far` entries); there's no automatic commit-trailer-to-ticket linkage enforced by any skill.

## Upstream (mattpocock/skills on GitHub) spot-check

Fetched via `github-mcp-server-get_file_contents` from `mattpocock/skills` (default branch) and diffed against local installed copies:

| Skill | Upstream path | Result |
|---|---|---|
| setup-matt-pocock-skills | `skills/engineering/setup-matt-pocock-skills/SKILL.md` | Identical to local `.agents\skills\setup-matt-pocock-skills\SKILL.md` |
| wayfinder | `skills/engineering/wayfinder/SKILL.md` | Identical to local `.agents\skills\wayfinder\SKILL.md` |
| triage | `skills/engineering/triage/SKILL.md` | Identical to local `.agents\skills\triage\SKILL.md` |
| to-tickets | `skills/engineering/to-tickets/SKILL.md` | Identical to local `.agents\skills\to-tickets\SKILL.md` |
| handoff | `skills/productivity/handoff/SKILL.md` | Identical to local `.agents\skills\handoff\SKILL.md` |
| research | `skills/engineering/research/SKILL.md` | Identical to local `.agents\skills\research\SKILL.md` |
| tdd (spot-check) | `skills/engineering/tdd/SKILL.md` | Identical to local `.agents\skills\tdd\SKILL.md` |
| grilling (spot-check) | `skills/productivity/grilling/SKILL.md` | Identical to local `.agents\skills\grilling\SKILL.md` |
| pr (spot-check) | `skills/engineering/pr/SKILL.md` | Identical to local `.agents\skills\pr\SKILL.md` |

No drift found in any of the 9 sampled files (full-text comparison, not just hash). `skills-lock.json`'s `computedHash` values are opaque hashes (not plain SHA-256 of raw content in an obviously checkable format) so they weren't independently recomputed; content-level comparison was used instead and is conclusive for these 9. The remaining 25 skills were not fetched from GitHub (per the task's "spot-check 2-3 more at random" scope); the local files are the authoritative installed copies regardless, per the task brief.

## Gaps and uncertainties

- Only 9 of 34 skills were cross-checked against upstream GitHub; the other 25 are taken on faith from `skills-lock.json` provenance and local file content alone. No drift is expected given the 9/9 match rate, but this is not proven for the remainder.
- This repo has no git commits and no remote yet, so all claims about "git-derivable state" (branch naming, commit trailers, worktree linkage) are necessarily aspirational/forward-looking — drawn from this repo's own ADE map notes (`.scratch\mattpocock-ade\map.md`) rather than observed behavior, since no commits exist to observe.
- The local-markdown tracker's concurrency story (claim races, concurrent-session edits to the same ticket/map file) is explicitly unaddressed in the skill docs beyond advisory wording; `wayfinder\SKILL.md:110` ("expect other sessions to be editing the tracker concurrently") acknowledges the scenario but does not specify a locking or conflict-resolution mechanism.
- `skills-lock.json`'s `computedHash` algorithm/purpose (versioning vs. integrity-check vs. update-detection) was not documented anywhere found; its exact semantics are inferred, not confirmed from a spec file.
- `docs/agents/issue-tracker.md` in this repo is confirmed to be the **local-markdown** variant (verified by direct content match to `issue-tracker-local.md`), consistent with the repo having no git remote configured yet.
