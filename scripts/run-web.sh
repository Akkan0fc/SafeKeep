#!/usr/bin/env bash
# Starts the SafeKeep React web app.
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir/web"

if [[ ! -d node_modules ]]; then
  npm install
fi

exec npm run dev -- --host 127.0.0.1
