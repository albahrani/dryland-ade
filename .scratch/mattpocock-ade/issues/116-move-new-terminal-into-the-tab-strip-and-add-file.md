# Move New terminal into the tab strip and add File > New Terminal

Type: task
Status: resolved
Blocked by: 088

## Question

Decided in mattpocock-ade/88. Move the New terminal button out of the top bar into the tab strip as a '+' button. Add File > New Terminal with a shortcut (Ctrl+` unless it clashes). Keep the name 'New terminal' and give it the tooltip: Open a shell in the project's main checkout. Start an agent CLI by hand here. The shell still always starts in the main checkout. Update the e2e tests (smoke, pager, start-work) and the line in docs/manual/README.md.

## Acceptance criteria

- [x] The top bar no longer holds a New terminal button; the tab strip has a '+' button named New terminal with the tooltip above.
- [x] File > New Terminal opens a terminal tab, enabled only when a project is open.
- [x] The e2e tests and docs/manual/README.md match the new place.

## Answer

Removed the top-bar button; the tab strip (always shown) ends in a '+' button named New terminal with the agreed tooltip, disabled without a project. Added File > New Terminal (Ctrl+`, enabled only with a project) via a new-terminal menu command. Updated smoke e2e (menu item, tooltip, disabled state) and docs/manual/README.md; pager and start-work selectors still resolve by name. Commits: 83c7bef plus a review follow-up (the + sits outside the tablist; DialogCommand type). Known limits: the Ctrl+` accelerator itself is not pressed in e2e; start-work 'links a CLI started by hand' and 26 session-hook unit tests fail on unmodified HEAD too; the Linux Docker run was not done.
