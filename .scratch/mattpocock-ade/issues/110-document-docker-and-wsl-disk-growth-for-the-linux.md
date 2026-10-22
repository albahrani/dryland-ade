# Document Docker and WSL disk growth for the Linux test scripts

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-22T10:11:00.302Z","was":"ready-for-agent"}} -->

## Question

Running pnpm test:linux and test:e2e:linux repeatedly on Windows grew Docker's build cache to 21 GB (996 entries, none active) and left 6.8 GB of WSL crash dumps, filling C:. Add a short note to the Testing on Windows section of AGENTS.md and to the manual, if it covers these scripts: what grows (docker builder prune, %TEMP%\wsl-crashes), how to clear it, and that Docker Desktop's disk image location can be moved to another drive (Settings, Resources, Advanced). First check which of our scripts actually creates build cache, since both only use docker run; if none does, say the cache comes from elsewhere.
