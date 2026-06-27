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
- installs and starts `bnix-webmail.service`

If `/etc/bnix-webmail.env` does not exist, the installer asks for local port, display name, and attachment limit. It also generates a strong `AUTH_SECRET`.

Mail server selection is automatic. For `user@example.com`, the app checks the MX record of `example.com` and uses the best MX host. If no MX record exists, it falls back to `mail.example.com`.

Gmail sign-in is optional and disabled by default. The normal BNIX Webmail login uses email + mail password over IMAP/SMTP and does not need Google Cloud.

If you want Gmail or Google Workspace sign-in, it uses Google OAuth, not Gmail passwords. Create a Google OAuth web client and add this redirect URI in Google Cloud:

```txt
https://your-domain.example/api/auth/google/callback
```

Google Cloud setup path:

1. Open `https://console.cloud.google.com/apis/credentials`.
2. Configure OAuth consent screen with app name `BNIX Webmail`.
3. Create `Credentials` -> `OAuth client ID`.
4. Choose `Web application`.
5. Add the redirect URI above.
6. Copy the generated Client ID and Client Secret.

Use the public OAuth verification home page as the application home page:

```txt
https://your-domain.example/oauth-home
```

Then open `/admin`, enable Google login, and paste the generated Client ID and Client Secret into the Google OAuth Login section.

Alternatively, put the credentials in `/etc/bnix-webmail.env`:

```txt
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Environment credentials only make Google OAuth available for configuration; they do not turn the login button on. Open `/admin` and enable Google login when you want it visible on the login page.

The app auto-detects the public hostname from the request/proxy headers. If your proxy reports the wrong host or scheme, override it with `PUBLIC_BASE_URL=https://your-domain.example` or `GOOGLE_REDIRECT_URI=https://your-domain.example/api/auth/google/callback`.

The OAuth app must request the Gmail IMAP/SMTP scope `https://mail.google.com/`.

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
