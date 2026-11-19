#!/usr/bin/env bash
# Installs web dependencies (if needed) and starts the SafeKeep web app.
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$project_dir/scripts/run-web.sh"
