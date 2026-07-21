#!/usr/bin/env bash
set -euo pipefail

APP_NAME="bnix-webmail"
APP_USER="bnix-webmail"
APP_ROOT="/opt/${APP_NAME}"
SRC_DIR="${APP_ROOT}/src"
DATA_DIR="${APP_ROOT}/data"
VENV_DIR="${APP_ROOT}/venv"
ENV_FILE="/etc/${APP_NAME}.env"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
ADMIN_CREDENTIALS_FILE="/root/${APP_NAME}-admin.txt"
CADDY_FRAGMENT_FILE="/etc/caddy/${APP_NAME}.conf"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"

log() {
  printf '\n[%s] %s\n' "${APP_NAME}" "$*"
}

die() {
  printf '\n[%s] ERROR: %s\n' "${APP_NAME}" "$*" >&2
  exit 1
}

generate_secret() {
  python3 -c "import secrets; print(secrets.token_urlsafe(32))"
}

prompt_default() {
  local label="$1"
  local default_value="$2"
  local value="${3:-}"

  if [ -n "${value}" ]; then
    printf '%s' "${value}"
    return
  fi

  if [ -t 0 ]; then
    read -r -p "${label} [${default_value}]: " value
    value="$(printf '%s' "${value:-${default_value}}" | xargs)"
  else
    value="${default_value}"
  fi

  printf '%s' "${value}"
}

prompt_optional() {
  local label="$1"
  local value="${2:-}"

  if [ -n "${value}" ]; then
    printf '%s' "${value}"
    return
  fi

  if [ -t 0 ]; then
    read -r -p "${label}: " value
    value="$(printf '%s' "${value}" | xargs)"
  fi

  printf '%s' "${value}"
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "Run this installer as root: sudo bash deploy/linux/install.sh"
  fi
}

require_supported_os() {
  if [ ! -r /etc/os-release ]; then
    die "Cannot detect OS. Supported: Ubuntu 24.04, Debian 12, Debian 13."
  fi

  # shellcheck disable=SC1091
  . /etc/os-release

  case "${ID:-}:${VERSION_ID:-}" in
    ubuntu:24.04|debian:12|debian:13)
      log "Detected supported OS: ${PRETTY_NAME:-${ID} ${VERSION_ID}}"
      ;;
    *)
      die "Unsupported OS: ${PRETTY_NAME:-unknown}. Supported: Ubuntu 24.04, Debian 12, Debian 13."
      ;;
  esac
}

install_packages() {
  log "Installing system packages"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    ca-certificates \
    curl \
    rsync
}

create_user() {
  if ! getent group "${APP_USER}" >/dev/null 2>&1; then
    log "Creating system group: ${APP_USER}"
    groupadd --system "${APP_USER}"
  fi

  if id "${APP_USER}" >/dev/null 2>&1; then
    log "System user already exists: ${APP_USER}"
    return
  fi

  log "Creating system user: ${APP_USER}"
  useradd --system --gid "${APP_USER}" --home-dir "${APP_ROOT}" --shell /usr/sbin/nologin "${APP_USER}"
}

copy_source() {
  log "Copying source to ${SRC_DIR}"
  install -d -m 0755 "${APP_ROOT}" "${SRC_DIR}" "${DATA_DIR}"
  rsync -a --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'venv' \
    --exclude '.venv' \
    --exclude '__pycache__' \
    "${SOURCE_DIR}/" "${SRC_DIR}/"
  chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}"
  # Fix .git ownership so bnix-webmail user can git pull
  if [ -d "${SRC_DIR}/.git" ]; then
    chown -R "${APP_USER}:${APP_USER}" "${SRC_DIR}/.git"
  fi
}

