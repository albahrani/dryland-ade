# Forget a terminal's pre-typer when its terminal ends

Type: task
Status: resolved

## Question

WorkStarter keeps a Pretyper per terminal in a pretypers map (work.ts) and never removes it, so each session leaves one entry behind for the app's lifetime. Remove it when the terminal exits or is closed, with a test. Raised in review of ticket 44.

## Answer

Terminals take an onEnd callback (terminals.ts), called once when the process exits or the terminal is closed via close/closeAll. startWork passes one that cancels the pre-typer and deletes its pretypers entry (commit f793c26). Tests in terminals.test.ts cover onEnd on exit, close and closeAll. Known limit: the pretypers map is private, so no test asserts the entry's removal directly. Linux/Docker run left to CI.
