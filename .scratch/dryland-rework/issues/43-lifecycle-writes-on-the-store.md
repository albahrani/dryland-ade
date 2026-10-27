# Lifecycle writes on the store

Type: task
Status: resolved
Blocked by: 42

## Question

**Read first:** ADRs 0011, 0012 and 0015, `GLOSSARY.md`, the Answers of tickets 41 and 42 and the porting list in 41, and the old write code this replaces (`packages/core/src/claim.ts`, `ticket-write.ts`, `ticket-edit.ts`, `worktree.ts`).

**What to build:** the old ticket write commands, working on the store with the behaviour they had (no caps, no new gates), with their desktop actions.

- [x] `ticket claim`, `release`, `resolve`, `tick`, `triage`, `block` and `comment` append events to the store; a claim names its session id and branch
- [x] A claim held by a worktree branch and a stale claim behave as today
- [x] The desktop ticket actions (claim, release, resolve, tick, triage, block, comment) and their confirmations work in a store repo
- [x] The old tests of these commands are ported to store fixtures per ticket 41's porting list

## Answer

Built in fcf93ca. The seven commands keep their entry points: each of `claimTicket`, `releaseTicket`, `resolveTicket`, `tickTicket`, `blockTicket`, `commentOnTicket` and `triageTicket` hands over to `store-lifecycle.ts` when the repo has a store, which finds the ticket and checks the old rules (same messages, so the old next actions stay) against the state at the head it appends to; a lost race plans again, so of parallel claims exactly one wins. New events: `ticket.claimed` (branch holder plus the Dryland or Agent CLI session id), `released`, `resolved`, `answer-amended` (`resolve --amend`), `ticked`, `triaged`, `blockers-changed`, `commented`. A claim already held by the same branch writes nothing. The store ticket now carries `answer` and `comments` (cache version 3), so `ticket show`, the ticket tab and the done fold show them. The CLI passes the author (agent inside a session, else human); `--commit` and `--no-commit` are accepted and ignored. The desktop buttons shell out to these commands, so they needed no change; the Playwright config now points `DRYLAND_DATA_DIR` at the run's temp folder so e2e stores no longer land in the real user data dir.

Porting list: `ticket-claim` (branch claim, one parallel winner, linked worktree, release, release of an unclaimed ticket), `ticket-create-resolve` (resolve and unblock, claim released, worktree left alone, refusals, tick nth and parallel ticks, amend, option refusal, unknown type on create) and `ticket-block-comment-triage` are in `ticket-lifecycle-store.test.ts`; `worktree` and `session-index` have twins in `worktree-store.test.ts` and `session-index-store.test.ts`; the paused, stale and done-fold cases left by 42 are in `store-readers.test.ts`; `ticket-actions` has a store twin in `ticket-actions-store.spec.ts` (claim, unblock, resolve, stale release with its confirmation). Dropped as not store behaviour: the auto-commit and `--commit` cases, the unknown-map create case (an effort exists once it has a ticket or map), the `## ` comment refusal and the triage-label vocabulary. The markdown originals stay green until 45.

Tests: `pnpm test` 974 passed, `pnpm test:linux` 980 passed, desktop e2e native 50 passed, `pnpm test:e2e:linux` 49 of 50 passed; the failure is the old markdown "releases a possibly stale claim" case, already known to fail on Linux (ticket 42), and the store twin passes there. Code-review skill not run.

Known limits: `triage` and `block` have no desktop button (none existed). The new-ticket dialog still builds flag-based `ticket create` commands, which a store repo refuses (a later ticket). Each command still replays the whole log. The session index is still written by the CLI after the event, so a failed index write is a warning, not a rollback.
