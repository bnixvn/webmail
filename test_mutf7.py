import requests, urllib.parse, json

BASE = "http://127.0.0.1:8000"
s = requests.Session()

# Login
resp = s.post(f"{BASE}/api/auth/login", json={"email":"new@bnix.io.vn","password":"JJCL3FzCvk2FGXLfZnr2"})
print("LOGIN:", resp.status_code, resp.json())

# Force cookie without secure flag
for c in s.cookies:
    c.secure = False

# List mailboxes  
resp2 = s.get(f"{BASE}/api/mailboxes")
print("MAILBOXES status:", resp2.status_code)
if resp2.status_code != 200:
    print("  Body:", resp2.text[:500])
    raise SystemExit(1)

mboxes = resp2.json()
for mb in mboxes.get("mailboxes", []):
    has_unicode = any(ord(c) > 127 for c in mb["path"])
    marker = " ** UNICODE **" if has_unicode else ""
    print(f"  {mb['path']} (total={mb['total']}, unseen={mb['unseen']}){marker}")

# Try selecting each folder
print("\n--- Testing SELECT on each folder ---")
for mb in mboxes.get("mailboxes", []):
    folder = mb["path"]
    url = f"{BASE}/api/messages?folder={urllib.parse.quote(folder)}&limit=1"
    try:
        resp3 = s.get(url)
        for c in s.cookies:
            c.secure = False
        if resp3.status_code == 200:
            msgs = resp3.json()
            print(f"  OK: {folder} ({len(msgs.get('messages',[]))} msgs)")
        else:
            print(f"  FAIL: {folder} -> {resp3.status_code} {resp3.text[:200]}")
    except Exception as e:
        print(f"  ERROR: {folder} -> {e}")