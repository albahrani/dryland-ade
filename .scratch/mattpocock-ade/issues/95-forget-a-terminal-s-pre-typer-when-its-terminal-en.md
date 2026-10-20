# Forget a terminal's pre-typer when its terminal ends

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-20T11:02:47.462Z","was":""}} -->

## Question

WorkStarter keeps a Pretyper per terminal in a pretypers map (work.ts) and never removes it, so each session leaves one entry behind for the app's lifetime. Remove it when the terminal exits or is closed, with a test. Raised in review of ticket 44.
