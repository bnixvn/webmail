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

The service is intentionally bound to loopback only:

```txt
127.0.0.1:${PORT:-3000}
```

Even if `HOSTNAME=0.0.0.0` is added to `/etc/bnix-webmail.env`, the systemd unit forces `HOSTNAME=127.0.0.1`.

Edit production settings:

```bash
sudo nano /etc/bnix-webmail.env
sudo systemctl restart bnix-webmail
```

Caddy example:

```caddyfile
webmail.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
```

Useful commands:

```bash
sudo systemctl status bnix-webmail
sudo journalctl -u bnix-webmail -f
sudo systemctl restart bnix-webmail
```
