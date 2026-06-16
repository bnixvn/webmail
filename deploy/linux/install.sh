#!/usr/bin/env bash
set -euo pipefail

APP_NAME="bnix-webmail"
APP_USER="bnix-webmail"
APP_ROOT="/opt/${APP_NAME}"
SRC_DIR="${APP_ROOT}/src"
RUNTIME_DIR="${APP_ROOT}/runtime"
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
  node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))'
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
    build-essential \
    ca-certificates \
    curl \
    gnupg \
    rsync

  local node_major
  node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"

  if [ "${node_major}" -lt 20 ]; then
    log "Installing Node.js 22 LTS"
    curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
    bash /tmp/nodesource_setup.sh
    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
    rm -f /tmp/nodesource_setup.sh
  elif ! command -v npm >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y npm
  fi

  node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
  if [ "${node_major}" -lt 20 ]; then
    die "Node.js 20+ is required. Installed: $(node -v)"
  fi
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
  install -d -m 0755 "${APP_ROOT}" "${SRC_DIR}"
  rsync -a --delete \
    --exclude '.git' \
    --exclude '.next' \
    --exclude 'node_modules' \
    --exclude 'tsconfig.tsbuildinfo' \
    "${SOURCE_DIR}/" "${SRC_DIR}/"
}

prepare_env() {
  if [ -f "${ENV_FILE}" ]; then
    log "Keeping existing environment file: ${ENV_FILE}"
    return
  fi

  log "Creating environment file: ${ENV_FILE}"
  if [ -f "${SOURCE_DIR}/.env.production" ]; then
    cp "${SOURCE_DIR}/.env.production" "${ENV_FILE}"
  elif [ -f "${SOURCE_DIR}/.env.local" ]; then
    cp "${SOURCE_DIR}/.env.local" "${ENV_FILE}"
  else
    local app_port
    local app_name
    local max_attachment_mb
    local auth_secret

    app_port="$(prompt_default "Local webmail port" "3000" "${PORT:-}")"
    app_name="$(prompt_default "Webmail display name" "BNIX WEBMAIL" "${NEXT_PUBLIC_WEBMAIL_NAME:-}")"
    max_attachment_mb="$(prompt_default "Max attachment size in MB" "10" "${NEXT_PUBLIC_MAX_ATTACHMENT_MB:-}")"
    auth_secret="${AUTH_SECRET:-$(generate_secret)}"

    cat > "${ENV_FILE}" <<EOF
AUTH_SECRET=${auth_secret}
MAIL_HOST=
IMAP_HOST=
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
NEXT_PUBLIC_WEBMAIL_NAME="${app_name}"
NEXT_PUBLIC_MAX_ATTACHMENT_MB=${max_attachment_mb}
PORT=${app_port}
EOF
  fi

  chmod 0600 "${ENV_FILE}"
}

build_app() {
  log "Installing npm dependencies"
  cd "${SRC_DIR}"
  npm ci --no-audit --no-fund

  log "Building standalone runtime"
  npm run build
}

assemble_runtime() {
  log "Assembling runtime at ${RUNTIME_DIR}"
  rm -rf "${RUNTIME_DIR}"
  install -d -m 0755 "${RUNTIME_DIR}"

  cp -a "${SRC_DIR}/.next/standalone/." "${RUNTIME_DIR}/"
  install -d -m 0755 "${RUNTIME_DIR}/.next"
  cp -a "${SRC_DIR}/.next/static" "${RUNTIME_DIR}/.next/static"
  cp -a "${SRC_DIR}/public" "${RUNTIME_DIR}/public"

  chown -R "${APP_USER}:${APP_USER}" "${APP_ROOT}"
}

install_service() {
  log "Installing systemd service"
  install -m 0644 "${SCRIPT_DIR}/${APP_NAME}.service" "${SERVICE_FILE}"
  systemctl daemon-reload
  systemctl enable "${APP_NAME}"
  systemctl restart "${APP_NAME}"
}

main() {
  local installed_port

  require_root
  require_supported_os
  install_packages
  create_user
  copy_source
  prepare_env
  build_app
  assemble_runtime
  install_service

  installed_port="$(grep -E '^PORT=' "${ENV_FILE}" | tail -n 1 | cut -d'=' -f2- | tr -cd '0-9')"

  log "Done."
  log "Service: systemctl status ${APP_NAME}"
  log "Environment: ${ENV_FILE}"
  log "Loopback URL: http://127.0.0.1:${installed_port:-3000}"
}

main "$@"
