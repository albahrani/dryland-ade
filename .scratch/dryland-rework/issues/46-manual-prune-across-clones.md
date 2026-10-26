# Manual prune across clones

Type: task
Status: ready-for-agent
Blocked by: 24, 38

## Question

**What to build:** the prune ticket 38 left out, because its safety across clones needs the state remote of ticket 24. ADR 0012 leaves the prune protocol to the build.

- [ ] Prune is a manual command only; nothing prunes automatically
- [ ] A prune is safe across clones that share a state remote: a clone that syncs after a prune loses no event and rebuilds the same state
- [ ] The protocol is recorded in an ADR 0012 amendment
