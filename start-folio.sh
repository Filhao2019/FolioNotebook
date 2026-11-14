#!/usr/bin/env sh
# Start Folio from source on macOS or Linux (Ubuntu, Omarchy/Arch, others).
# Keep this terminal open while using Folio. Press Ctrl+C to stop it.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install Node.js 24 or later:"
  echo "  macOS:          brew install node"
  echo "  Ubuntu/Debian:  see https://nodejs.org/en/download (NodeSource or nvm)"
  echo "  Omarchy/Arch:   sudo pacman -S nodejs npm"
  exit 1
fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 24 ]; then
  echo "Folio needs Node.js 24 or later (found $(node -v))."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)…"
  if command -v pnpm >/dev/null 2>&1; then pnpm install --prod; else npm install --omit=dev; fi || exit 1
fi
echo "Starting Folio. Open the local address printed below when it is ready."
exec node --env-file-if-exists=.env server/index.js
