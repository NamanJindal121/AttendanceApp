# Operations Runbook — Attendance App

Everything you need to run, update, and troubleshoot the live app. Real values
for this deployment are filled in; swap them if anything changes.

| Thing | Value |
|-------|-------|
| App URL | https://attendance.jindal.biz.in |
| Admin dashboard (PocketBase) | https://attendance.jindal.biz.in/_/ |
| In-app admin (nicer UI) | https://attendance.jindal.biz.in/admin |
| Region | ap-south-1 (Mumbai) |
| SSH key file | `attendance-key.pem` |
| SSH user | `ubuntu` |
| Repo | https://github.com/NamanJindal121/AttendanceApp |
| App dir on server | `/opt/attendance` |
| Data dir (DB + selfies) | `/opt/attendance/pb_data` |
| Static web root | `/var/www/attendance` |
| Repo checkout on server | `~/AttendanceApp` (i.e. `/home/ubuntu/AttendanceApp`) |

---

## 1. Connect to the server (SSH)

From the AWS machine (PowerShell), in the folder holding `attendance-key.pem`:

```powershell
ssh -i attendance-key.pem ubuntu@attendance.jindal.biz.in
```

- First time from a new network you may need to fix key perms (Windows):
  ```powershell
  icacls attendance-key.pem /reset
  icacls attendance-key.pem /inheritance:r
  icacls attendance-key.pem /grant:r "$($env:USERNAME):(R)"
  ```
- To leave the server: `exit`

If SSH times out, the instance is probably **stopped** — see §7.

---

## 2. Deploy code changes (the everyday workflow)

Local: make changes → commit → push to GitHub. Then on the **server**:

```bash
cd ~/AttendanceApp
sudo bash deploy/update.sh
```

This pulls, rebuilds the frontend, redeploys static files, syncs hooks +
migrations, applies new migrations, and restarts PocketBase. Your data is never
touched.

> After a frontend change, **hard-refresh** the browser (Ctrl/Cmd+Shift+R) — the
> PWA service worker caches aggressively and may otherwise show the old app.

First time only (the update script must exist locally on the server):
```bash
cd ~/AttendanceApp && git pull
```

---

## 3. Superuser (PocketBase dashboard login)

```bash
# Create
sudo -u pocketbase /opt/attendance/pocketbase superuser create you@gmail.com 'strong-password' --dir=/opt/attendance/pb_data

# Change password / email
sudo -u pocketbase /opt/attendance/pocketbase superuser update you@gmail.com --password 'new-password' --dir=/opt/attendance/pb_data

# Delete
sudo -u pocketbase /opt/attendance/pocketbase superuser delete old@example.com --dir=/opt/attendance/pb_data
```

There is no email-based password reset (no mail server) — reset from here.

---

## 4. App configuration (no SSH needed)

Log into https://attendance.jindal.biz.in/_/ as a superuser:

- **settings** collection — office_lat, office_lng, radius_meters,
  max_gps_accuracy_meters, work_days, late_grace_minutes, require_selfie.
- **employees** — add staff; set `role` (make ≥1 `admin`), `biometric_user_id`,
  `scheduled_check_in/out`, per-employee `work_days`.
- **devices** — register the biometric device serial (for ADMS push).

Day-to-day management is nicer via the in-app admin at `/admin` (log in there as
an `employee` whose role is `admin`).

---

## 5. Biometric device secret (ADMS)

Only needed once you connect the fingerprint device. Set/rotate the shared
secret the device sends with its pushes:

```bash
# generate a secret (letters+digits only — avoid / & \)
openssl rand -hex 16

# set it (replace both the search value and new value as needed)
sudo sed -i 's/ADMS_SHARED_SECRET=change-me/ADMS_SHARED_SECRET=PASTE_SECRET_HERE/' /etc/systemd/system/pocketbase.service
sudo systemctl daemon-reload && sudo systemctl restart pocketbase

# to see the current value
grep ADMS_SHARED_SECRET /etc/systemd/system/pocketbase.service
```

Device pushes to: `https://attendance.jindal.biz.in/iclock/...` (see
`bridge/README.md`).

---

## 6. Service management (PocketBase + Nginx)

```bash
# PocketBase
sudo systemctl status pocketbase
sudo systemctl restart pocketbase
sudo journalctl -u pocketbase -f          # live logs (Ctrl+C to stop)

# Nginx
sudo systemctl status nginx
sudo nginx -t && sudo systemctl reload nginx   # test config, then reload
sudo tail -f /var/log/nginx/error.log
```

Quick health checks:
```bash
curl -sI https://attendance.jindal.biz.in | head -3
curl -s https://attendance.jindal.biz.in/api/health
```

---

## 7. Start / stop the instance (cost control)

The instance may be **stopped** to save money (SSH + site will be down while
stopped). The Elastic IP stays attached across stop/start, so the address and
DNS don't change.

**AWS Console:** EC2 → Instances → select `attendance` → Instance state →
Start / Stop.

The site is back ~1–2 min after Start (wait for Status checks 2/2). No redeploy
needed — PocketBase + Nginx auto-start on boot.

> Optional automatic nightly stop/start via EventBridge Scheduler is documented
> in `deploy/RUNBOOK.md` §6. Not set up yet.

---

## 8. Backups & restore

Data lives in `/opt/attendance/pb_data`. To back it up manually:

```bash
# On the server: snapshot the data dir to a timestamped archive in your home
sudo tar czf ~/pb_backup_$(date +%F).tar.gz -C /opt/attendance pb_data
```

Copy it off the server to your machine (run locally, PowerShell):
```powershell
scp -i attendance-key.pem ubuntu@attendance.jindal.biz.in:~/pb_backup_*.tar.gz .
```

Restore (stops the service, replaces data, restarts):
```bash
sudo systemctl stop pocketbase
sudo tar xzf ~/pb_backup_YYYY-MM-DD.tar.gz -C /opt/attendance
sudo chown -R pocketbase:pocketbase /opt/attendance/pb_data
sudo systemctl start pocketbase
```

For scheduled S3 backups, install the CLI (`sudo snap install aws-cli --classic`)
and use `deploy/backup.sh` — see `deploy/README.md`.

---

## 9. TLS certificate

Auto-renews via certbot (a systemd timer). It only renews while the instance is
up — the daily-up window covers the twice-daily check. To verify / force:

```bash
sudo certbot certificates          # show expiry
sudo certbot renew --dry-run       # test renewal
sudo systemctl reload nginx        # after a real renewal
```

---

## 10. Troubleshooting

| Symptom | Check |
|---------|-------|
| Site won't load at all | Instance stopped? (§7). Then `systemctl status nginx pocketbase`. |
| 502 Bad Gateway | PocketBase down: `sudo systemctl restart pocketbase`, then `journalctl -u pocketbase -e`. |
| Cert warning / not secure | `sudo certbot certificates`; renew (§9). |
| Old app after deploy | Hard-refresh (Ctrl/Cmd+Shift+R); service worker cache. |
| Check-in rejected everywhere | Office coords/radius in **settings**; check-ins need HTTPS (fine here). |
| Camera/location blocked | Browser permission prompt must be allowed; requires HTTPS. |
| Migration didn't apply | `sudo -u pocketbase /opt/attendance/pocketbase migrate up --dir=/opt/attendance/pb_data` then restart. |
| SSH "bad permissions" (Windows) | Re-run the `icacls` block in §1. |
| Locked out of dashboard | Reset superuser password (§3). |

Inspect the database directly if needed:
```bash
sudo -u pocketbase sqlite3 /opt/attendance/pb_data/data.db "SELECT email, role FROM employees;"
```
