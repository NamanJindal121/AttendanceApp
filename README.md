# Office Attendance

A PWA that unifies two attendance sources into one timeline for a single office:

1. **Fingerprint biometric device** (Identix / ZKTeco-family) — pulled over the
   office LAN by a poller (`bridge/`).
2. **Geo-restricted app check-in** — employees check in/out from the PWA; the
   server validates they are physically at the office (GPS + optional selfie).

## Stack

| Part      | Tech                                                        |
|-----------|-------------------------------------------------------------|
| Frontend  | React SPA (Vite) → static build, installable PWA            |
| Backend   | PocketBase (Go + SQLite), extended with JS hooks; serves the static frontend from `pb_public/` |
| Device    | pyzk LAN poller (`bridge/`)                                 |
| Hosting   | Always-on office PC + Cloudflare Tunnel (HTTPS, no public IP) — see `deploy/SELFHOST-WINDOWS.md` |

## Layout

```
backend/    PocketBase binary, schema migrations, and hooks:
              pb_hooks/main.pb.js    geofence + dedup validation (app check-ins)
              pb_hooks/bridge.pb.js  ingest route for the LAN poller
frontend/   React PWA (employee + admin screens)
bridge/     pyzk LAN poller (see bridge/README.md)
deploy/     SELFHOST-WINDOWS.md — full self-host setup guide
```

## Local development

The PocketBase binary is platform-specific and not committed — download the one
for your OS from https://github.com/pocketbase/pocketbase/releases (v0.28.4)
and place it in `backend/`.

```bash
# 1. Backend (terminal 1)
cd backend
./pocketbase migrate up
./pocketbase superuser create you@co.com strongpassword
./pocketbase serve            # http://127.0.0.1:8090  (admin at /_/)

# 2. Frontend (terminal 2)
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxies /api to :8090)
```

Then in the admin UI (`/_/`): set the `settings` office coordinates/radius, add
an `employees` record (set `role`, `biometric_user_id`), and — for biometric —
a `devices` record with the device serial.

### The security model

Check-ins are validated **server-side** in `backend/pb_hooks/main.pb.js`:

- The employee id, timestamp, and `source` are forced from the auth context /
  server clock — the client cannot forge them.
- Distance to the office is recomputed with the haversine formula; too far, or a
  GPS accuracy worse than the configured threshold, is rejected.
- Rapid duplicate punches are flagged for admin review.

Biometric punches are written by the bridge route that bypasses the geofence
(they're physically at the machine) but stays idempotent via a unique
`device_punch_id`.

See `deploy/SELFHOST-WINDOWS.md` for hosting setup and `bridge/README.md` for
the device poller.
