# Diagnose Electron crashing in the Linux e2e container and leaving 680 MB dumps

Type: task
Status: resolved

## Question

Every pnpm test:e2e:linux run on Windows leaves a crash dump of the container's Electron (electron 44.7.1, /work/node_modules/.pnpm/electron_44.7.1/...) in %TEMP%\wsl-crashes, about 680 MB each. Ten accumulated between 2026-10-20 and 2026-10-22 (6.8 GB) and, with 21 GB of Docker build cache, filled C: to 56 MB free; that made installed-launcher.test.ts fail with ENOSPC while implementing mattpocock-ade/94. Find out which process crashes and when (during a test, at teardown, or when the container is stopped), using scripts/test-e2e-linux.mjs: Electron runs as root with ELECTRON_DISABLE_SANDBOX=1 under a hand-started Xvfb, and the container has the default 64 MB /dev/shm. Suspects: /dev/shm too small (try --shm-size or --disable-dev-shm-usage), teardown killing Electron mid-write, missing GPU flags. Fix it so a passing run leaves no dump, or record why it cannot be avoided and make the script say where the dumps go and that they can be deleted.

## Answer

Done in the commit before this one. Cause: the e2e test 'asks natively when the window does not answer the quit request' (start-work.spec.ts) called webContents.forcefullyCrashRenderer(). Under WSL the kernel's piped core handler (|/wsl-capture-crash) writes the renderer's whole memory to %TEMP%\wsl-crashes, about 680 MB per run; it happens during that one test (timestamps of the dump and the test lines matched), not at teardown, and with a passing run. Electron, the sandbox flag, /dev/shm and Xvfb were not at fault. docker run --ulimit core=0 did not help: ulimit -c reads 0 in the container, yet the dump is still written, so the handler ignores the limit. Fix: the test now makes the renderer unresponsive with an infinite loop (executeJavaScript('for (;;) {}')), which is closer to 'does not answer' than a crash; the native dialog is asked the same way. Verified: that test and the full test:e2e:linux run (46 passed) leave no dump, and the test passes natively on Windows. Known limit: any future test that crashes a process on purpose will bring the dumps back under WSL.
