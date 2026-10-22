# Document Docker and WSL disk growth for the Linux test scripts

Type: task
Status: resolved

## Question

Running pnpm test:linux and test:e2e:linux repeatedly on Windows grew Docker's build cache to 21 GB (996 entries, none active) and left 6.8 GB of WSL crash dumps, filling C:. Add a short note to the Testing on Windows section of AGENTS.md and to the manual, if it covers these scripts: what grows (docker builder prune, %TEMP%\wsl-crashes), how to clear it, and that Docker Desktop's disk image location can be moved to another drive (Settings, Resources, Advanced). First check which of our scripts actually creates build cache, since both only use docker run; if none does, say the cache comes from elsewhere.

## Answer

Done in the commit before this one. AGENTS.md has a new 'Disk space on Windows' section under 'Testing on Windows': the Linux scripts only docker run a stock node image, so they create no build cache (no script or workflow runs docker build; the 21 GB cache seen on the dev machine came from elsewhere); each test run's temp folders live in one dryland-run-* directory that is deleted at the end (mattpocock-ade/111); tests must not crash a process on purpose, because WSL then writes about 680 MB to %TEMP%\wsl-crashes and ulimit does not stop it (mattpocock-ade/109); and the commands to inspect and clear Docker (docker system df, docker builder prune), the Docker Desktop disk image location setting, and compacting docker_data.vhdx. The manual does not cover these scripts, so it is unchanged. Known limit: not tested beyond reading it; the cache's real source was not found.
