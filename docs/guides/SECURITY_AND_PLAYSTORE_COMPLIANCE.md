# Butler AI — Security and Play Store Compliance

**Package:** com.butlerai.pc.automation | **Version:** 7.3.0

---

## 1. Security Architecture

### 1.1 Authentication

| Layer | Method |
|-------|--------|
| Session Auth | 64-character HMAC-SHA256 Bearer token |
| Token generation | `secrets.token_urlsafe(64)` on butler_server.py |
| Token comparison | `secrets.compare_digest()` (constant-time, prevents timing attacks) |
| Pairing lock | Single-device UUID lock — only the paired phone can send commands |
| Token expiry | 30-day automatic rotation |
| Replay protection | Per-request HMAC signature with timestamp |

### 1.2 Transport Security

| Network | Protection |
|---------|-----------|
| Phone ↔ PC (LAN) | AES-256 encrypted channel (optional TLS self-signed cert) |
| LAN discovery | One-time scan, user consent required, /24 subnet only |
| No public internet | App makes no outbound calls to our servers |
| Camera | QR frames processed in-memory, never stored or transmitted |

### 1.3 Script Execution Safety

**Pre-execution scan (Malicious Script Blocker):**
- Blocks: `rm -rf`, `format`, registry wipe commands
- Blocks: `os.system()`, `eval()`, `exec()` with external input
- Blocks: Reading `/etc/passwd`, `/etc/shadow`
- All scripts run with 30-second timeout
- 64KB script size limit
- Scripts run as the user who launched butler_server.py

**Undo system:**
- Every execution is logged
- 1-tap undo available for 24 hours
- Rollback script auto-generated where possible

### 1.4 Data Protection

```
AsyncStorage → Android private storage (inaccessible to other apps)
No cloud backup of app data
No backup to Google Drive
All data deleted on uninstall
```

---

## 2. Google Play Policy Compliance

### 2.1 Device and Network Abuse Policy (§4.8)

Butler AI is compliant with the Device and Network Abuse policy because:

1. **Physical pairing required** — Connection requires scanning a QR code displayed on the user's own PC screen. Remote takeover is architecturally impossible.
2. **Manual execution only** — Every script and command requires an explicit user tap. No scheduler, no auto-execution, no background execution.
3. **No code download** — The app never downloads or installs executable code from external sources.
4. **Malicious Script Blocker** — Dangerous patterns are blocked before execution.
5. **No sensitive APIs** — Does not use Accessibility Service, SYSTEM_ALERT_WINDOW, MANAGE_EXTERNAL_STORAGE, QUERY_ALL_PACKAGES, or REQUEST_INSTALL_PACKAGES.

### 2.2 Permissions

| Permission | Justification | Required? |
|-----------|---------------|---------|
| INTERNET | Connect to user's own PC server on LAN | ✅ Required |
| CAMERA | One-shot QR scan for PC pairing only. No photos stored. | ✅ Required for pairing |
| ACCESS_NETWORK_STATE | Detect Wi-Fi before LAN discovery | ✅ Required |
| ACCESS_WIFI_STATE | Confirm same network as PC | ✅ Required |
| VIBRATE | Haptic feedback on actions | Optional |

**Permissions explicitly NOT used:**
- ❌ Accessibility Service
- ❌ SYSTEM_ALERT_WINDOW
- ❌ MANAGE_EXTERNAL_STORAGE
- ❌ QUERY_ALL_PACKAGES
- ❌ READ/WRITE_EXTERNAL_STORAGE
- ❌ RECORD_AUDIO
- ❌ READ_SMS / SEND_SMS
- ❌ READ_CALL_LOG
- ❌ ACCESS_BACKGROUND_LOCATION
- ❌ REQUEST_INSTALL_PACKAGES
- ❌ READ_CONTACTS

### 2.3 Camera Disclosure Compliance

**Pre-permission dialog shown BEFORE OS camera prompt:**
> "Butler AI uses your camera ONLY to scan the QR code displayed on your PC screen. No photos are taken, stored, or transmitted."

The camera stream is processed transiently in memory. Images are never persisted to storage or transmitted over the network.

### 2.4 LAN Scan Disclosure

**Explicit consent dialog shown BEFORE first LAN scan:**
- User sees what the scan does
- User explicitly taps ALLOW
- Scan is limited to user's own /24 subnet
- Results never leave the device
- One-time scan (not continuous background)

