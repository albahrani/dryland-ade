# State remote and sync

Type: task
Status: ready-for-agent
Blocked by: 18, 20

## Question

**What to build:** Choose local-only (default), origin or another remote for the state ref, with consent recorded per remote; sync automatically or manually; claim conflicts resolve first-to-remote.

- [ ] state join <url> without storing the URL in the ref
- [ ] Failed push never blocks a command; settings for auto, manual, off
- [ ] Offline claims provisional; double resolve rejected at sync
- [ ] Attachments stored size-capped; warning when the remote is public
- [ ] Two-clone test against a local bare remote
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass
