# Office Attendance

A PWA that unifies two attendance sources into one timeline for a single office:

1. **Fingerprint biometric device** (Identix / ZKTeco-family) — pushed via ADMS,
   or pulled by a LAN poller as a fallback.
2. **Geo-restricted app check-in** — employees check in/out from the PWA; the
   server validates they are physically at the office (GPS + optional selfie).

## Stack

| Part      | Tech                                                        |
|-----------|-------------------------------------------------------------|
| Frontend  | React SPA (Vite) → static build, installable PWA            |
| Web server| Nginx (serves static build, reverse-proxies the API)        |
| Backend   | PocketBase (Go + SQLite), extended with JS hooks            |
| Device    | ADMS push (preferred) or pyzk poller (`bridge/`)            |
| Hosting   | AWS EC2 + Elastic IP, nightly stop/start (`deploy/`)        |

## Layout

```
backend/    PocketBase binary, schema migration, and hooks:
              pb_hooks/main.pb.js    geofence + dedup validation (app check-ins)
              pb_hooks/adms.pb.js    ADMS iclock receiver (biometric push)
              pb_hooks/bridge.pb.js  ingest route for the LAN poller
frontend/   React PWA (employee + admin screens)
bridge/     pyzk poller fallback + systemd unit (see bridge/README.md)
deploy/     Nginx, systemd, backup, EC2 setup (see deploy/README.md)
```

## Local development

The PocketBase binary is platform-specific and not committed — download the one
for your OS from https://github.com/pocketbase/pocketbase/releases (v0.28.4)
and place it in `backend/`. (On the EC2 instance, `deploy/setup-ec2.sh` fetches
the Linux build automatically.)

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

Biometric punches are written by device/service routes that bypass the geofence
(they're physically at the machine) but stay idempotent via a unique
`device_punch_id`.

See `deploy/README.md` and `bridge/README.md` for production + device setup.