prepare_env() {
  if [ -f "${ENV_FILE}" ]; then
    log "Keeping existing environment file: ${ENV_FILE}"
    return
  fi

  log "Creating environment file: ${ENV_FILE}"
  local auth_secret
  local imap_host
  local smtp_host

  auth_secret="${AUTH_SECRET:-$(generate_secret)}"
  imap_host="$(prompt_optional "IMAP host (e.g. mail.example.com)" "${IMAP_HOST:-}")"
  smtp_host="$(prompt_optional "SMTP host (e.g. mail.example.com)" "${SMTP_HOST:-}")"

  cat > "${ENV_FILE}" <<EOF
AUTH_SECRET=${auth_secret}
IMAP_HOST=${imap_host}
IMAP_PORT=993
IMAP_SECURE=true
# Set IMAP_SECURE=false when the IMAP server only speaks plain IMAP on port 143.
SMTP_HOST=${smtp_host}
SMTP_PORT=465
SMTP_SECURE=true
ENABLE_CADDY_AUTOMATION=true
CADDY_ALIASES_PATH=${CADDY_FRAGMENT_FILE}
DAV_HOST=
DAV_PORT=2080
DAV_SECURE=false
HOST=127.0.0.1
PORT=8000
DATA_DIR=${DATA_DIR}
EOF

  chmod 0600 "${ENV_FILE}"
}

provision_admin() {
  log "Provisioning initial admin account if needed"
  local admin_db="${DATA_DIR}/db/admin.db"
  local admin_user="${ADMIN_USERNAME:-admin}"
  local admin_password="${ADMIN_PASSWORD:-$(generate_secret)}"
  local admin_status

  install -d -m 0750 "${DATA_DIR}/db"

  admin_status="$("${VENV_DIR}/bin/python" - "${admin_db}" "${admin_user}" "${admin_password}" <<'PY'
import datetime
import hashlib
import sqlite3
import sys

db_path, username, password = sys.argv[1:4]
now = datetime.datetime.utcnow().isoformat()
with sqlite3.connect(db_path) as db:
    db.execute(
        """CREATE TABLE IF NOT EXISTS admin_users (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            username   TEXT    UNIQUE NOT NULL,
            password   TEXT    NOT NULL,
            created_at TEXT    NOT NULL,
            updated_at TEXT    NOT NULL
        )"""
    )
    if db.execute("SELECT COUNT(*) FROM admin_users").fetchone()[0] == 0:
        db.execute(
            "INSERT INTO admin_users (username, password, created_at, updated_at) VALUES (?,?,?,?)",
            (username, hashlib.sha256(password.encode()).hexdigest(), now, now),
        )
        db.commit()
        print("created")
    else:
        print("exists")
PY
)"

  if [ "${admin_status}" = "created" ]; then
    cat > "${ADMIN_CREDENTIALS_FILE}" <<EOF
BNIX Webmail initial admin
URL: /admin
Username: ${admin_user}
Password: ${admin_password}
EOF
    chmod 0600 "${ADMIN_CREDENTIALS_FILE}"
    log "Initial admin credentials written to ${ADMIN_CREDENTIALS_FILE}"
  fi

  chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}"
}

setup_caddy_fragment() {
  if [ ! -d /etc/caddy ]; then
    log "Caddy directory not found; skipping Caddy fragment setup"
    return
  fi

  log "Preparing Caddy fragment: ${CADDY_FRAGMENT_FILE}"
  touch "${CADDY_FRAGMENT_FILE}"
  chown "${APP_USER}:${APP_USER}" "${CADDY_FRAGMENT_FILE}"
  chmod 0644 "${CADDY_FRAGMENT_FILE}"

  if [ -f /etc/caddy/Caddyfile ] && ! grep -Eq '^[[:space:]]*import[[:space:]]+/etc/caddy/\\*\\.conf' /etc/caddy/Caddyfile; then
    printf '\nimport /etc/caddy/*.conf\n' >> /etc/caddy/Caddyfile
  fi
}

setup_python() {
  log "Setting up Python virtual environment"
  python3 -m venv "${VENV_DIR}"
  "${VENV_DIR}/bin/pip" install --upgrade pip
  "${VENV_DIR}/bin/pip" install -r "${SRC_DIR}/backend/requirements.txt"
}

install_service() {
  log "Installing systemd service"
  install -m 0644 "${SRC_DIR}/deploy/linux/${APP_NAME}.service" "${SERVICE_FILE}"
  systemctl daemon-reload
  systemctl enable "${APP_NAME}"
  systemctl restart "${APP_NAME}"
}

main() {
  require_root
  require_supported_os
  install_packages
  create_user
  copy_source
  prepare_env
  setup_python
  provision_admin
  setup_caddy_fragment
  install_service

  log "Done."
  log "Service: systemctl status ${APP_NAME}"
  log "Environment: ${ENV_FILE}"
  log "Loopback URL: http://127.0.0.1:8000"
}

main "$@"
