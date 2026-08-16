# Butler AI — User Guide

**App:** Butler AI: PC Automation (v7.3.0)
**Package:** com.butlerai.pc.automation
**Contact:** andrejsladkovic1992@gmail.com

---

## Table of Contents

1. [What is Butler AI?](#1-what-is-butler-ai)
2. [System Requirements](#2-system-requirements)
3. [First-Time Setup](#3-first-time-setup)
4. [Connecting to Your PC](#4-connecting-to-your-pc)
5. [Running Scripts](#5-running-scripts)
6. [Butler AI Chat (Local Ollama)](#6-butler-ai-chat)
7. [Knowledge Base](#7-knowledge-base)
8. [PC Telemetry Tab](#8-pc-telemetry-tab)
9. [Script Builder](#9-script-builder)
10. [Settings & Configuration](#10-settings--configuration)
11. [Privacy & Data Deletion](#11-privacy--data-deletion)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. What is Butler AI?

Butler AI connects your Android phone to your own PC over your home Wi-Fi and lets you:

- **Run Python scripts** on your PC with one tap
- **Chat with a local AI** (Ollama — no API key, no internet, no cloud)
- **Monitor your PC** — CPU, RAM, disk, running processes in real time
- **Auto-grow a knowledge base** — the SIGMA-NET crawler indexes Python documentation for you
- **Transfer files** between your phone and PC

**Everything runs on your own hardware.** Nothing leaves your local network. No accounts, no subscriptions, no cloud.

---

## 2. System Requirements

### Android Phone
- Android 8.0 (API 26) or higher
- Same Wi-Fi network as your PC

### PC (Windows / Mac / Linux)
- Python 3.10 or higher
- 4 GB RAM minimum (8 GB recommended for Ollama AI)
- Free port 5000 (default) or configurable

---

## 3. First-Time Setup

### On Your PC — Install the Butler Server

**Automatic (one command):**
```bash
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File boter_setup.ps1

# macOS / Linux
bash boter_setup.sh
```

This installs Python dependencies, sets up Ollama, and pulls `qwen2.5-coder:7b` automatically.

**Manual:**
```bash
pip install -r requirements.txt
python butler_server.py
```

When the server starts, it shows:
- A QR code to scan from your phone
- The IP address and port
- A one-time pair code

### On Your Phone — Complete Onboarding

1. Open Butler AI
2. Read through the 10-page INTRO screens (required first time)
3. Accept all consent checkboxes on the Safety and Pledge pages
4. On the final page, tap **FINISH** → app opens to the Home dashboard

---

## 4. Connecting to Your PC

### Option A: QR Code (Recommended)
1. On the Home screen, tap **SCAN QR TO PAIR**
2. Allow camera when asked (one-time, QR only — no photos taken)
3. Point camera at the QR code on your PC screen
4. ✅ Paired instantly

### Option B: Manual IP
1. Tap **SCAN QR TO PAIR** → tap **MANUAL IP** tab
2. Enter your PC's IP address (e.g. `192.168.1.100`)
3. Enter the port (default: `5000`)
4. Tap **CONNECT**

### Option C: Auto-Discover
The app scans your local Wi-Fi subnet for the butler_server.py service. Works automatically when you tap CONNECT on the Home screen with no IP entered.

### Connection Status
- 🟢 **ONLINE** — Connected, real-time data flowing
- 🔴 **OFFLINE** — PC server not reachable
- 🟡 **RECONNECTING** — Auto-connect in progress

---

## 5. Running Scripts

### 70+ Built-in Scripts
The SCRIPTS tab contains a library of ready-to-run Python scripts organized by category:

| Category | Examples |
|----------|---------|
| System Info | CPU usage, RAM report, disk space, uptime |
| File Operations | Backup Documents, find large files, clean temp |
| Network | Ping test, open ports scan, IP info |
| Process Management | Kill by name, list running apps |
| Automation | Schedule tasks, batch rename, zip folders |
| Python Utilities | Pip list, version check, env info |

### Running a Script
1. Tap any script in the SCRIPTS tab
2. Review the script code (optional)
3. Tap **RUN**
4. Output appears in the terminal view below

### 1-Tap Undo
Every script execution is logged. Tap **UNDO** in the PC tab within 24 hours to reverse the last execution.

### Safety: Malicious Script Blocker
Before any script runs, Butler AI scans it for dangerous patterns:
- `rm -rf /` or equivalent
- Disk format commands
- Registry wipes
- `eval()` / `exec()` with external data

Dangerous scripts are **blocked before execution** and you see a warning.

### Writing Your Own Scripts
1. Tap **+** in the SCRIPTS tab
2. Write or paste Python code
3. Test with the **RUN** button
4. Save to your library

---

## 6. Butler AI Chat

The **AI** tab connects to a local Ollama model running on your PC.

### What Makes It Different
- **100% offline** — prompts never leave your LAN
- **No API key** — you run the model yourself
- **Free unlimited** — use it as much as you want
- **Coding-focused** — `qwen2.5-coder:7b` knows Python automation inside-out

### Recommended Models

| Model | Size | Best For |
|-------|------|---------|
| `qwen2.5-coder:7b` | 4 GB | Python scripts, code review |
| `phi4-mini:latest` | 2.5 GB | Fast responses, general tasks |
| `mistral:7b` | 4 GB | General reasoning |
| `llama3.2:3b` | 2 GB | Compact, quick answers |

### Install a Model
In the CONFIG tab → **OLLAMA LOCAL AI ENGINE** → enter model name → tap **PULL**.

Or on your PC:
```bash
ollama pull qwen2.5-coder:7b
```

### Example Prompts
- "Write a Python script to monitor disk space and alert me when below 10%"
- "Explain what this script does: [paste code]"
- "Fix the error: ModuleNotFoundError: No module named 'psutil'"
- "How do I schedule a Python script to run every morning?"

---

## 7. Knowledge Base

The **KB** tab is an intelligent knowledge store that grows automatically.

### How It Works
1. **SIGMA-NET Crawler** — The butler_server.py crawls Python documentation and automation guides
2. **OMEGA Loop** — 24/7 background growth engine adds new findings automatically
3. **Quantum Link Harvester** — Discovers related topics and URLs automatically
4. **You get smarter search** — Butler AI's chat uses the KB to answer questions with more context

### Managing the KB
| Action | How |
|--------|-----|
| View all findings | KB tab → scroll through findings |
| Search | KB tab → search bar |
| Export to JSON | CONFIG → KB section → Export |
| Clear KB | CONFIG → KB section → Clear |
| Force re-seed | CONFIG → KB section → SEED PYTHON KB |

### KB Size
- Each finding is compressed to ~70-90% of original size
- 1,000 findings ≈ ~2 MB storage
- The KB stores locally on your device (AsyncStorage)

---

## 8. PC Telemetry Tab

Real-time monitoring of your PC's health.

| Metric | Description |
|--------|-------------|
| CPU | Usage percentage, per-core breakdown |
| RAM | Used / Total, top processes by memory |
| Disk | Usage percentage, read/write speeds |
| Network | Upload/Download speeds, active connections |
| Processes | Running process list with CPU/RAM per process |
| Uptime | How long your PC has been running |

### Refresh Rate
Stats update every 3 seconds automatically. Pull to refresh for immediate update.

---

## 9. Script Builder

The **BUILD** tab is a visual Python automation pipeline builder.

1. Add **Steps** (input, process, output)
2. Connect steps together visually
3. Set parameters for each step
4. Run the full pipeline with one tap
5. Save pipelines to your library

---

## 10. Settings & Configuration

### Onboarding (INTRO Screens)
| Setting | What It Does |
|---------|-------------|
| Show on Next Launch | Toggle whether the INTRO tab appears on next boot |
| Reset All Consents | Clears all consent checkboxes (INTRO will re-run) |
| Show INTRO Tab | Restores INTRO tab if it was hidden |

### Simulate Fresh Install (Debug)
Settings → DEBUG TOOLS → **SIMULATE FRESH INSTALL**

Clears all onboarding flags. Reload the app and the full 10-page INTRO flow appears as if newly installed. Use this to verify the onboarding works correctly.

### Connection Settings
- **PC IP / Port** — Tap to edit inline (persists across restarts)
- **Auto-connect on startup** — Reconnects to last server automatically
- **Auto-run on startup** — Runs saved script when connected

### Performance
- **Pause All Animations** — Saves CPU on slower phones
- **Bare Minimum Mode** — Disables all HUD effects
- **Disable Haptics** — Turn off vibration feedback
- **Compact Tab Bar** — Icon-only tabs (saves screen height)

### Ollama AI
- View installed models
- Pull new models directly from the app
- Check Ollama connection status

### Script Only Mode
Hides AI, KB, and Terminal tabs. Shows only Home, Scripts, and Settings — ideal for pure automation use.

---

## 11. Privacy & Data Deletion

### What Data is Stored
All data is stored **locally on your device only**:
- Server connection settings (IP, port, session token)
- Device pairing UUID
- Knowledge Base entries
- Script library
- Chat history
- App settings

**No data ever leaves your device to our servers.**

### Delete All Your Data
**In-app:** Settings → Personal Files & Account → **DELETE ALL MY DATA**

This permanently erases:
- Pair secret and device UUID
- All settings
- All KB entries
- All execution history

**Via web:** https://shawnjan-cmd.github.io/privacy-policy-/
**Via email:** andrejsladkovic1992@gmail.com

### Privacy Policy
Full privacy policy: https://shawnjan-cmd.github.io/privacy-policy-/

---

## 12. Troubleshooting

### App shows robot icon and freezes
The splash screen animation callback dropped on Android. Fixed in v7.2+ — the exit now uses `setTimeout(420ms)` as a guaranteed fallback.

### "Cannot connect to PC"
1. Make sure phone and PC are on the **same Wi-Fi network**
2. Check that `butler_server.py` is running on your PC
3. Try entering the IP manually: find PC IP with `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
4. Check Windows firewall allows port 5000

### Onboarding FINISH button doesn't navigate
1. Go to Settings → DEBUG TOOLS → **SIMULATE FRESH INSTALL**
2. Reload the app
3. Complete onboarding again — this clears any stuck state

### Butler AI chat shows no response
1. Check Ollama is running on your PC: `ollama serve`
2. Check a model is installed: `ollama list`
3. CONFIG tab → Ollama section → tap the refresh icon

### LAN auto-discover doesn't find my PC
The scanner looks for butler_server.py signature on your `/24` subnet. Make sure:
- No VPN active on your phone
- Phone and PC on same router (not guest network)
- `butler_server.py` is actually running and shows `Listening on 0.0.0.0:5000`

### Debug Log (on-device)
Triple-tap the **DEBUG TOOLS** header in Settings to open the Error Log modal.
Shows last 20 errors — useful for diagnosing issues without Logcat.

---

## Quick Reference

| Action | Steps |
|--------|-------|
| Connect to PC | Home → SCAN QR TO PAIR |
| Run a script | SCRIPTS tab → select → RUN |
| Undo last script | PC tab → UNDO button |
| Chat with AI | AI tab → type message |
| Check PC health | PC tab |
| Reset onboarding | Settings → INTRO → Reset All Consents |
| Delete all data | Settings → Personal Files → DELETE ALL |
| View error log | Settings → DEBUG TOOLS → triple-tap header |

---

*Butler AI v7.3.0 | © 2026 Shawn Jan | andrejsladkovic1992@gmail.com*
