# Self-Host Guide — Windows office PC + Cloudflare Tunnel (₹0/year)

Runs the whole app on one always-on Windows PC at the office, exposed to the
internet over HTTPS with **no public IP, no port forwarding, and no monthly
bill**. The biometric device talks to the same PC over the office LAN.

```
[Fingerprint device] ──LAN 192.168.x.x:4370──► [Office Windows PC]
                                                 ├─ PocketBase.exe  (app + DB, as a service)
                                                 ├─ poller (pulls punches over LAN)
                                                 └─ cloudflared     (outbound tunnel, as a service)
                                                        │  outbound HTTPS
                                                        ▼
                                                  [Cloudflare]  ──► employees' phones
                                              attendance.jindal.biz.in
```

Why no Elastic IP: `cloudflared` dials **out** to Cloudflare and holds the
connection open; visitors hit Cloudflare's servers, which push traffic down the
tunnel. Nothing connects *in* to the PC, so no public address/ports are needed.

---

## Part 1 — Move jindal.biz.in DNS to Cloudflare (one-time, free)

> This is a **nameserver change, NOT a registrar transfer** — it does not cost
> anything, does not renew the domain, and does not change ownership. Your Vercel
> *hosting* is untouched; only who answers DNS changes.

**Registrar (where you change nameservers):** WWW INFOTECH LLP — www.w3infotech.com
**Current nameservers:** ns1/ns2.vercel-dns.com (Vercel is current DNS host)
**Other things live on this domain (must be preserved):** root, `www`, `api`,
`app` all point to Vercel. `attendance` currently points to the old AWS IP.

1. Create a free account at https://dash.cloudflare.com → **Add a site** →
   enter `jindal.biz.in` → choose the **Free** plan.
2. Cloudflare **auto-scans** existing DNS records. When it finishes, **carefully
   compare** the imported list against what Vercel currently has. Ensure these
   are present (root + subdomains pointing at Vercel), all set to **DNS only**
   (grey cloud, NOT orange) so Vercel keeps serving them:
   - `jindal.biz.in`  A → `216.198.79.65` and `64.29.17.65`
   - `www`  CNAME → `cname.vercel-dns.com`
   - `api`  (whatever Vercel shows)
   - `app`  (whatever Vercel shows)
   - any others Vercel lists — add anything the scan missed.
   > Double-check in the Vercel dashboard's DNS page for the authoritative list
   > before continuing. Missing a record = that subdomain goes down.
3. **Delete** the old `attendance` A record (→ 13.200.245.102, the dead AWS IP).
   We'll recreate it via the tunnel in Part 4.
4. Cloudflare shows two nameservers like `xxx.ns.cloudflare.com`. Log in to the
   **registrar (WWW Infotech panel)** and replace the Vercel nameservers with
   Cloudflare's two. Save.
5. Wait for Cloudflare to show the domain as **Active** (minutes to a few hours).
   Your Vercel sites keep working throughout as long as the records match.

---

## Part 2 — Install PocketBase as a Windows service

On the office PC:

1. Download the **Windows** PocketBase build (v0.28.4) from
   https://github.com/pocketbase/pocketbase/releases → unzip to `E:\attendance\`
   so you have `E:\attendance\pocketbase.exe`.
2. Get the app code (hooks + migrations). Easiest: install Git for Windows, then:
   ```powershell
   cd E:\attendance
   git clone https://github.com/NamanJindal121/AttendanceApp.git repo
   ```
   Copy `repo\backend\pb_hooks` and `repo\backend\pb_migrations` next to the exe:
   ```powershell
   xcopy /E /I repo\backend\pb_hooks E:\attendance\pb_hooks
   xcopy /E /I repo\backend\pb_migrations E:\attendance\pb_migrations
   ```
