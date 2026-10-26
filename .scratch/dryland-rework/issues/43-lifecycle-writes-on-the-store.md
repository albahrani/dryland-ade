# Lifecycle writes on the store

Type: task
Status: ready-for-agent
Blocked by: 42

## Question

**What to build:** the old ticket write commands, working on the store with the behaviour they had (no caps, no new gates), with their desktop actions.

- [ ] `ticket claim`, `release`, `resolve`, `tick`, `triage`, `block` and `comment` append events to the store; a claim names its session id and branch
- [ ] A claim held by a worktree branch and a stale claim behave as today
- [ ] The desktop ticket actions (claim, release, resolve, tick, triage, block, comment) and their confirmations work in a store repo
- [ ] The old tests of these commands are ported to store fixtures per ticket 41's porting list
