# Map: Destination, Notes, derived Decisions so far

Type: task
Status: ready-for-agent
Blocked by: 16

## Question

**What to build:** map show and the map screen with Destination, Notes, frontier, blocked and claimed, collapsed out-of-scope and derived Decisions so far (title plus first summary sentence).

- [ ] A map is a record in the store with a create command; ticket 14 only derives map names from tickets, and specs stay files
- [ ] `map show`, `map frontier` and the map screen run on the store, and the next-step rule engine reads maps from it
- [ ] The out-of-scope section shows empty until ticket 20 adds its records
- [ ] Destination edits human-only; Notes by command; both revisioned
- [ ] Decisions so far derived from resolved tickets
- [ ] Map status charting or done
- [ ] Map screen in the specified section order
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass
