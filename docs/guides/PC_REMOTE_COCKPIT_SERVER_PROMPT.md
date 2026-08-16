# PC Remote Cockpit — Server Prompt
### Add/verify these 9 endpoints in `butler_server.py`

All 9 endpoints are referenced by the app's PC Remote Cockpit panels.
Most are already implemented — this prompt verifies and patches any gaps.

---

## TASK: Verify and complete PC Remote Cockpit endpoints in butler_server.py

Search your server code for each endpoint below. If it exists, verify the
response format matches exactly. If it doesn't exist, add it using the code
provided.

---

### ENDPOINT 1 — POST /api/clipboard (read + write)

Search for: `"/api/clipboard"` in do_POST

**READ (no `text` field in body):**
```python
elif path == "/api/clipboard":
    if not self._authed(body): self._json({"error":"AUTH_REQUIRED"},401); return
    text_to_set = body.get("text")
    if text_to_set is not None:
        # WRITE: set clipboard
        try:
            import subprocess, sys
            if sys.platform == "win32":
                subprocess.run(["clip"], input=text_to_set.encode("utf-8"),
                               check=True, timeout=5)
            elif sys.platform == "darwin":
                subprocess.run(["pbcopy"], input=text_to_set.encode("utf-8"),
                               check=True, timeout=5)
            else:
                subprocess.run(["xclip", "-selection", "clipboard"],
                               input=text_to_set.encode("utf-8"),
                               check=True, timeout=5)
            self._json({"status": "ok", "success": True, "action": "write",
                        "length": len(text_to_set)})
        except Exception as e:
            self._json({"error": str(e), "hint": "xclip/xsel required on Linux"}, 500)
    else:
        # READ: get clipboard
        try:
            import subprocess, sys
            if sys.platform == "win32":
                r = subprocess.run(["powershell", "-command",
                    "Get-Clipboard"], capture_output=True, text=True, timeout=5)
                text = r.stdout.strip()
            elif sys.platform == "darwin":
                r = subprocess.run(["pbpaste"], capture_output=True,
                                   text=True, timeout=5)
                text = r.stdout.strip()
            else:
                r = subprocess.run(["xclip", "-selection", "clipboard", "-o"],
                                   capture_output=True, text=True, timeout=5)
                text = r.stdout.strip()
            self._json({"status": "ok", "text": text, "content": text,
                        "length": len(text)})
        except Exception as e:
            self._json({"error": str(e), "text": "",
                        "hint": "xclip required on Linux"}, 200)
```

**Required response keys (app reads these):**
- READ: `{ "text": "...", "content": "...", "status": "ok" }`
- WRITE: `{ "status": "ok", "success": true }`

---

### ENDPOINT 2 — POST /api/keyboard/type

Search for: `"/api/keyboard/type"` in do_POST

```python
elif path == "/api/keyboard/type":
    if not self._authed(body): self._json({"error":"AUTH_REQUIRED"},401); return
    text = (body.get("text") or "").strip()
    if not text:
        self._json({"error": "text required"}, 400); return
    try:
        import pyautogui, time
        pyautogui.FAILSAFE = False
        time.sleep(0.1)
        pyautogui.typewrite(text, interval=0.02)
        self._json({"status": "ok", "success": True, "typed": True,
                    "chars": len(text)})
    except ImportError:
        # Fallback: try subprocess keyboard injection on Windows
        try:
            import subprocess
            ps_cmd = f'Add-Type -AssemblyName System.Windows.Forms; ' \
                     f'[System.Windows.Forms.SendKeys]::SendWait("{text}")'
            subprocess.run(["powershell", "-command", ps_cmd],
                           capture_output=True, timeout=10)
            self._json({"status": "ok", "success": True, "typed": True,
                        "hint": "pyautogui not installed, used SendKeys"})
        except Exception as e2:
            self._json({"error": "pyautogui not installed. Run: pip install pyautogui",
                        "fallback_error": str(e2)}, 500)
    except Exception as e:
        self._json({"error": str(e)}, 500)
```

**Required response keys (app reads these):**
- `{ "status": "ok", "success": true, "typed": true }`
- Error: `{ "error": "pyautogui not installed..." }`

---

### ENDPOINT 3 — POST /api/power

Search for: `"/api/power"` in do_POST

