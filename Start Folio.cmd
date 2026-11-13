@echo off
setlocal
cd /d "%~dp0"
echo Starting Folio. Open the local address printed by the server when it is ready.
echo Keep this window open while using Folio. Press Ctrl+C to stop it.
where node >nul 2>nul
if not errorlevel 1 (
  node --env-file-if-exists=.env server/index.js
) else if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --env-file-if-exists=.env server/index.js
) else (
  echo Node.js was not found. Install Node.js 24 or later, then run this launcher again.
  pause
  exit /b 1
)
if errorlevel 1 pause
