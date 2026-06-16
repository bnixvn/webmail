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
- creates user `bnix-webmail`
- installs and starts `bnix-webmail.service`

If `/etc/bnix-webmail.env` does not exist, the installer asks for optional domain allowlist, optional mail host map, local port, display name, and attachment limit. It also generates a strong `AUTH_SECRET`.

Mail server selection is dynamic. For `user@example.com`, the app uses `MAIL_HOST_MAP` when configured, otherwise it falls back to `mail.example.com`.

The service is intentionally bound to loopback only:

```txt
127.0.0.1:${PORT:-3000}
```

Even if `HOSTNAME=0.0.0.0` is added to `/etc/bnix-webmail.env`, the systemd unit forces `HOSTNAME=127.0.0.1`.

This installer does not install Caddy or any public reverse proxy.

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
