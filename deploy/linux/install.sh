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
SMTP_HOST=${smtp_host}
SMTP_PORT=465
SMTP_SECURE=true
DAV_HOST=
DAV_PORT=2080
DAV_SECURE=false
HOST=127.0.0.1
PORT=8000
DATA_DIR=${DATA_DIR}
EOF

  chmod 0600 "${ENV_FILE}"
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
  install_service

  log "Done."
  log "Service: systemctl status ${APP_NAME}"
  log "Environment: ${ENV_FILE}"
  log "Loopback URL: http://127.0.0.1:8000"
}

main "$@"
