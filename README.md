# BNIX Webmail

Custom webmail UI that logs in with the mailbox credentials from DirectAdmin, reads mail over IMAP, and sends mail over SMTP.

## Stack

- Next.js App Router
- IMAP: `imapflow`
- SMTP: `nodemailer`
- MIME parsing: `mailparser`
- HTML email sanitizing: `sanitize-html`
- Encrypted HttpOnly cookie session

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Environment

```txt
AUTH_SECRET=replace-with-at-least-32-random-characters
MAIL_HOST=mail.your-domain.com
IMAP_PORT=993
SMTP_PORT=465
ALLOWED_EMAIL_DOMAINS=your-domain.com
NEXT_PUBLIC_WEBMAIL_NAME=BNIX WEBMAIL
```

If `IMAP_HOST` or `SMTP_HOST` are empty, the app uses `MAIL_HOST`. If `MAIL_HOST` is also empty, it uses `mail.<email-domain>`.

## DirectAdmin Flow

The login form accepts the real mailbox account:

```txt
alice@demo.root.cloud
mailbox-password
```

The app verifies those credentials by opening an IMAP connection. After login, each request opens a short-lived IMAP/SMTP connection using the encrypted session cookie.

## MVP Features

- Login with mailbox credentials
- Folder list
- Folder tree with custom folders
- Create mailbox folders
- Message list with snippets
- Read sanitized HTML/text email
- Compose, reply, send via SMTP
- Append sent messages to Sent folder when possible
- Star and delete messages
- Mark spam or not spam
- Attachments when sending

## Production Notes

- Set a strong `AUTH_SECRET`.
- Set `ALLOWED_EMAIL_DOMAINS` before exposing publicly.
- Run behind HTTPS.
- Put the app behind Caddy or another reverse proxy.
- The included Linux systemd service binds to `127.0.0.1` only, so public traffic must go through the reverse proxy.
- Add rate limiting at the proxy or middleware layer.
- Consider Redis-backed sessions if you do not want encrypted mailbox credentials in cookies.

## Linux Setup Package

Supported:

- Ubuntu 24.04
- Debian 12
- Debian 13

Install:

```bash
sudo bash deploy/linux/install.sh
```

The installer builds the Next.js standalone runtime, installs it under `/opt/bnix-webmail`, creates `/etc/bnix-webmail.env`, and starts `bnix-webmail.service`.

The service is loopback-only:

```txt
127.0.0.1:${PORT:-3000}
```

Caddy example:

```caddyfile
webmail.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
```

Config and logs:

```bash
sudo nano /etc/bnix-webmail.env
sudo systemctl restart bnix-webmail
sudo journalctl -u bnix-webmail -f
```
