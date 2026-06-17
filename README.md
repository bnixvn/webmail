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
Local webmail port [3000]: 3000
Webmail display name [BNIX WEBMAIL]: BNIX WEBMAIL
Max attachment size in MB [10]: 10
```

Khi login `user@domain.com`, app tự check MX record của `domain.com`, chọn MX priority tốt nhất, rồi dùng host đó cho IMAP/SMTP.

Nếu domain không có MX record, app fallback sang:

```txt
mail.domain.com
```

Sau khi chạy xong, app nằm tại:

```txt
/opt/bnix-webmail
```

File cấu hình nằm tại:

```txt
/etc/bnix-webmail.env
```

Chữ ký và cấu hình người dùng được lưu tại:

```txt
/opt/bnix-webmail/data
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
IMAP_HOST=
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
NEXT_PUBLIC_WEBMAIL_NAME="BNIX WEBMAIL"
NEXT_PUBLIC_MAX_ATTACHMENT_MB=10
PORT=3000
```

Thông thường không cần cấu hình `MAIL_HOST`, `IMAP_HOST`, `SMTP_HOST`.

Chỉ dùng override nếu thật sự cần ép tất cả domain về một host cố định:

```env
MAIL_HOST=mail.shared-server.vn
```

Hoặc ép riêng IMAP/SMTP:

```env
IMAP_HOST=imap.shared-server.vn
SMTP_HOST=smtp.shared-server.vn
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
- Signature settings
- Mark spam / Not spam
- Star, delete, mark read/unread
- Session cookie HttpOnly có mã hóa

## Ghi Chú Bảo Mật

- `AUTH_SECRET` phải mạnh và giữ kín.
- App chỉ nên chạy sau Caddy/reverse proxy có HTTPS.
- Service systemd đã force `HOSTNAME=127.0.0.1`, kể cả khi env bị cấu hình nhầm.