### 2.5 Age Restriction

- **Target audience:** Adults 18 and over (set in Play Console)
- **Content rating:** Mature (17+) via IARC questionnaire
- **Reason:** Remote script execution is a technical/legal responsibility requiring adult users
- **In-app enforcement:** Consent checkbox on page 3 of onboarding: "I confirm I am 18+ and understand this is a remote administration tool"

### 2.6 Data Safety

| Data Type | Collected? | Shared? | Purpose |
|-----------|-----------|---------|---------|
| Device ID (UUID) | ✅ Yes (local only) | ❌ No | PC pairing authentication |
| App interactions | ✅ Yes (local only) | ❌ No | Connection state, settings |
| Photos/Videos | ❌ No | ❌ No | Camera used for QR only |
| Location | ❌ No | ❌ No | Not accessed |
| Contacts | ❌ No | ❌ No | Not accessed |
| Analytics/Crash logs | ❌ No | ❌ No | No SDK included |

### 2.7 Privacy Policy Requirements

| Requirement | Status |
|------------|--------|
| Live URL without login | ✅ https://shawnjan-cmd.github.io/privacy-policy-/ |
| Mobile accessible | ✅ Verified |
| Mentions data collected | ✅ Section 4 |
| Explains camera use | ✅ Section 3 |
| Provides deletion method | ✅ Section 10 |
| GDPR / CCPA compliant | ✅ Sections 11-12 |

### 2.8 Account Deletion

**Google Play 2024 Policy:** All apps storing personal/sensitive data must provide deletion.

**In-app:** Settings → Personal Files & Account → **Delete All My Data** (3 taps from any main screen)

**What gets deleted:**
- Device UUID and pair secret
- HMAC session token
- All app settings
- Knowledge Base entries
- Script library
- Execution history
- Chat history

**Web form:** https://shawnjan-cmd.github.io/privacy-policy-/
**Email:** andrejsladkovic1992@gmail.com

---

## 3. Build Security

### 3.1 Network Security Config

`android/app/src/main/res/xml/network_security_config.xml` allows cleartext to the user's own LAN because:
- Butler server runs on user's own PC (HTTP within LAN)
- Android domain-config doesn't support CIDR notation for home network ranges (192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12)
- No external public endpoints use cleartext

### 3.2 ProGuard Notes

ProGuard is **disabled by default** in EAS builds to prevent release-only crashes from reflection. Re-enable after first successful build:
```json
"enableProguardInReleaseBuilds": true,
"enableShrinkResourcesInReleaseBuilds": true
```

### 3.3 Dependency Audit

**GPL-licensed code is strictly prohibited.** All dependencies use MIT, Apache 2.0, BSD, or ISC licenses.

See `LICENSING_POLICY.md` for full policy and `THIRD_PARTY_LICENSES.md` for the complete license list.

---

## 4. Play Store Reviewer Notes

If submitting to Play Store, include this in the reviewer notes:

```
Butler AI: PC Automation — Device and Network Abuse Compliance

1. Connection requires PHYSICAL QR code scan at the user's own PC.
   Remote takeover is architecturally impossible.

2. EVERY command requires a manual tap. No auto-execution, no scheduler,
   no background execution of any kind.

3. Malicious Script Blocker prevents rm -rf, disk format, registry wipes
   BEFORE execution.

4. App does NOT use: Accessibility Service, SYSTEM_ALERT_WINDOW,
   MANAGE_EXTERNAL_STORAGE, QUERY_ALL_PACKAGES, REQUEST_INSTALL_PACKAGES.

5. Camera = QR pairing only. No photos stored or transmitted.

6. LAN scan = explicit consent dialog, /24 subnet only, one-time scan.

7. Data deletion: Settings → Personal Files → Delete All My Data (3 taps)
   Also: https://shawnjan-cmd.github.io/privacy-policy-/

HOW TO TEST WITHOUT A REAL PC:
1. Open app → complete 10-page INTRO → accept all consent checkboxes
2. Home → SCAN QR TO PAIR → MANUAL IP tab
3. Enter demo server IP and port 5000 → CONNECT
4. App demonstrates all features

Contact: andrejsladkovic1992@gmail.com
```

---

*Butler AI — Security & Play Store Compliance | v7.3.0 | © 2026 Shawn Jan*
