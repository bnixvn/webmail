# BNIX Webmail

Webmail riêng cho mailbox DirectAdmin. Ứng dụng không chạy mail server, chỉ đăng nhập mailbox có sẵn và làm việc qua IMAP/SMTP.

## Hỗ Trợ

- Ubuntu 24.04
- Debian 12
- Debian 13
- DirectAdmin mail backend
- Caddy/reverse proxy cài riêng sau

Service mặc định chỉ listen nội bộ:

```txt
127.0.0.1:3000
```

Không mở `0.0.0.0`, tránh public trực tiếp Node.js ra internet.

## Cài Đặt Từ Git

Đăng nhập server bằng user có quyền `sudo`, rồi chạy:

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/bnixvn/webmail.git
cd webmail
sudo bash install-webmail.sh
```

Trong lúc cài, script sẽ hỏi:

```txt
Allowed email domains, comma separated, blank allows all domains:
Mail host map, domain=host pairs, blank uses mail.<login-domain>:
Default mail host override, blank uses mail.<login-domain>:
Local webmail port [3000]: 3000
Webmail display name [BNIX WEBMAIL]: BNIX WEBMAIL
Max attachment size in MB [10]: 10
```

Nếu để trống `Mail host map` và `Default mail host override`, khi login `user@domain.com` app sẽ tự kết nối tới:

```txt
mail.domain.com
```

Nếu mỗi domain nằm ở một mail server khác nhau, nhập map dạng:

```txt
bnix.io.vn=mail1.bnix.vn,example.com=mail2.bnix.vn
```

Sau khi chạy xong, app nằm tại:

```txt
/opt/bnix-webmail
```

File cấu hình nằm tại:

```txt
/etc/bnix-webmail.env
```

Systemd service:

```txt
bnix-webmail.service
```

## Cài Đặt Từ File Nén

Nếu dùng bản `.tar.gz`:

```bash
tar -xzf bnix-webmail-setup-YYYYMMDD-HHMMSS.tar.gz
cd bnix-webmail
sudo bash install-webmail.sh
```

## Kiểm Tra Sau Khi Cài

Kiểm tra service:

```bash
sudo systemctl status bnix-webmail
```

Xem log realtime:

```bash
sudo journalctl -u bnix-webmail -f
```

Test local:

```bash
curl -I http://127.0.0.1:3000
```

Kết quả đúng sẽ có:

```txt
HTTP/1.1 200 OK
```

## Cấu Hình

Mở file env:

```bash
sudo nano /etc/bnix-webmail.env
```

Ví dụ:

```env
AUTH_SECRET=auto-generated-secret
MAIL_HOST=
MAIL_HOST_MAP=bnix.io.vn=mail1.bnix.vn,example.com=mail2.bnix.vn
IMAP_HOST=
IMAP_HOST_MAP=
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=
SMTP_HOST_MAP=
SMTP_PORT=465
SMTP_SECURE=true
ALLOWED_EMAIL_DOMAINS=
NEXT_PUBLIC_WEBMAIL_NAME="BNIX WEBMAIL"
NEXT_PUBLIC_MAX_ATTACHMENT_MB=10
PORT=3000
```

Thứ tự chọn mail server khi user login `name@domain.com`:

1. `IMAP_HOST_MAP` / `SMTP_HOST_MAP` nếu domain có cấu hình riêng
2. `MAIL_HOST_MAP` nếu domain có trong map chung
3. `IMAP_HOST` / `SMTP_HOST` nếu cấu hình host cố định
4. `MAIL_HOST` nếu cấu hình host cố định chung
5. fallback tự động `mail.domain.com`

Ví dụ dùng chung một mail server cho tất cả domain:

```env
MAIL_HOST=mail.shared-server.vn
MAIL_HOST_MAP=
```

Ví dụ nhiều domain ở nhiều server:

```env
MAIL_HOST=
MAIL_HOST_MAP=domain1.com=mail1.provider.vn,domain2.com=mail2.provider.vn
```

Ví dụ IMAP và SMTP khác host:

```env
IMAP_HOST_MAP=domain1.com=imap1.provider.vn,domain2.com=imap2.provider.vn
SMTP_HOST_MAP=domain1.com=smtp1.provider.vn,domain2.com=smtp2.provider.vn
```

Sau khi sửa:

```bash
sudo systemctl restart bnix-webmail
```

## Dùng Với Caddy

Script này không cài Caddy.

Sau khi tự cài Caddy, reverse proxy về loopback:

```txt
127.0.0.1:3000
```

Không cần đổi app sang `0.0.0.0`.

## Update Phiên Bản Mới

Nếu cài từ Git:

```bash
cd webmail
git pull
sudo bash install-webmail.sh
```

Script sẽ build lại app, giữ nguyên `/etc/bnix-webmail.env`, và restart service.

## Gỡ Cài Đặt

```bash
sudo systemctl disable --now bnix-webmail
sudo rm -f /etc/systemd/system/bnix-webmail.service
sudo systemctl daemon-reload
sudo rm -rf /opt/bnix-webmail
sudo rm -f /etc/bnix-webmail.env
sudo userdel bnix-webmail 2>/dev/null || true
sudo groupdel bnix-webmail 2>/dev/null || true
```

## Tính Năng Chính

- Login bằng mailbox DirectAdmin
- Đọc mail qua IMAP
- Gửi mail qua SMTP
- Folder tree và custom folders
- Tạo folder
- Compose/reply/reply all/forward
- Gửi nhiều người nhận To/Cc/Bcc
- Rich text editor cơ bản
- Attachments
- Mark spam / Not spam
- Star, delete, mark read/unread
- Session cookie HttpOnly có mã hóa

## Ghi Chú Bảo Mật

- Nên đặt `ALLOWED_EMAIL_DOMAINS` nếu chỉ muốn webmail phục vụ một nhóm domain cụ thể. Để trống nghĩa là cho phép mọi domain và mail host sẽ được resolve theo cấu hình bên trên.
- `AUTH_SECRET` phải mạnh và giữ kín.
- App chỉ nên chạy sau Caddy/reverse proxy có HTTPS.
- Service systemd đã force `HOSTNAME=127.0.0.1`, kể cả khi env bị cấu hình nhầm.
