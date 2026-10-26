# Acyclic blocking

Type: task
Status: ready-for-agent
Blocked by: 15

## Question

**What to build:** blocking edges can no longer form a cycle, so the frontier that ticket 41 computes always exists.

- [ ] `ticket block` rejects an edge that closes a cycle and names the cycle; `ticket create --blocked-by` cannot make one
- [ ] The desktop block action shows the rejection
- [ ] The frontier still lists open, unblocked, unclaimed tickets, lowest number first
