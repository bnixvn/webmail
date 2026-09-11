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
CADDYFILE="/etc/caddy/Caddyfile"
# Marks the site block this installer owns, so re-running it updates that block
# instead of appending a duplicate (alias domains live in CADDY_FRAGMENT_FILE,
# which the app itself manages).
CADDY_SITE_MARKER="# BNIX Webmail primary site (managed by install.sh)"

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

upsert_env_var() {
  local key="$1"
  local value="$2"

  [ -f "${ENV_FILE}" ] || return 0
  if grep -q "^${key}=" "${ENV_FILE}"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
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
  install -d -m 0755 "${APP_ROOT}" "${SRC_DIR}" "${DATA_DIR}"

  # The documented flow clones straight into SRC_DIR and runs the installer from
  # there, in which case there is nothing to copy.
  if [ "${SOURCE_DIR}" = "${SRC_DIR}" ]; then
    log "Running from ${SRC_DIR}; skipping source copy"
  else
    log "Copying source to ${SRC_DIR}"
    local rsync_args=(-a --delete
      --exclude 'node_modules'
      --exclude 'venv'
      --exclude '.venv'
      --exclude '__pycache__')

    # Copy .git along with the files when the source is a checkout. Excluding it
    # used to leave SRC_DIR with new files on top of an old .git, so a later
    # "git pull" reported every updated file as a local modification and
    # refused to merge. Without a source checkout, keep (and protect from
    # --delete) whatever is already in SRC_DIR.
    if [ ! -d "${SOURCE_DIR}/.git" ]; then
      rsync_args+=(--exclude '.git')
    fi

    rsync "${rsync_args[@]}" "${SOURCE_DIR}/" "${SRC_DIR}/"
  fi

  chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}"
  # The app only ever reads the source and never runs git, so the checkout stays
  # root-owned: chowning .git to the service user is what makes "git pull" as
  # root fail with "detected dubious ownership".
  if [ -d "${SRC_DIR}/.git" ]; then
    chown -R root:root "${SRC_DIR}/.git"
  fi
}

