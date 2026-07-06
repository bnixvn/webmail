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

- copies the app to `/opt/bnix-webmail`
- builds the Next.js standalone runtime
- creates `/etc/bnix-webmail.env`
- stores signature/user settings in `/opt/bnix-webmail/data`
- creates user `bnix-webmail`
- creates a random initial admin password in `/root/bnix-webmail-admin.txt`
- installs and starts `bnix-webmail.service`

If `/etc/bnix-webmail.env` does not exist, the installer asks for optional trusted IMAP/SMTP hosts and generates a strong `AUTH_SECRET`.

The backend never creates a known default admin password. On first install, read `/root/bnix-webmail-admin.txt` as root, sign in at `/admin`, and change the password.

Mail server selection is automatic. For `user@example.com`, the app checks the MX record of `example.com` and uses the best MX host. If no MX record exists, it falls back to `mail.example.com`.

The service is intentionally bound to loopback only:

```txt
127.0.0.1:${PORT:-3000}
```

Even if `HOSTNAME=0.0.0.0` is added to `/etc/bnix-webmail.env`, the systemd unit forces `HOSTNAME=127.0.0.1`.

This installer does not install Caddy or any public reverse proxy.
If Caddy is installed, it creates `/etc/caddy/bnix-webmail.conf` owned by `bnix-webmail` and ensures `/etc/caddy/Caddyfile` imports `/etc/caddy/*.conf`.

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
```
