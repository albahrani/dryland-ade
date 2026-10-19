# Route tracker writes through one backend seam

Type: task

## Question

Every write function in claim.ts, ticket-write.ts, ticket-edit.ts and map-write.ts repeats 'githubCheckout(...); if (github !== null) return ...Github...'. Pick the backend once (local markdown, GitHub, later GitLab) behind one interface so ticket 47 adds a backend instead of editing eight functions. Also share the triage-role resolution and the blocker validation that github-write.ts copies from ticket-edit.ts. Raised in review of ticket 46.
