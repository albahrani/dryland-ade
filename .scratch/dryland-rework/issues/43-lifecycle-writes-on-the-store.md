# Lifecycle writes on the store

Type: task
Status: ready-for-agent
Blocked by: 42

## Question

**Read first:** ADRs 0011, 0012 and 0015, `GLOSSARY.md`, the Answers of tickets 41 and 42 and the porting list in 41, and the old write code this replaces (`packages/core/src/claim.ts`, `ticket-write.ts`, `ticket-edit.ts`, `worktree.ts`).

**What to build:** the old ticket write commands, working on the store with the behaviour they had (no caps, no new gates), with their desktop actions.

- [ ] `ticket claim`, `release`, `resolve`, `tick`, `triage`, `block` and `comment` append events to the store; a claim names its session id and branch
- [ ] A claim held by a worktree branch and a stale claim behave as today
- [ ] The desktop ticket actions (claim, release, resolve, tick, triage, block, comment) and their confirmations work in a store repo
- [ ] The old tests of these commands are ported to store fixtures per ticket 41's porting list
