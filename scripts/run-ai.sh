#!/usr/bin/env bash
# Start SafeKeep AI Service (FastAPI + BLIP + CLIP with CUDA acceleration)
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
venv_dir="$project_dir/ai_server/venv"

# Export C header paths for dynamic Triton / PyTorch compilation on Fedora
if [[ -d "/home/akkan/.local/include/python3.14" ]]; then
  export CPATH="/home/akkan/.local/include/python3.14${CPATH:+:$CPATH}"
  export C_INCLUDE_PATH="/home/akkan/.local/include/python3.14${C_INCLUDE_PATH:+:$C_INCLUDE_PATH}"
fi

if [[ -f "$project_dir/ai_server/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$project_dir/ai_server/.env"
  set +a
else
  echo "Notice: ai_server/.env is not present. Defaulting to local configuration."
fi

# Ensure default binding to all interfaces for server mode
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8000}"

cd "$project_dir/ai_server"
echo "Starting SafeKeep AI Server on ${HOST}:${PORT} (with CUDA acceleration)..."
exec "$venv_dir/bin/python" main.py
