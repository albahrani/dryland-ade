# Storage format and where the truth lives

Type: grilling
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-25T16:31:40.363Z","was":""}} -->
Blocked by: 01, 02, 07, 05

## Question

Decide where tickets, maps, fog, comments and revisions are stored and who holds the truth: is the repo still the source of truth, or does the engine keep its own store? Cover the effect on the local, GitHub and GitLab backends. Baselines: the engine-ownership and lifecycle decisions, the GitHub and GitLab capability research, and the sandbox rule that an agent has no write path to the state store (Contained needs the store outside the mount or read-only).
