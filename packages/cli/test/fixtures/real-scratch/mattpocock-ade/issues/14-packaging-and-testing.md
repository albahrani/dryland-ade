# Packaging, distribution and testing strategy

Type: grilling
Status: resolved
Blocked by: 

## Question

How is the ADE packaged, signed, distributed and updated across Windows/macOS/Linux, how is the ade CLI shim installed, and what is the testing strategy for the rule engine, adapters and ticket backends? Include shutdown-time cleanup limits.



## Answer

Decided and recorded in docs/adr/0004-packaging-distribution-and-testing.md: electron-builder (NSIS/DMG/AppImage+deb, Windows-first); GitHub Releases + build-from-source; unsigned v1; electron-updater with latest/beta channels (auto-update on Windows/AppImage, notify-only on macOS/deb); ade launcher shipped in the install dir (opt-in global PATH); 2s shutdown budget with local-only claim release; Vitest + fixtures + fake CLIs + one Playwright smoke + parallel-claim test. New ticket 18 covers GitHub project preparation.
