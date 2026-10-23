#!/usr/bin/env bash
# ShieldForge — Stop All Services

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$LOG_DIR/pids.txt"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
success() { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠${NC} $*"; }

# Kill by PID file
if [ -f "$PID_FILE" ]; then
  log "Stopping services from $PID_FILE..."
  while read -r pid name; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && success "Stopped $name (PID: $pid)" || warn "Failed to stop $name (PID: $pid)"
    fi
  done < "$PID_FILE"
  > "$PID_FILE"
fi

# Fallback: kill by port/process name
for port in 3000 3001 3002 3003 8000; do
  pid=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill -9 "$pid" 2>/dev/null && warn "Force-killed process on port $port (PID: $pid)"
  fi
done

# Kill by process name (uvicorn, next)
for proc in "uvicorn" "next-server" "next dev" "next start"; do
  pkill -f "$proc" 2>/dev/null && warn "Killed $proc processes" || true
done

success "All ShieldForge services stopped"