#!/usr/bin/env bash
# Start SafeKeep's web application and AI service together with one command.
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_dir="$project_dir/web"
ai_dir="$project_dir/ai_server"
ai_pid=""

cleanup() {
  if [[ -n "$ai_pid" ]] && kill -0 "$ai_pid" 2>/dev/null; then
    echo "Stopping SafeKeep AI server (PID: $ai_pid)..."
    kill "$ai_pid" 2>/dev/null || true
    wait "$ai_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "=========================================================="
echo "  SAFEKEEP: Campus Lost and Found Web Platform (Appwrite) "
echo "  Local AI Server: BLIP + CLIP (GPU Acceleration Enabled) "
echo "=========================================================="

if [[ ! -f "$web_dir/.env.local" ]]; then
  cp "$web_dir/.env.example" "$web_dir/.env.local"
  echo "[+] Created web/.env.local from example template."
fi

if [[ ! -f "$ai_dir/.env" ]]; then
  cp "$ai_dir/.env.example" "$ai_dir/.env"
  echo "[+] Created ai_server/.env from example template."
fi

# Detect local IP address for LAN access
local_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
echo "[*] Local network IP: http://${local_ip}:5173"

# Ensure web dependencies are installed
if [[ ! -d "$web_dir/node_modules" ]]; then
  echo "[*] Installing web dependencies..."
  (cd "$web_dir" && npm install)
fi

# Start FastAPI AI Server in background
echo "[*] Launching SafeKeep AI Server on 0.0.0.0:8000..."
"$project_dir/scripts/run-ai.sh" &
ai_pid=$!

# Start Vite React Frontend
echo "[*] Launching SafeKeep Web Client on 0.0.0.0:5173..."
cd "$web_dir"
exec npm run dev -- --host 0.0.0.0
