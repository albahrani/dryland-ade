# Fog records and graduation

Type: task
Status: ready-for-agent
Blocked by: 19

## Question

**What to build:** Fog items are records (open, graduated, dropped with a reason); graduating is one atomic command; out-of-scope items are closed from the start; Mark done appears only with nothing open.

- [ ] Graduate creates the ticket, wires blockers and closes the item atomically
- [ ] Dropped needs a one-line reason
- [ ] Mark done is a plain human confirmation, offered only with no open tickets or fog
- [ ] UI shows fog records
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass
