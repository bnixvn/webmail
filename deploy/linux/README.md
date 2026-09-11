# BNIX Webmail Linux Setup

Supported OS:

- Ubuntu 24.04
- Debian 12
- Debian 13

Install from the project root:

```bash
sudo bash deploy/linux/install.sh
```

The installer:

- installs Python 3, Caddy and the other system packages
- copies the app to `/opt/bnix-webmail` and creates a Python venv
- creates `/etc/bnix-webmail.env` with a generated `AUTH_SECRET`
- stores signature/user settings in `/opt/bnix-webmail/data`
- creates user `bnix-webmail`
- creates a random initial admin password in `/root/bnix-webmail-admin.txt`
- asks for the webmail domain and configures Caddy as an HTTPS reverse proxy
- installs and starts `bnix-webmail.service`

The only question it asks is the webmail domain (e.g. `webmail.example.com`;
a pasted `https://…` URL is accepted too). Leave it blank to skip the reverse
proxy and put your own in front of `127.0.0.1:8000`.

Non-interactive install:

```bash
sudo WEBMAIL_DOMAIN=webmail.example.com bash deploy/linux/install.sh
```

The backend never creates a known default admin password. On first install, read `/root/bnix-webmail-admin.txt` as root, sign in at `/admin`, and change the password.

Mail server selection is automatic, so the installer does not ask for IMAP/SMTP
hosts. For `user@example.com` the app resolves `example.com` (SRV →
`mail.<domain>` → MX). Set `IMAP_HOST`/`SMTP_HOST` in `/etc/bnix-webmail.env`
only to force one fixed server for every domain.

The service is intentionally bound to loopback only:

```txt
127.0.0.1:${PORT:-8000}
```

Even if `HOST=0.0.0.0` is added to `/etc/bnix-webmail.env`, the systemd unit forces `HOST=127.0.0.1`.

## Caddy layout (multi-domain)

Two files, two owners — never edit the second one by hand:

| File | Owner | Contents |
|------|-------|----------|
| `/etc/caddy/Caddyfile` | installer | the primary site block (marked `# BNIX Webmail primary site (managed by install.sh)`) plus `import /etc/caddy/*.conf` |
| `/etc/caddy/bnix-webmail.conf` | the app | every extra webmail domain added from the admin panel |

The `import /etc/caddy/*.conf` line is what makes multi-domain work: each
domain you add under **Admin → Domains** is rendered into
`/etc/caddy/bnix-webmail.conf` and picked up by Caddy on reload. Keep that line.

The primary domain is recorded as `PRIMARY_DOMAIN` in `/etc/bnix-webmail.env`.
The admin panel refuses to add that same domain as an extra domain (HTTP 409),
because two site blocks for one host make Caddy reject the whole config — which
would stop *all* other domains from updating.

Re-running the installer with the same domain is a no-op. Giving a different
domain replaces the managed block and updates `PRIMARY_DOMAIN`; anything else in
the Caddyfile is kept and a timestamped backup is written next to it.

HTTPS certificates are issued by Caddy automatically once the domain's DNS
A/AAAA record points at the server and ports 80/443 are reachable.

Edit production settings:

```bash
sudo nano /etc/bnix-webmail.env
sudo systemctl restart bnix-webmail
```

Useful commands:

```bash
sudo systemctl status bnix-webmail
sudo journalctl -u bnix-webmail -f
sudo systemctl restart bnix-webmail
sudo systemctl reload caddy
```