prepare_env() {
  if [ -f "${ENV_FILE}" ]; then
    log "Keeping existing environment file: ${ENV_FILE}"
    return
  fi

  log "Creating environment file: ${ENV_FILE}"
  local auth_secret
  auth_secret="${AUTH_SECRET:-$(generate_secret)}"

  cat > "${ENV_FILE}" <<EOF
AUTH_SECRET=${auth_secret}

# Mail servers are discovered per login domain (SRV -> mail.<domain> -> MX).
# Only set IMAP_HOST/SMTP_HOST to force one fixed server for every domain.
IMAP_HOST=
IMAP_PORT=993
IMAP_SECURE=true
# Set IMAP_SECURE=false when the IMAP server only speaks plain IMAP on port 143.
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true

# Primary webmail domain, served from /etc/caddy/Caddyfile by the installer.
# Extra domains are added in the admin panel and written to CADDY_ALIASES_PATH.
PRIMARY_DOMAIN=
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

install_caddy() {
  if command -v caddy >/dev/null 2>&1; then
    log "Caddy already installed: $(caddy version 2>/dev/null | head -n1)"
    return
  fi

  # A Caddy failure (blocked repo, no network) should not abort the whole
  # install — the app still works behind any other reverse proxy.
  log "Installing Caddy from the official repository"
  if DEBIAN_FRONTEND=noninteractive apt-get install -y \
       debian-keyring debian-archive-keyring apt-transport-https gnupg \
     && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
     && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        > /etc/apt/sources.list.d/caddy-stable.list \
     && apt-get update \
     && DEBIAN_FRONTEND=noninteractive apt-get install -y caddy; then
    log "Caddy installed"
  else
    log "WARNING: could not install Caddy. Continuing without a reverse proxy."
    log "         The app will still listen on 127.0.0.1:8000."
  fi
}

setup_caddy_fragment() {
  install -d -m 0755 /etc/caddy

  log "Preparing Caddy alias fragment: ${CADDY_FRAGMENT_FILE}"
  touch "${CADDY_FRAGMENT_FILE}"
  chown "${APP_USER}:${APP_USER}" "${CADDY_FRAGMENT_FILE}"
  chmod 0644 "${CADDY_FRAGMENT_FILE}"
}

ensure_caddy_import() {
  [ -f "${CADDYFILE}" ] || return 0
  # Pulls in /etc/caddy/bnix-webmail.conf, where the admin panel writes the
  # extra webmail domains. Required for multi-domain setups — never remove it.
  if ! grep -Eq '^[[:space:]]*import[[:space:]]+/etc/caddy/\*\.conf' "${CADDYFILE}"; then
    printf '\nimport /etc/caddy/*.conf\n' >> "${CADDYFILE}"
  fi
}

detect_existing_site_domain() {
  [ -f "${CADDYFILE}" ] || return 0
  grep -A1 -F "${CADDY_SITE_MARKER}" "${CADDYFILE}" 2>/dev/null \
    | tail -n1 \
    | sed -n 's/^[[:space:]]*\([^[:space:]{]\{1,\}\)[[:space:]]*{.*$/\1/p'
}

caddyfile_is_stock_default() {
  [ -f "${CADDYFILE}" ] || return 1
  grep -q 'root \* /usr/share/caddy' "${CADDYFILE}"
}

render_caddy_site() {
  local domain="$1"
  cat <<EOF
${CADDY_SITE_MARKER}
${domain} {
    reverse_proxy 127.0.0.1:8000
}
EOF
}

configure_caddy_site() {
  if ! command -v caddy >/dev/null 2>&1; then
    log "Caddy is not installed; skipping reverse proxy configuration"
    return
  fi

  local domain existing
  existing="$(detect_existing_site_domain || true)"
  domain="${WEBMAIL_DOMAIN:-}"

  if [ -z "${domain}" ]; then
    if [ -n "${existing}" ]; then
      domain="$(prompt_default "Webmail URL/domain (blank to skip reverse proxy)" "${existing}")"
    else
      domain="$(prompt_optional "Webmail URL/domain for HTTPS, e.g. webmail.example.com (blank to skip)")"
    fi
  fi

  # Accept a pasted URL as well as a bare hostname.
  domain="$(printf '%s' "${domain}" | sed -e 's#^https\{0,1\}://##' -e 's#/.*$##')"

  if [ -z "${domain}" ]; then
    log "No webmail domain given; leaving ${CADDYFILE} untouched"
    ensure_caddy_import
    return
  fi

  PUBLIC_URL="https://${domain}"
  # Let the app know which domain it must refuse as an admin-panel alias.
  upsert_env_var "PRIMARY_DOMAIN" "${domain}"

  if [ -n "${existing}" ] && [ "${existing}" = "${domain}" ]; then
    log "Caddy already serves ${domain}; leaving ${CADDYFILE} unchanged"
    ensure_caddy_import
    reload_caddy
    return
  fi

  log "Configuring Caddy site for ${domain}"

  if [ ! -f "${CADDYFILE}" ] || caddyfile_is_stock_default; then
    if [ -f "${CADDYFILE}" ]; then
      cp -a "${CADDYFILE}" "${CADDYFILE}.bnix-backup.$(date +%Y%m%d%H%M%S)"
      log "Replaced the stock Caddyfile (backup kept alongside it)"
    fi
    {
      render_caddy_site "${domain}"
      printf '\nimport /etc/caddy/*.conf\n'
    } > "${CADDYFILE}"
  else
    cp -a "${CADDYFILE}" "${CADDYFILE}.bnix-backup.$(date +%Y%m%d%H%M%S)"
    local tmp
    tmp="$(mktemp)"
    # Drop the block we previously managed (if any), then re-add it.
    awk -v marker="${CADDY_SITE_MARKER}" '
      index($0, marker) { skip = 1; next }
      skip && /^}/      { skip = 0; next }
      skip              { next }
                        { print }
    ' "${CADDYFILE}" > "${tmp}"
    {
      # cat -s collapses the blank lines left behind by removing the old block
      cat -s "${tmp}"
      printf '\n'
      render_caddy_site "${domain}"
    } > "${CADDYFILE}"
    rm -f "${tmp}"
    ensure_caddy_import
  fi

  chmod 0644 "${CADDYFILE}"
  reload_caddy
}

reload_caddy() {
  if ! caddy validate --config "${CADDYFILE}" --adapter caddyfile >/dev/null 2>&1; then
    log "WARNING: ${CADDYFILE} did not validate; leaving Caddy running as-is. Check it manually."
    return
  fi

  systemctl enable caddy >/dev/null 2>&1 || true
  if systemctl is-active --quiet caddy; then
    systemctl reload caddy || systemctl restart caddy || log "WARNING: could not reload Caddy"
  else
    systemctl start caddy || log "WARNING: could not start Caddy"
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
  install_caddy
  create_user
  copy_source
  prepare_env
  setup_python
  provision_admin
  setup_caddy_fragment
  configure_caddy_site
  install_service

  log "Done."
  log "Service: systemctl status ${APP_NAME}"
  log "Environment: ${ENV_FILE}"
  if [ -n "${PUBLIC_URL:-}" ]; then
    log "Webmail: ${PUBLIC_URL}"
    log "Admin:   ${PUBLIC_URL}/admin  (credentials in ${ADMIN_CREDENTIALS_FILE})"
    log "HTTPS is issued automatically by Caddy once the domain's DNS A/AAAA record points here."
  else
    log "Loopback URL: http://127.0.0.1:8000 (no domain configured; put a reverse proxy in front)"
  fi
}

main "$@"
