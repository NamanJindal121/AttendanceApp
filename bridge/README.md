# Attendance Device Bridge (LAN poller)

Pulls biometric punches from the fingerprint device over the office LAN and
posts them into PocketBase. Runs on the same always-on office PC as PocketBase
(see `deploy/SELFHOST-WINDOWS.md`), so it talks to the device on the local
network and to PocketBase on `localhost` — no ADMS/cloud-push needed, and it
works with virtually any ZKTeco-family device (incl. Identix).

## How it works

```
[Fingerprint device] --LAN 192.168.x.x:4370--> poller.py --> PocketBase (localhost)
                        (pyzk pulls punches)      buffers &     /api/bridge/punch
                                                  retries
```

The poller reads new punches, maps each device user id to an employee via the
`biometric_user_id` field, and posts to the `/api/bridge/punch` route
(`backend/pb_hooks/bridge.pb.js`) using a dedicated **admin service account**.
It records what it has already sent in a local `STATE_FILE`, so nothing is
double-counted or lost if PocketBase is briefly unavailable.

## Setup

1. Give the device a static LAN IP (e.g. `192.168.1.201`); confirm the PC can
   reach it on TCP port 4370.
2. Install deps and configure:
   ```bash
   pip install -r requirements.txt
   cp .env.example .env          # edit: DEVICE_IP, PB_URL=http://127.0.0.1:8090, creds
   ```
3. Run it: `python poller.py` (Linux/macOS: `set -a; source .env; set +a` first).
4. On the office Windows PC, install it as an always-on service with NSSM the
   same way as PocketBase — see `deploy/SELFHOST-WINDOWS.md` Part 5.

## Mapping employees

Set each person's device user id in the `biometric_user_id` field on their
`employees` record (via the admin UI). Unmapped ids are skipped and logged.
