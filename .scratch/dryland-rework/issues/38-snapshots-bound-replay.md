# Snapshots bound replay

Type: task
Status: ready-for-agent
Blocked by: 45

## Question

**What to build:** periodic snapshots so that writes and cache rebuilds stop reading every event. Ticket 14 replays all events on each write and rebuild, which will not scale as the tickets after 45 add event kinds. The cadence is set here, as ADR 0012 leaves it to the build. Manual prune moved to ticket 46.

- [ ] A snapshot bounds replay; replay from a snapshot gives the same state as a full replay
- [ ] Writes and cache rebuilds no longer read every event
- [ ] Deleting the cache or a snapshot rebuilds identical state
