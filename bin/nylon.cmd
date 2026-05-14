@echo off
rem Shim so users can put `<repo>\bin` on PATH and run `nylon` directly
rem without needing `pnpm link`.
node "%~dp0..\agent\dist\index.js" %*
