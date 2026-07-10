# Attendance Device Bridge

Two ways to get biometric punches from the Identix device into PocketBase.
**Try ADMS push first — it needs no code running here at all.**

## Path 1 (preferred): ADMS / cloud push — no bridge process

Configure the device itself to push to the server. On the Identix/ZKTeco menu
look for **Comm → Cloud Server / ADMS / ADMS Server**:

- Server address: your PocketBase host (e.g. `attendance.example.com`)
- Server port: `443` (HTTPS) or `80`
- Enable "domain name" / "real-time upload" if present.

The server already handles the `iclock` protocol in `backend/pb_hooks/adms.pb.js`:

- `GET  /iclock/cdata`      — handshake
- `POST /iclock/cdata?...&table=ATTLOG` — punch upload (creates records)
- `GET  /iclock/getrequest` — command poll (no-op ACK)

**Authorize the device:** add a row to the `devices` collection with the
device's serial number and `active = true`. Optionally set `ADMS_SHARED_SECRET`
in the server env and configure the device to append `?secret=...`.

**Nightly shutdown check (important):** after wiring it up, test whether the
device *re-delivers* a punch made while the server was down (stop EC2, scan,
start EC2). If it does, you're done. If it doesn't, either narrow the shutdown
window to outside working hours, or use Path 2.

## Path 2 (fallback): LAN poller (`poller.py`)

Use only if the device can't push, or can't push reliably across the shutdown.
Runs on any always-on office machine (existing PC/NAS or a Raspberry Pi).

```bash
pip install -r requirements.txt
cp .env.example .env          # edit real values
set -a; source .env; set +a
python3 poller.py
```

It buffers punches locally (`STATE_FILE`) and drains them to
`POST /api/bridge/punch` (see `backend/pb_hooks/bridge.pb.js`) using a dedicated
**admin service account** — so nothing is lost while the server is down.

For production, install the systemd unit (`attendance-bridge.service`) so it
auto-starts and restarts.

## Mapping employees

Both paths map the device's numeric user id to an employee via the
`biometric_user_id` field on the `employees` record. Set it in the admin UI for
each person enrolled on the device. Unmapped ids are skipped (and logged).