3. Build the frontend and have PocketBase serve it (so it's one process):
   ```powershell
   cd E:\attendance\repo\frontend
   npm install ; npm run build
   xcopy /E /I dist E:\attendance\pb_public
   ```
   (PocketBase automatically serves static files placed in `pb_public\`.)
4. Apply migrations and create your admin:
   ```powershell
   cd E:\attendance
   .\pocketbase.exe migrate up
   .\pocketbase.exe superuser create you@gmail.com "strong-password"
   ```
5. Install as an always-on service so it survives reboots/logout. Use
   [NSSM](https://nssm.cc/download) (unzip, put `nssm.exe` in `E:\attendance`):
   ```powershell
   E:\attendance\nssm.exe install AttendancePB E:\attendance\pocketbase.exe "serve --http=127.0.0.1:8090"
   E:\attendance\nssm.exe set AttendancePB AppDirectory E:\attendance
   E:\attendance\nssm.exe set AttendancePB Start SERVICE_AUTO_START
   E:\attendance\nssm.exe start AttendancePB
   ```
   Verify: open http://127.0.0.1:8090/_/ in the PC's browser.

---

## Part 3 — Install cloudflared as a Windows service (the tunnel)

1. Download `cloudflared` for Windows (cloudflared-windows-amd64.exe) from
   https://github.com/cloudflare/cloudflared/releases → save as
   `E:\attendance\cloudflared.exe`.
2. Authenticate it to your Cloudflare account:
   ```powershell
   E:\attendance\cloudflared.exe tunnel login
   ```
   (opens a browser; pick `jindal.biz.in`.)
3. Create the tunnel and route the hostname to local PocketBase:
   ```powershell
   E:\attendance\cloudflared.exe tunnel create attendance
   E:\attendance\cloudflared.exe tunnel route dns attendance attendance.jindal.biz.in
   ```
   The `route dns` command auto-creates the CNAME in Cloudflare pointing
   `attendance.jindal.biz.in` into the tunnel.
4. Create a config file `C:\Users\<you>\.cloudflared\config.yml`:
   ```yaml
   tunnel: attendance
   credentials-file: C:\Users\<you>\.cloudflared\<TUNNEL-ID>.json
   ingress:
     - hostname: attendance.jindal.biz.in
       service: http://127.0.0.1:8090
     - service: http_status:404
   ```
   (The tunnel ID + json path are printed by `tunnel create`.)
5. Install it as a service so the tunnel is always up:
   ```powershell
   E:\attendance\cloudflared.exe service install
   ```
6. Test: from any phone/browser, open **https://attendance.jindal.biz.in** — the
   login page should load with a valid padlock (Cloudflare provides the cert).

---

## Part 4 — Windows power settings (so it's truly always-on)

- **Control Panel → Power Options →** set plan to **Never** sleep; disable
  "Turn off hard disk."
- **BIOS/UEFI:** enable **"Restore on AC Power Loss" / "AC Back = Power On"** so
  the PC reboots itself after a power cut. Services auto-start, so the app + tunnel
  come back with no human involvement.
- Disable automatic-restart-only Windows Updates outside work hours if possible.

---

## Part 5 — Biometric device (no ADMS needed)

Because PocketBase runs on this same PC, the poller talks to the device over the
LAN and writes to `localhost` — the simplest possible path.

1. Give the fingerprint device a static LAN IP (e.g. `192.168.1.201`), confirm
   the PC can reach it on port 4370.
2. Install Python for Windows, then:
   ```powershell
   cd E:\attendance\repo\bridge
   pip install -r requirements.txt
   ```
3. Set env vars (device IP, `PB_URL=http://127.0.0.1:8090`, the bridge service
   account creds) per `bridge/.env.example`, and run `poller.py`. Install it as a
   service with NSSM the same way as PocketBase so it runs 24/7.
4. Map each employee's device user id to `biometric_user_id` in the admin UI.

There is **no nightly-shutdown data-loss problem here** — the PC runs
continuously and the poller buffers locally regardless.

---

## Part 6 — Backups (your responsibility now)

Data lives in `E:\attendance\pb_data`. Automate a daily copy off the PC:

1. Simple local + cloud copy via a scheduled task. Example PowerShell
   (`E:\attendance\backup.ps1`):
   ```powershell
   $stamp = Get-Date -Format "yyyy-MM-dd"
   Compress-Archive -Path E:\attendance\pb_data\* -DestinationPath "E:\attendance\backups\pb_$stamp.zip" -Force
   # then copy E:\attendance\backups to a synced folder (OneDrive/Google Drive/USB)
   ```
2. **Task Scheduler** → Create task → daily at, say, 21:00 → action:
   `powershell -File E:\attendance\backup.ps1`. Point the backups folder at a
   cloud-synced directory so a disk failure isn't catastrophic.

---

## Updating later

```powershell
cd E:\attendance\repo
git pull
cd frontend ; npm install ; npm run build
xcopy /E /I /Y dist E:\attendance\pb_public
xcopy /E /I /Y ..\backend\pb_hooks E:\attendance\pb_hooks
xcopy /E /I /Y ..\backend\pb_migrations E:\attendance\pb_migrations
cd E:\attendance
.\pocketbase.exe migrate up
nssm restart AttendancePB
```

---

## Trade-offs vs AWS (know what you're accepting)

- **Uptime = the office PC + its internet.** App is down if the PC is off or the
  office loses connectivity. Fine here: attendance happens at the office anyway.
- **Backups are on you** (Part 6) — AWS didn't do them either, but there's no
  cloud disk redundancy now.
- **Cost: ₹0/year** beyond the domain you already own and electricity.
- Cloudflare Tunnel + PocketBase + poller all run on one machine; the biometric
  device integration is simpler than the cloud version (LAN-local, no ADMS).
```
