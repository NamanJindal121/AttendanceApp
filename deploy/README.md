# Deployment (AWS EC2 + Nginx, nightly shutdown)

Target: a single small EC2 instance running PocketBase behind Nginx, that stops
overnight and starts before the workday. Data lives on the persistent EBS root
volume, so stop/start loses nothing.

## 1. Provision (once)

1. **Launch EC2** — Ubuntu 22.04, `t3.small` is plenty for <100 employees.
   Root EBS volume (gp3, 20 GB) holds `pb_data` (SQLite + selfies).
2. **Elastic IP** — allocate and associate it. **Critical:** stop/start changes
   the public IP; the Elastic IP keeps a stable address so the PWA bookmarks and
   the device/bridge keep working every morning.
3. **Security group** — inbound 80 + 443 from anywhere; 22 from your IP only.
   The biometric device pushes to 443, so it must be able to reach this host
   (device is on office LAN → needs outbound internet to the Elastic IP).
4. **DNS** — point an A record (`attendance.example.com`) at the Elastic IP.

## 2. Install the app

Copy the build artifacts to the instance and run the setup script:

```bash
# locally
cd frontend && npm run build && cd ..
scp -r backend/pocketbase backend/pb_hooks backend/pb_migrations \
       frontend/dist deploy/* ubuntu@<elastic-ip>:/tmp/app/

# on the instance
cd /tmp/app && sudo bash setup-ec2.sh attendance.example.com
sudo -u pocketbase /opt/attendance/pocketbase superuser create you@co.com 'strongpass' --dir=/opt/attendance/pb_data
```

Then set `ADMS_SHARED_SECRET` in `/etc/systemd/system/pocketbase.service` to a
real value (and configure the device to send it), and
`sudo systemctl restart pocketbase`.

## 3. Configure via admin UI

Visit `https://attendance.example.com/_/`, log in as superuser, then:
- **settings** — set `office_lat`/`office_lng` (the office), `radius_meters`
  (e.g. 150), `max_gps_accuracy_meters` (e.g. 75), `require_selfie`.
- **employees** — add staff; set each `biometric_user_id` to match the device.
- **devices** — add the biometric device's serial, `active = true`.
- Create one employee with `role = admin` to use the in-app admin screens, and a
  `bridge@svc.local` admin service account only if you use the poller (Path 2).

## 4. Nightly stop / start

Use **EventBridge Scheduler** with two schedules calling EC2 directly (no Lambda
needed — Scheduler can target `aws:ec2:stopInstances` / `startInstances`):

- **Stop** — e.g. `cron(0 22 * * ? *)` (22:00) → StopInstances.
- **Start** — e.g. `cron(30 7 ? * MON-FRI *)` (07:30, before the workday) →
  StartInstances.

Set times in your office timezone. **Start must precede the first check-in and
the first biometric punch of the day.** The device (ADMS) may drop punches while
the server is down — see the shutdown-safety check in `bridge/README.md`. The
poller (Path 2) buffers regardless.

> These schedule changes are infrastructure actions — apply them yourself in the
> AWS console/CLI with appropriate (non-production-Admin) credentials. This repo
> intentionally does not automate account-level changes.

## 5. Backups

Install `backup.sh` in cron (see the file header) to copy `pb_data` to S3
hourly during working hours. Test a restore before relying on it.

## Notes

- **TLS is mandatory**: geolocation + camera only work over HTTPS. certbot auto-
  renews; renewal only runs while the instance is up — the nightly-up window
  covers the twice-daily renewal check.
- **Single instance = downtime during stop**: acceptable here since check-ins
  only happen during the workday when the instance is up.
