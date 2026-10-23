# Move New terminal into the tab strip and add File > New Terminal

Type: task
Blocked by: 088

## Question

Decided in mattpocock-ade/88. Move the New terminal button out of the top bar into the tab strip as a '+' button. Add File > New Terminal with a shortcut (Ctrl+` unless it clashes). Keep the name 'New terminal' and give it the tooltip: Open a shell in the project's main checkout. Start an agent CLI by hand here. The shell still always starts in the main checkout. Update the e2e tests (smoke, pager, start-work) and the line in docs/manual/README.md.

## Acceptance criteria

- [ ] The top bar no longer holds a New terminal button; the tab strip has a '+' button named New terminal with the tooltip above.
- [ ] File > New Terminal opens a terminal tab, enabled only when a project is open.
- [ ] The e2e tests and docs/manual/README.md match the new place.
