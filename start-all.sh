#!/usr/bin/env bash
# ShieldForge — Start All Services
# Run: ./start-all.sh
# Stop: ./stop-all.sh (or Ctrl+C)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$LOG_DIR/pids.txt"

mkdir -p "$LOG_DIR"
> "$PID_FILE"  # Clear PID file

log() {
  echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"
}

success() {
  echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓${NC} $*"
}

warn() {
  echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠${NC} $*"
}

error() {
  echo -e "${RED}[$(date '+%H:%M:%S')] ✗${NC} $*"
}

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null 2>&1

# Function to start a service
start_service() {
  local name="$1"
  local dir="$2"
  local cmd="$3"
  local health_url="$4"
  local log_file="$LOG_DIR/$name.log"

  log "Starting $name..."
  cd "$dir"

  # Start in background with PID tracking
  setsid bash -c "$cmd" > "$log_file" 2>&1 &
  local pid=$!
  echo "$pid $name" >> "$PID_FILE"

  # Wait for health check
  local retries=30
  while [ $retries -gt 0 ]; do
    if curl -sf "$health_url" >/dev/null 2>&1; then
      success "$name started (PID: $pid) — $health_url"
      return 0
    fi
    sleep 1
    retries=$((retries - 1))
  done

  error "$name failed to start. Check $log_file"
  tail -20 "$log_file"
  return 1
}

# ──────────────────────────────────────────────
# 1. ML Detection Engine (Port 8000)
# ──────────────────────────────────────────────
start_service "ml-service" \
  "$ROOT_DIR/ML/ml-service" \
  "./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000" \
  "http://localhost:8000/health"

# ──────────────────────────────────────────────
# 2. Victim Application (Port 3001)
# ──────────────────────────────────────────────
start_service "victim-app" \
  "$ROOT_DIR/victim-app" \
  "npm run start -- -H 0.0.0.0" \
  "http://127.0.0.1:3001/comment?q=health"

# ──────────────────────────────────────────────
# 3. Reverse Proxy + WAF (Port 3000)
# ──────────────────────────────────────────────
start_service "proxy" \
  "$ROOT_DIR/proxy/proxy" \
  "npm run start" \
  "http://localhost:3000/"

# ──────────────────────────────────────────────
# 4. Dashboard (Port 3003)
# ──────────────────────────────────────────────
start_service "dashboard" \
  "$ROOT_DIR/dashboard" \
  "npm run start" \
  "http://localhost:3003/"

# ──────────────────────────────────────────────
# 5. LLM Explanation Agent (Port 3002)
# ──────────────────────────────────────────────
start_service "llm-agent" \
  "$ROOT_DIR/llm-agent" \
  "npm run start" \
  "http://localhost:3002/"

# ──────────────────────────────────────────────
# 6. Polling Loop (Background)
# ──────────────────────────────────────────────
log "Starting LLM poller (every 7s)..."
cd "$ROOT_DIR/llm-agent"
setsid bash -c "while true; do curl -s -X POST http://localhost:3002/api/poll; sleep 7; done" > "$LOG_DIR/llm-poller.log" 2>&1 &
poller_pid=$!
echo "$poller_pid llm-poller" >> "$PID_FILE"
success "LLM poller started (PID: $poller_pid)"

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
success "All services started!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Services:"
echo "    🔬 ML Service      → http://localhost:8000"
echo "    🎯 Victim App      → http://localhost:3001"
echo "    🛡️  Proxy (WAF)    → http://localhost:3000"
echo "    📊 Dashboard       → http://localhost:3003"
echo "    🤖 LLM Agent       → http://localhost:3002"
echo "    🔄 LLM Poller      → background (7s interval)"
echo ""
echo "  Proxied Victim URL:"
echo "    http://localhost:3000/t/victim-shop/"
echo ""
echo "  Logs:"
echo "    tail -f $LOG_DIR/*.log"
echo ""
echo "  Quick Tests:"
echo "    # Login (weak cookie finding)"
echo "    curl -i -X POST http://localhost:3000/t/victim-shop/api/login -d 'email=t@t.com&password=t'"
echo ""
echo "    # XSS blocked by WAF"
echo "    curl 'http://localhost:3000/t/victim-shop/comment?q=<script>alert(1)</script>'"
echo ""
echo "    # SQLi blocked by WAF"
echo "    curl 'http://localhost:3000/t/victim-shop/comment?q=union+select+1,2,3'"
echo ""
echo "    # Generate AI summaries"
echo "    curl -X POST http://localhost:3002/api/poll"
echo ""
echo "    # Switch to enforce mode"
echo "    curl -X PATCH http://localhost:3003/api/policies/33333333-3333-4333-8333-333333333333 -H 'Content-Type: application/json' -d '{\"mode\":\"enforce\"}'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Press Ctrl+C to stop all services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Wait for interrupt
trap 'echo ""; log "Shutting down..."; ./stop-all.sh; exit 0' INT TERM
wait