```python
elif path == "/api/power":
    if not self._authed(body): self._json({"error":"AUTH_REQUIRED"},401); return
    action  = (body.get("action") or "").lower()
    confirm = body.get("confirm", False)
    # Require explicit confirm:true to prevent accidents
    if not confirm:
        self._json({"error": "confirm:true required for power actions",
                    "hint": "Send { action, confirm: true }"}, 400); return
    # Check server setting (create with default True if not set)
    power_enabled = _gs("power_actions_enabled")
    if power_enabled is not None and not power_enabled:
        self._json({"error": "Power actions disabled in server settings",
                    "hint": "Enable power_actions_enabled in your server config"}, 403); return
    import subprocess, sys
    try:
        if action == "sleep":
            if sys.platform == "win32":
                subprocess.run(["rundll32.exe",
                    "powrprof.dll,SetSuspendState", "0","1","0"],
                    capture_output=True, timeout=5)
            elif sys.platform == "darwin":
                subprocess.run(["pmset", "sleepnow"], timeout=5)
            else:
                subprocess.run(["systemctl", "suspend"], timeout=5)
            self._json({"status": "ok", "action": "sleep",
                        "success": True, "initiated": True})
        elif action == "restart":
            if sys.platform == "win32":
                subprocess.Popen(["shutdown", "/r", "/t", "5"])
            elif sys.platform == "darwin":
                subprocess.Popen(["sudo", "shutdown", "-r", "+1"])
            else:
                subprocess.Popen(["sudo", "shutdown", "-r", "+1"])
            self._json({"status": "ok", "action": "restart",
                        "success": True, "initiated": True})
        elif action == "shutdown":
            if sys.platform == "win32":
                subprocess.Popen(["shutdown", "/s", "/t", "10"])
            elif sys.platform == "darwin":
                subprocess.Popen(["sudo", "shutdown", "-h", "+1"])
            else:
                subprocess.Popen(["sudo", "shutdown", "-h", "+1"])
            self._json({"status": "ok", "action": "shutdown",
                        "success": True, "initiated": True})
        elif action == "hibernate":
            if sys.platform == "win32":
                subprocess.Popen(["shutdown", "/h"])
            self._json({"status": "ok", "action": "hibernate",
                        "success": True, "initiated": True})
        else:
            self._json({"error": f"Unknown action: {action}",
                        "valid": ["sleep","restart","shutdown","hibernate"]}, 400)
    except Exception as e:
        self._json({"error": str(e)}, 500)
```

**Required response keys (app reads these):**
- `{ "status": "ok", "success": true, "initiated": true }`
- 403 if power_actions_enabled is False → app shows "Enable power_actions in server"

**One-time setup — add this setting default in `_init_db()` or startup:**
```python
if _gs("power_actions_enabled") is None:
    _ss("power_actions_enabled", True)
```

---

### ENDPOINT 4 — GET /api/processes

Search for: `"/api/processes"` in do_GET

```python
elif path.startswith("/api/processes"):
    if not self._authed(body): self._json({"error":"AUTH_REQUIRED"},401); return
    try:
        import psutil
        procs = []
        for p in psutil.process_iter(
                ["pid","name","cpu_percent","memory_percent","status"]):
            try:
                i = p.info
                procs.append({
                    "pid":            i["pid"],
                    "name":           i["name"] or "unknown",
                    "cpu_percent":    round(i["cpu_percent"] or 0, 1),
                    "memory_percent": round(i["memory_percent"] or 0, 2),
                    "status":         i["status"] or "running",
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        # Sort by CPU descending, return top 50
        procs.sort(key=lambda x: x["cpu_percent"], reverse=True)
        self._json({"status": "ok", "processes": procs[:50],
                    "count": len(procs)})
    except ImportError:
        self._json({"error": "psutil not installed. Run: pip install psutil",
                    "processes": []}, 500)
    except Exception as e:
        self._json({"error": str(e), "processes": []}, 500)
```

**Required response keys (app reads these):**
- `{ "processes": [{ "pid": N, "name": "...", "cpu_percent": N, "memory_percent": N }], "count": N }`

---

### ENDPOINT 5 — POST /api/kill_process

Search for: `"/api/kill_process"` in do_POST

```python
elif path == "/api/kill_process":
    if not self._authed(body): self._json({"error":"AUTH_REQUIRED"},401); return
    pid = body.get("pid")
    if pid is None:
        self._json({"error": "pid required"}, 400); return
    try:
        import psutil, signal as _sig
        pid = int(pid)
        proc = psutil.Process(pid)
        name = proc.name()
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except psutil.TimeoutExpired:
            proc.kill()
        self._json({"status": "ok", "success": True, "killed": True,
                    "pid": pid, "name": name})
    except psutil.NoSuchProcess:
        self._json({"error": f"Process {pid} not found (may have already exited)",
                    "success": True, "killed": True})  # treat as success
    except psutil.AccessDenied:
        self._json({"error": f"Access denied killing PID {pid} — run server as admin",
                    "success": False, "killed": False}, 403)
    except Exception as e:
        self._json({"error": str(e), "success": False}, 500)
```

**Required response keys (app reads these):**
- `{ "status": "ok", "success": true, "killed": true, "pid": N, "name": "..." }`

---

### ENDPOINT 6 — POST /api/receive_file (already implemented, verify format)

The app's file-share tab uses this. Verify it accepts:
```json
{ "filename": "example.txt", "data": "<base64-encoded-bytes>" }
```
And saves to the user's Desktop, returning:
```json
{ "status": "ok", "path": "C:\\Users\\user\\Desktop\\example.txt" }
```

---

### ENDPOINT 7 — GET /api/fs/drives (optional, for disk overview)

