@echo off
rem The `dryland` launcher shipped in the install directory (ADR 0004). It runs the bundled CLI with the app's own
rem Electron in node mode, so it needs no system Node and works with the app closed. The installer replaces it on
rem every update.
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\Dryland ADE.exe" "%~dp0dryland.mjs" %*
exit /b %ERRORLEVEL%
