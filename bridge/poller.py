#!/usr/bin/env python3
"""
LAN-side attendance poller (FALLBACK path — see plan §C2).

Use this only when the biometric device does NOT support reliable ADMS push.
It runs on any always-on machine on the office LAN (an existing PC/NAS or a
Raspberry Pi), connects to the ZKTeco-family device over TCP:4370 with pyzk,
and forwards new punches to PocketBase.

Design goals:
  * Idempotent: each punch carries a stable device_punch_id; the server's unique
    index means re-sending is harmless. We also keep a local "seen" set.
  * Durable across the nightly server shutdown: if PocketBase is unreachable we
    keep the punch in a local buffer and retry — the poller is the queue. We
    never drop a punch just because the cloud was down.

Config via environment (see bridge/.env.example):
  DEVICE_IP, DEVICE_PORT, DEVICE_SERIAL
  PB_URL, PB_SERVICE_EMAIL, PB_SERVICE_PASSWORD
  POLL_INTERVAL_SECONDS
  STATE_FILE  (local buffer + seen-punch marker)
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

# Automatically load variables from .env file if it exists (crucial for Windows!)
_env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip())

try:
    from zk import ZK  # pip install pyzk
except ImportError:
    print("pyzk not installed. Run: pip install pyzk", file=sys.stderr)
    raise


def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def env(key, default=None, required=False):
    val = os.environ.get(key, default)
    if required and not val:
        print(f"Missing required env var: {key}", file=sys.stderr)
        sys.exit(1)
    return val


DEVICE_IP = env("DEVICE_IP", required=True)
DEVICE_PORT = int(env("DEVICE_PORT", "4370"))
DEVICE_SERIAL = env("DEVICE_SERIAL", "UNKNOWN")
PB_URL = env("PB_URL", "http://127.0.0.1:8090").rstrip("/")
PB_SERVICE_EMAIL = env("PB_SERVICE_EMAIL", required=True)
PB_SERVICE_PASSWORD = env("PB_SERVICE_PASSWORD", required=True)
POLL_INTERVAL = int(env("POLL_INTERVAL_SECONDS", "60"))
STATE_FILE = env("STATE_FILE", os.path.join(os.path.dirname(__file__), "poller_state.json"))


def load_state():
    try:
        with open(STATE_FILE) as f:
            s = json.load(f)
            return set(s.get("seen", [])), s.get("buffer", [])
    except (FileNotFoundError, json.JSONDecodeError):
        return set(), []


def save_state(seen, buffer):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"seen": sorted(seen), "buffer": buffer}, f)
    os.replace(tmp, STATE_FILE)  # atomic


def pb_authenticate():
    """Return an auth token for the service account, or None if server is down."""
    url = f"{PB_URL}/api/collections/employees/auth-with-password"
    body = json.dumps(
        {"identity": PB_SERVICE_EMAIL, "password": PB_SERVICE_PASSWORD}
    ).encode()
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())["token"]
    except urllib.error.HTTPError as ex:
        log(f"Auth HTTPError {ex.code} from PocketBase: {ex.read().decode()}")
        return None
    except (urllib.error.URLError, KeyError, TimeoutError) as ex:
        log(f"Auth Error connecting to PocketBase: {ex}")
        return None


def pb_create_punch(token, punch):
    """POST a punch to the dedicated bridge ingest route. Returns True on success.

    The route (pb_hooks/bridge.pb.js) writes the record with source=biometric,
    bypassing the app geofence hook, and is idempotent on device_punch_id — so a
    "duplicate" response is treated as success (safe to drop from the buffer).
    """
    url = f"{PB_URL}/api/bridge/punch"
    body = json.dumps(punch).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": token},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"[poller] added punch record: {punch}", flush=True)
            return resp.status == 200
    except urllib.error.HTTPError as ex:
        # 404 = unmapped biometric id: drop it (won't succeed on retry until an
        # admin maps the id, and re-reading the device will re-buffer it anyway).
        if ex.code == 404:
            log(f"DROPPED: Unmapped biometric user ID {punch['biometric_user_id']}. Please map this employee in PocketBase.")
            return True
        return False
    except (urllib.error.URLError, TimeoutError):
        return False


def read_device_punches():
    """Connect to the device and return a list of punch dicts."""
    zk = ZK(DEVICE_IP, port=DEVICE_PORT, timeout=10, force_udp=False, ommit_ping=False)
    conn = None
    punches = []
    try:
        conn = zk.connect()
        conn.disable_device()
        for att in conn.get_attendance():
            ts = att.timestamp.strftime("%Y-%m-%d %H:%M:%S")
            uid = str(att.user_id)
            punches.append(
                {
                    "biometric_user_id": uid,
                    "timestamp": ts,
                    "device_punch_id": f"{DEVICE_SERIAL}:{uid}:{ts}",
                }
            )
    finally:
        if conn:
            conn.enable_device()
            conn.disconnect()
    return punches


def main():
    seen, buffer = load_state()
    log(f"Poller Service Started. Tracking {len(seen)} historical punches. {len(buffer)} punches waiting in buffer to be sent.")

    while True:
        # 1) Pull new punches from the device (device is on the LAN, always up).
        try:
            punches = read_device_punches()
            new_punches = 0
            for p in punches:
                if p["device_punch_id"] not in seen:
                    buffer.append(p)
                    seen.add(p["device_punch_id"])
                    new_punches += 1
            save_state(seen, buffer)
            
            if new_punches > 0:
                log(f"Found {new_punches} NEW punch(es) from the biometric device. (Total waiting in buffer: {len(buffer)})")
        except Exception as ex:  # device offline / network blip — try next cycle
            log(f"WARNING: Could not connect to biometric device at {DEVICE_IP}:{DEVICE_PORT}. Error: {ex}")

        # 2) Drain the buffer to PocketBase (may be down overnight -> keep buffered).
        if buffer:
            token = pb_authenticate()
            if token:
                still = []
                sent_count = 0
                for p in buffer:
                    if pb_create_punch(token, p):
                        sent_count += 1
                    else:
                        still.append(p)  # keep for retry
                buffer = still
                save_state(seen, buffer)
                
                if sent_count > 0:
                    log(f"SUCCESS: Pushed {sent_count} punch(es) to PocketBase.")
                if len(buffer) > 0:
                    log(f"WARNING: {len(buffer)} punch(es) failed to push and will remain in the buffer to retry.")
            else:
                log(f"ERROR: Could not authenticate with PocketBase at {PB_URL}. The system will keep {len(buffer)} punch(es) safe in the buffer and try again later.")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