```python
elif path == "/api/fs/drives":
    if not self._authed(body): self._json({"error":"AUTH_REQUIRED"},401); return
    try:
        import psutil, os
        drives = []
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                drives.append({
                    "device":     part.device,
                    "mountpoint": part.mountpoint,
                    "fstype":     part.fstype,
                    "total_gb":   round(usage.total / 1024**3, 1),
                    "used_gb":    round(usage.used  / 1024**3, 1),
                    "free_gb":    round(usage.free  / 1024**3, 1),
                    "percent":    usage.percent,
                })
            except (PermissionError, OSError):
                pass
        self._json({"status": "ok", "drives": drives})
    except Exception as e:
        self._json({"error": str(e), "drives": []}, 500)
```

---

### ENDPOINT 8 — GET /api/sysinfo

```python
elif path == "/api/sysinfo":
    if not self._authed(body): self._json({"error":"AUTH_REQUIRED"},401); return
    try:
        import platform, psutil, socket
        uname = platform.uname()
        mem   = psutil.virtual_memory()
        cpu   = psutil.cpu_percent(interval=0.1)
        self._json({
            "status":       "ok",
            "hostname":     socket.gethostname(),
            "platform":     uname.system,
            "release":      uname.release,
            "version":      uname.version,
            "machine":      uname.machine,
            "cpu_count":    psutil.cpu_count(logical=True),
            "cpu_percent":  cpu,
            "ram_total_gb": round(mem.total  / 1024**3, 1),
            "ram_used_gb":  round(mem.used   / 1024**3, 1),
            "ram_percent":  mem.percent,
            "python":       platform.python_version(),
        })
    except Exception as e:
        self._json({"error": str(e)}, 500)
```

---

### ENDPOINT 9 — GET /api/status (verify remote-access fields)

Add these fields to your existing `/api/status` response so the app can detect remote mode:

```python
# Inside your existing /api/status handler, add to the response dict:
"remote_accessible": True,
"clipboard_supported": True,
"keyboard_supported": True,   # True only if pyautogui is installed
"power_actions_enabled": bool(_gs("power_actions_enabled")),
"tailscale_hint": "Use Tailscale 100.x.x.x IP for remote access from anywhere",
```

---

## QUICK DEPENDENCY CHECK

Run this once on your PC to ensure all cockpit features work:

```bash
pip install pyautogui psutil
```

On Linux, also install:
```bash
sudo apt install xclip   # for clipboard support
```

---

## REMOTE ACCESS (Tailscale or Cloudflare Tunnel)

The app's cockpit works identically over remote connections.
To connect from outside your home Wi-Fi:

**Option A — Tailscale (recommended, 5 minutes):**
1. Install Tailscale on PC: tailscale.com
2. Install Tailscale app on phone
3. Sign in to same account on both
4. In Butler AI Settings → enter the `100.x.x.x` Tailscale IP
5. All cockpit features work over 4G/5G with full HMAC auth

**Option B — Cloudflare Tunnel (public HTTPS URL):**
```bash
# Windows: download cloudflared.exe, then:
cloudflared tunnel --url http://localhost:8766
# Copy the https://butler-RANDOM.trycloudflare.com URL
# Enter it in Butler AI Settings → Remote URL field
```

**Server changes needed for remote access:**

In your request handler, add real-IP detection for reverse proxies:
```python
def _real_ip(self) -> str:
    cf_ip     = self.headers.get("CF-Connecting-IP", "")
    if cf_ip: return cf_ip
    forwarded = self.headers.get("X-Forwarded-For", "")
    if forwarded: return forwarded.split(",")[0].strip()
    return self.client_address[0]
```

Relax the IP allowlist check to trust Tailscale IPs (100.x range):
```python
def _is_trusted_ip(client_ip: str, paired_ip: str) -> bool:
    if not paired_ip: return True
    if client_ip == paired_ip: return True
    if client_ip.startswith("100."): return True  # Tailscale
    return True  # HMAC token is the real auth — IP is secondary
```

Ensure CORS headers allow all origins (HMAC token is the real security):
```python
def _cors(self):
    self.send_header("Access-Control-Allow-Origin",  "*")
    self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    self.send_header("Access-Control-Allow-Headers",
                     "Authorization, Content-Type, X-Device-Id")
```

---

## SUMMARY — What each cockpit panel calls

| Panel | Method | Endpoint | Key response field |
|-------|--------|----------|--------------------|
| Read PC clipboard | POST | `/api/clipboard` (empty body) | `text` |
| Write to PC clipboard | POST | `/api/clipboard` `{ text }` | `success` |
| Type on PC | POST | `/api/keyboard/type` `{ text }` | `typed` |
| Sleep | POST | `/api/power` `{ action:"sleep", confirm:true }` | `initiated` |
| Restart | POST | `/api/power` `{ action:"restart", confirm:true }` | `initiated` |
| Shutdown | POST | `/api/power` `{ action:"shutdown", confirm:true }` | `initiated` |
| Process list | GET | `/api/processes` | `processes[]` |
| Kill process | POST | `/api/kill_process` `{ pid }` | `killed` |

*All endpoints require `Authorization: Bearer <token>` header.*
