# State remote and sync

Type: task
Status: ready-for-agent
Blocked by: 18, 20

## Question

**What to build:** Choose local-only (default), origin or another remote for the state ref, with consent recorded per remote; sync automatically or manually; claim conflicts resolve first-to-remote.

- [ ] state join <url> without storing the URL in the ref
- [ ] Failed push never blocks a command; settings for auto, manual, off
- [ ] Offline claims provisional; double resolve rejected at sync
- [ ] An attach command stores an attachment in the state store, size-capped, with a warning when the remote is public; ticket 32 uses it for originals
- [ ] The sync tests cover every event kind the earlier tickets added
- [ ] Two-clone test against a local bare remote
