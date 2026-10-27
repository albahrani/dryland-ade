# Snapshots bound replay

Type: task
Status: resolved
Blocked by: 45

## Question

**What to build:** periodic snapshots so that writes and cache rebuilds stop reading every event. Ticket 14 replays all events on each write and rebuild, which will not scale as the tickets after 45 add event kinds. The cadence is set here, as ADR 0012 leaves it to the build. Manual prune moved to ticket 46.

- [x] A snapshot bounds replay; replay from a snapshot gives the same state as a full replay
- [x] Writes and cache rebuilds no longer read every event
- [x] Deleting the cache or a snapshot rebuilds identical state

## Answer

Snapshots built in 7bada54. A write that finds 100 events past the latest snapshot (or none) adds `snapshots/<N>.json` in the same commit as its event; `DRYLAND_SNAPSHOT_EVERY` overrides the cadence for tests. Writes and cache rebuilds read the newest valid snapshot (right schema and state shape, consistent number) plus only the events after it; a missing, corrupt or outdated snapshot falls back to an older one or a full replay with identical state. Events are never removed. Tests at the CLI seam prove covered events are never read (they are corrupted in the tree) and that dropping or corrupting snapshots, or the cache, gives identical state. ADR 0012 records the cadence. Known limits: `ls-tree` still lists every path (blob reads are bounded, the listing is not); a snapshot is trusted by its header, not re-derived; sequence numbers assume one writer lineage, so ticket 24 (sync) must revisit snapshots when logs merge.
