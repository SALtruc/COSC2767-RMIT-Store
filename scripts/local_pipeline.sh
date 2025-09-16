#!/usr/bin/env bash
set -euo pipefail

# =========================
# Config mặc định (có thể override qua ENV)
# =========================
CLIENT_PORT="${CLIENT_PORT:-8080}"
API_PORT="${API_PORT:-3000}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_DB_NAME="${MONGO_DB_NAME:-rmit_ecommerce}"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@rmit.edu.vn}"
ADMIN_PASS="${ADMIN_PASS:-ChangeMe123!}"
BASE_API_URL_DEFAULT="api"  # khớp env server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$REPO_ROOT/.logs"
PID_SERVER="$REPO_ROOT/.pid_server"
PID_CLIENT="$REPO_ROOT/.pid_client"
COMPOSE_FILE="$REPO_ROOT/docker-compose.local.yml"

mkdir -p "$LOG_DIR"

compose() { if docker compose version >/dev/null 2>&1; then docker compose "$@"; else docker-compose "$@"; fi; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing $1"; exit 1; }; }
rand_hex() { node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"; }

is_wsl()      { uname -r 2>/dev/null | grep -qi "microsoft"; }
is_windows()  { uname -s 2>/dev/null | grep -qiE 'mingw|msys|cygwin'; }
is_linux()    { uname -s 2>/dev/null | grep -qi 'linux'; }
is_ci()       { [[ -n "${JENKINS_URL:-}" || -n "${CI:-}" ]]; }

os_hint() {
  if is_windows; then echo "Windows (Git Bash)"; elif is_wsl; then echo "WSL"; elif is_linux; then echo "Linux"; else echo "$(uname -a)"; fi
}

wait_for_docker() {
  # chờ Docker daemon sẵn sàng tối đa 120s
  local sec=0
  until docker info >/dev/null 2>&1; do
    ((sec++))
    if (( sec > 120 )); then
      echo "⏱️  Hết thời gian chờ Docker daemon lên."
      return 1
    fi
    sleep 1
  done
  return 0
}

start_docker() {
  echo "==> Thử khởi động Docker daemon..."
  if is_windows || is_wsl; then
    # Thử mở Docker Desktop (nếu có)
    if command -v cmd.exe >/dev/null 2>&1; then
      cmd.exe /c start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe" || true
    fi
  elif is_linux; then
    if command -v systemctl >/dev/null 2>&1; then
      sudo systemctl start docker || true
    else
      sudo service docker start || true
    fi
  fi
  wait_for_docker
}

check_prereqs() {
  echo "==> OS: $(os_hint)"
  need_cmd node; need_cmd npm; need_cmd docker
  docker --help | grep -q 'compose' || need_cmd docker-compose

  # Node major >= 18
  local NODE_MAJ
  NODE_MAJ="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if (( NODE_MAJ < 18 )); then
    echo "❌ Node >= 18 required (found v$NODE_MAJ)"
    exit 1
  fi

  # Docker daemon
  if ! docker info >/dev/null 2>&1; then
    echo "⚠️  Docker daemon chưa chạy."
    if is_windows || is_wsl; then
      echo "  → Mở Docker Desktop (Start Menu) hoặc dùng: scripts/local_pipeline.sh start-docker"
    elif is_linux; then
      echo "  → start bằng: sudo systemctl start docker  (hoặc sudo service docker start)"
    fi
    # Tự thử start nếu người dùng cho phép
    if [[ "${AUTO_START_DOCKER:-0}" == "1" ]]; then
      start_docker || { echo "❌ Không thể tự khởi động Docker."; exit 1; }
    else
      exit 1
    fi
  fi

  # Docker Compose plugin
  if ! (docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null 2>&1); then
    echo "❌ Docker Compose chưa có. Trên Windows: bật trong Docker Desktop Settings → Resources → Enable Docker Compose V2."
    exit 1
  fi

  echo "✅ Prereqs OK — Node $(node -v), npm $(npm -v), Docker $(docker -v)"
}

ensure_compose_file() {
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    cat > "$COMPOSE_FILE" <<'YAML'
version: "3.9"
services:
  mongo:
    image: mongo:6
    container_name: rmit-mongo-local
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongo_data_local:/data/db
volumes:
  mongo_data_local:
YAML
  fi
}

install_deps() {
  echo "==> Installing dependencies..."
  if [[ -f "$REPO_ROOT/package.json" ]]; then (cd "$REPO_ROOT" && npm install); fi
  [[ -d "$REPO_ROOT/client" && -f "$REPO_ROOT/client/package.json" ]] && (cd "$REPO_ROOT/client" && npm install) || true
  [[ -d "$REPO_ROOT/server" && -f "$REPO_ROOT/server/package.json" ]] && (cd "$REPO_ROOT/server" && npm install) || true
}

ensure_envs() {
  echo "==> Ensuring .env files..."
  # SERVER
  if [[ -d "$REPO_ROOT/server" ]]; then
    [[ -f "$REPO_ROOT/server/.env" ]] || cp "$REPO_ROOT/server/.env.example" "$REPO_ROOT/server/.env" 2>/dev/null || touch "$REPO_ROOT/server/.env"
    grep -q '^PORT='       "$REPO_ROOT/server/.env" || echo "PORT=${API_PORT}" >> "$REPO_ROOT/server/.env"
    # MONGO_URI: dùng localhost thay 0.0.0.0 khi connect local
    if grep -q '^MONGO_URI=' "$REPO_ROOT/server/.env"; then
      sed -i.bak -E "s|^MONGO_URI=mongodb://0\.0\.0\.0:${MONGO_PORT}/.*$|MONGO_URI=mongodb://localhost:${MONGO_PORT}/${MONGO_DB_NAME}|g" "$REPO_ROOT/server/.env"
    else
      echo "MONGO_URI=mongodb://localhost:${MONGO_PORT}/${MONGO_DB_NAME}" >> "$REPO_ROOT/server/.env"
    fi
    grep -q '^JWT_SECRET=' "$REPO_ROOT/server/.env" || echo "JWT_SECRET=$(rand_hex)" >> "$REPO_ROOT/server/.env"
    grep -q '^CLIENT_URL=' "$REPO_ROOT/server/.env" || echo "CLIENT_URL=http://localhost:${CLIENT_PORT}" >> "$REPO_ROOT/server/.env"
    grep -q '^BASE_API_URL=' "$REPO_ROOT/server/.env" || echo "BASE_API_URL=${BASE_API_URL_DEFAULT}" >> "$REPO_ROOT/server/.env"
  fi
  # CLIENT
  if [[ -d "$REPO_ROOT/client" ]]; then
    [[ -f "$REPO_ROOT/client/.env" ]] || cp "$REPO_ROOT/client/.env.example" "$REPO_ROOT/client/.env" 2>/dev/null || touch "$REPO_ROOT/client/.env"
    if grep -q '^API_URL=' "$REPO_ROOT/client/.env"; then
      sed -i.bak -E "s|^API_URL=.*$|API_URL=http://localhost:${API_PORT}/${BASE_API_URL_DEFAULT}|g" "$REPO_ROOT/client/.env"
    else
      echo "API_URL=http://localhost:${API_PORT}/${BASE_API_URL_DEFAULT}" >> "$REPO_ROOT/client/.env"
    fi
  fi
}

read_base_api_url() {
  if [[ -f "$REPO_ROOT/server/.env" ]]; then
    local v
    v="$(grep -E '^BASE_API_URL=' "$REPO_ROOT/server/.env" | tail -n1 | cut -d'=' -f2- || true)"
    [[ -n "${v:-}" ]] && echo "$v" || echo "$BASE_API_URL_DEFAULT"
  else
    echo "$BASE_API_URL_DEFAULT"
  fi
}

mongo_up() {
  echo "==> Up Mongo (Docker)"
  ensure_compose_file
  compose -f "$COMPOSE_FILE" up -d mongo
}

seed_data() {
  if [[ -d "$REPO_ROOT/server" ]]; then
    echo "==> Seeding database (admin + sample data nếu script hỗ trợ)"
    set +e
    npm --prefix "$REPO_ROOT/server" run seed:db "$ADMIN_EMAIL" "$ADMIN_PASS"
    set -e
  fi
}

kill_process_using_port() {
  local port="$1"
  
  if is_linux || is_wsl; then
    pid=$(lsof -t -i:"$port" || true)
    if [[ -n "$pid" ]]; then
      echo "Found process using port $port with PID $pid. Killing process..."
      kill -9 "$pid"
    else
      echo "No process found using port $port."
    fi
  elif is_windows; then
    echo "Heree"
    pid=$(powershell -Command "Get-NetTCPConnection -LocalPort $port | Select-Object -ExpandProperty OwningProcess")
    if [[ -n "$pid" ]]; then
      echo "Found process using port $port with PID $pid. Killing process..."
      taskkill /PID "$pid" /F
    else
      echo "No process found using port $port."
    fi
  else
    echo "Unsupported OS for killing process on port $port"
  fi
}

start_server() {
  if [[ -d "$REPO_ROOT/server" ]]; then
    echo "==> Starting server..."
    
    # Kiểm tra và kill tiến trình sử dụng cổng API_PORT
    # kill_process_using_port "$API_PORT"
    
    if (cd "$REPO_ROOT/server" && npm run | grep -qE '^  dev'); then
      (cd "$REPO_ROOT/server" && nohup npm run dev >"$LOG_DIR/server.log" 2>&1 & echo $! > "$PID_SERVER")
    elif (cd "$REPO_ROOT/server" && npm run | grep -qE '^  start'); then
      (cd "$REPO_ROOT/server" && nohup npm run start >"$LOG_DIR/server.log" 2>&1 & echo $! > "$PID_SERVER")
    else
      echo "WARN: server thiếu script dev/start"
    fi
  fi
}

start_client() {
  if [[ -d "$REPO_ROOT/client" ]]; then
    echo "==> Starting client..."
    
    # Kiểm tra và kill tiến trình sử dụng cổng CLIENT_PORT
    # kill_process_using_port "$CLIENT_PORT"
    
    if (cd "$REPO_ROOT/client" && npm run | grep -qE '^  dev'); then
      (cd "$REPO_ROOT/client" && nohup npm run dev -- --host --port "${CLIENT_PORT}" >"$LOG_DIR/client.log" 2>&1 & echo $! > "$PID_CLIENT")
    elif (cd "$REPO_ROOT/client" && npm run | grep -qE '^  start'); then
      (cd "$REPO_ROOT/client" && nohup npm run start >"$LOG_DIR/client.log" 2>&1 & echo $! > "$PID_CLIENT")
    else
      echo "WARN: client thiếu script dev/start"
    fi
  fi
}

login_and_get_token() {
  local login_url="http://localhost:${API_PORT}/api/auth/login"  # The login API endpoint
  local user_email="admin1@rmit.edu.vn"                      # Replace with actual email
  local user_pass="ChangeMe123!"                             # Replace with actual password

  echo "==> Logging in to get JWT token..."

  # Send POST request with credentials
  # response=$(curl -v -s -X POST "$login_url" -H "Content-Type: application/json" \
  #   -d "{\"email\":\"$user_email\",\"password\":\"$user_pass\"}")

  response=$(curl -X POST "http://localhost:3000/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email": "admin@rmit.edu.vn", "password": "ChangeMe123!"}')

  # Extract JWT token from the response
  JWT_TOKEN=$(echo "$response" | grep -oP '"token":"\K[^"]+')

  # Check if the token is empty or null
  if [[ -z "$JWT_TOKEN" || "$JWT_TOKEN" == "null" ]]; then
    echo "❌ Failed to retrieve JWT token"
    exit 1
  else
    echo "✅ JWT token received"
  fi
}


wait_ready() {
  local base_api; base_api="$(read_base_api_url)"
  echo "==> Waiting ready (API:${API_PORT}/${base_api}, WEB:${CLIENT_PORT})"
  for i in {1..60}; do
    API_OK=0; WEB_OK=0

    curl -sf "http://localhost:${CLIENT_PORT}" >/dev/null 2>&1 && WEB_OK=1 && echo "1"|| true
    curl -sf -H "Authorization: $JWT_TOKEN"  "http://localhost:${API_PORT}/${base_api}/product" && API_OK=1 && echo "2" || true
    [[ $API_OK -eq 1 && $WEB_OK -eq 1 ]] && { echo "Ready ✅"; return 0; }
    sleep 1
  done
  echo "Timeout đợi services lên"; return 1
}

smoke() {
  local base_api; base_api="$(read_base_api_url)"
  echo "==> Smoke checks"
  curl -sf "http://localhost:${CLIENT_PORT}" >/dev/null && echo "WEB: OK" || { echo "WEB: FAIL"; return 1; }
  if curl -sf -H "Authorization: $JWT_TOKEN"  "http://localhost:${API_PORT}/${base_api}/product" >/dev/null; then
    echo "API /${base_api}/products: OK"
  else
    curl -sf "http://localhost:${API_PORT}/${base_api}" >/dev/null && echo "API /${base_api}: OK" || echo "API: WARN"
  fi
  echo "==> Smoke done"
}

down() {
  echo "==> Stop local processes"
  [[ -f "$PID_CLIENT" ]] && { kill "$(cat "$PID_CLIENT")" 2>/dev/null || true; rm -f "$PID_CLIENT"; }
  [[ -f "$PID_SERVER" ]] && { kill "$(cat "$PID_SERVER")" 2>/dev/null || true; rm -f "$PID_SERVER"; }
  echo "==> Down Mongo (Docker) + volumes"
  compose -f "$COMPOSE_FILE" down -v || true
  echo "==> Done"
}

### >>> Playwright helpers
ensure_playwright() {
  echo "==> Ensure Playwright"
  if ! node -e "require.resolve('@playwright/test')" >/dev/null 2>&1; then
    (cd "$REPO_ROOT" && npm i -D @playwright/test)
  fi
  npx playwright install --with-deps
}

wait_web_ready() {
  echo "==> Waiting WEB ready at http://localhost:${CLIENT_PORT}"
  for i in {1..90}; do
    if curl -sf "http://localhost:${CLIENT_PORT}" >/dev/null 2>&1; then
      echo "WEB Ready ✅"
      return 0
    fi
    sleep 1
  done
  echo "❌ Timeout đợi FE"
  return 1
}

wait_api_ready_simple() {
  local base_api; base_api="$(read_base_api_url)"
  echo "==> Waiting API ready at http://localhost:${API_PORT}/${base_api}"
  for i in {1..90}; do
    if curl -sf "http://localhost:${API_PORT}/${base_api}" >/dev/null 2>&1; then
      echo "API Ready ✅"
      return 0
    fi
    sleep 1
  done
  echo "❌ Timeout đợi API"
  return 1
}

run_e2e_all() {
  echo "==> Run Playwright (ALL)"
  export BASE_URL="http://localhost:${CLIENT_PORT}"
  # READ_ONLY_GUARD=1 sẽ do case 'e2e-live' set
  local cfg="$REPO_ROOT/tests/playwright.config.ts"
  (cd "$REPO_ROOT" && npx playwright test -c "$cfg")
}

run_e2e_smoke() {
  echo "==> Run Playwright (SMOKE)"
  export BASE_URL="http://localhost:${CLIENT_PORT}"
  local cfg="$REPO_ROOT/tests/playwright.config.ts"
  (cd "$REPO_ROOT" && npx playwright test -c "$cfg" tests/playwright/smoke-auth-orders.spec.ts)
}

logs() {
  echo "==> Tail logs (last 60 lines)"
  [[ -f "$LOG_DIR/server.log" ]] && { echo "--- server.log ---"; tail -n 60 "$LOG_DIR/server.log"; } || echo "(no server.log)"
  [[ -f "$LOG_DIR/client.log" ]] && { echo "--- client.log ---"; tail -n 60 "$LOG_DIR/client.log"; } || echo "(no client.log)"
}

status() {
  echo "==> Status"
  ps -p "$(cat "$PID_SERVER" 2>/dev/null || echo 0)" >/dev/null 2>&1 && echo "server: RUNNING (PID $(cat "$PID_SERVER"))" || echo "server: STOPPED"
  ps -p "$(cat "$PID_CLIENT" 2>/dev/null || echo 0)" >/dev/null 2>&1 && echo "client: RUNNING (PID $(cat "$PID_CLIENT"))" || echo "client: STOPPED"
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | (grep rmit-mongo-local || true)
}

usage() {
  cat <<USAGE
Usage: $(basename "$0") <command>

Commands:
  verify   Kiểm tra môi trường: Node/npm, Docker daemon, Compose (Windows/Linux/WSL friendly)
  start-docker  Thử khởi động Docker daemon (Windows: Docker Desktop; Linux: systemctl/service)
  up       Install deps → up Mongo → ensure .env (PORT,MONGO_URI,JWT_SECRET,CLIENT_URL,BASE_API_URL | client: API_URL)
           → seed → start server/client → wait
  smoke    Kiểm tra nhanh web/API
  ci       up → smoke → down   (dùng cho Jenkins/CI)
  down     Dừng server/client + docker compose down -v
  logs     Xem log ngắn
  status   Trạng thái tiến trình & container
  help     In hướng dẫn

Env overrides:
  CLIENT_PORT ($CLIENT_PORT), API_PORT ($API_PORT), MONGO_PORT ($MONGO_PORT), MONGO_DB_NAME ($MONGO_DB_NAME)
  ADMIN_EMAIL ($ADMIN_EMAIL), ADMIN_PASS ($ADMIN_PASS)
  AUTO_START_DOCKER=1  (cho phép script tự thử start Docker)
USAGE
}

cmd="${1:-help}"
case "$cmd" in
  verify)
    check_prereqs
    echo "✅ Môi trường sẵn sàng. (Bạn có thể chạy: $(basename "$0") up)"
    ;;

  start-docker)
    start_docker && echo "✅ Docker daemon OK" || { echo "❌ Không khởi động được Docker"; exit 1; }
    ;;

  up)
    check_prereqs
    mongo_up
    install_deps
    ensure_envs
    seed_data
    start_server
    start_client
    login_and_get_token
    wait_ready
    status
    smoke
    echo "Open: http://localhost:${CLIENT_PORT}"
    ;;

  e2e-fe)
    # FE-only: test mock, không cần BE/DB
    install_deps
    ensure_playwright
    start_client
    wait_web_ready
    run_e2e_all
    ;;

  e2e-live)
    # FE + BE + Mongo: test live, KHÔNG ghi DB (read-only guard)
    check_prereqs
    mongo_up
    install_deps
    ensure_envs
    seed_data
    start_server
    start_client
    wait_api_ready_simple
    wait_web_ready
    ensure_playwright
    export READ_ONLY_GUARD=1
    run_e2e_all
    ;;

  e2e-live-smoke)
    # Live + read-only nhưng chỉ chạy smoke spec
    check_prereqs
    mongo_up
    install_deps
    ensure_envs
    seed_data
    start_server
    start_client
    wait_api_ready_simple
    wait_web_ready
    ensure_playwright
    export READ_ONLY_GUARD=1
    run_e2e_smoke
    ;;


  smoke)  smoke ;;
  ci)
    trap 'down' EXIT
    check_prereqs
    mongo_up
    install_deps
    ensure_envs
    seed_data
    start_server
    start_client
    login_and_get_token
    wait_ready
    smoke
    ;;

  down)   down ;;
  logs)   logs ;;
  status) status ;;
  help|*) usage ;;

 

esac
