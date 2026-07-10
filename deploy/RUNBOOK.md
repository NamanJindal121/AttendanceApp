# AWS Deployment Runbook

Step-by-step to deploy the Attendance app to a single EC2 instance behind Nginx
with HTTPS and a nightly stop/start. Run everything from your AWS machine.

Replace these placeholders throughout:
- `attendance.mycompany.com` → your real domain
- `<REGION>` → e.g. `ap-south-1` (Mumbai, closest to Hyderabad)
- `<KEYPAIR>` → your EC2 SSH key pair name

---

## Step 0 — (nothing to prep locally)

The code is on GitHub and `setup-ec2.sh` clones + builds everything on the
instance in Step 4. No local bundling needed.

---

## Step 1 — Launch the EC2 instance

Console → EC2 → Launch instance:
- **Name:** attendance
- **AMI:** Ubuntu Server 24.04 LTS
- **Type:** t3.small
- **Key pair:** `<KEYPAIR>`
- **Network / Security group:** create one allowing inbound:
  - SSH (22) — **My IP** only
  - HTTP (80) — Anywhere
  - HTTPS (443) — Anywhere
- **Storage:** 20 GB gp3
- Launch.

Or via CLI (adjust AMI id for your region):
```bash
aws ec2 create-security-group --group-name attendance-sg \
  --description "Attendance app" --region <REGION>
# note the GroupId, then:
aws ec2 authorize-security-group-ingress --group-name attendance-sg \
  --protocol tcp --port 443 --cidr 0.0.0.0/0 --region <REGION>
aws ec2 authorize-security-group-ingress --group-name attendance-sg \
  --protocol tcp --port 80 --cidr 0.0.0.0/0 --region <REGION>
aws ec2 authorize-security-group-ingress --group-name attendance-sg \
  --protocol tcp --port 22 --cidr $(curl -s ifconfig.me)/32 --region <REGION>
```

---

## Step 2 — Allocate + associate an Elastic IP (important)

A stopped instance loses its public IP on restart. The Elastic IP keeps the
address stable so DNS, the PWA, and the biometric device keep working every day.

Console → EC2 → Elastic IPs → Allocate → then Associate with the instance.

CLI:
```bash
aws ec2 allocate-address --domain vpc --region <REGION>       # note AllocationId + PublicIp
aws ec2 associate-address --instance-id <INSTANCE_ID> \
  --allocation-id <ALLOCATION_ID> --region <REGION>
```

---

## Step 3 — Point DNS at the Elastic IP

At your domain registrar / DNS host, add an **A record**:
- Host: `attendance` (for attendance.mycompany.com) or `@`
- Value: the Elastic IP from Step 2
- TTL: 300

Wait until it resolves (check: `dig +short attendance.mycompany.com` returns the IP).
TLS in Step 5 will fail until this resolves.

---

## Step 4 — SSH in, clone, and run setup

```bash
ssh -i <KEYPAIR>.pem ubuntu@<ELASTIC_IP>
```

On the instance:
```bash
git clone https://github.com/NamanJindal121/AttendanceApp.git
cd AttendanceApp
sudo bash deploy/setup-ec2.sh attendance.mycompany.com
```

The script installs Nginx + Node, **builds the frontend**, downloads the Linux
PocketBase binary, applies migrations, deploys the static app, obtains a Let's
Encrypt cert, and starts everything. Watch its output — it prints the next two
commands (device secret + superuser) at the end.

---

## Step 5 — Finish configuration

Still on the instance:
```bash
# 1) Set the biometric-device shared secret (any strong random string)
sudo sed -i 's/ADMS_SHARED_SECRET=change-me/ADMS_SHARED_SECRET=<STRONG_SECRET>/' \
  /etc/systemd/system/pocketbase.service
sudo systemctl daemon-reload && sudo systemctl restart pocketbase

# 2) Create the first superuser (admin dashboard login)
sudo -u pocketbase /opt/attendance/pocketbase superuser create \
  you@company.com 'a-strong-password' --dir=/opt/attendance/pb_data
```

Then in a browser: **https://attendance.mycompany.com/_/** → log in →
- **settings**: set office_lat/lng, radius_meters (e.g. 150),
  max_gps_accuracy_meters (e.g. 75), require_selfie.
- **employees**: add staff; set `role` and `biometric_user_id`. Make at least one
  `role = admin` for the in-app admin screens.

Visit **https://attendance.mycompany.com/** and test a real login + check-in.

---

## Step 6 — Nightly stop / start (EventBridge Scheduler)

Create an IAM role EventBridge can assume to stop/start EC2 (once):
```bash
# Trust policy
cat > trust.json <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Principal":{"Service":"scheduler.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
aws iam create-role --role-name attendance-scheduler \
  --assume-role-policy-document file://trust.json
# Permission to start/stop this instance
cat > perm.json <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Action":["ec2:StartInstances","ec2:StopInstances"],"Resource":"*"}]}
JSON
aws iam put-role-policy --role-name attendance-scheduler \
  --policy-name startstop --policy-document file://perm.json
```

Create the two schedules (times are UTC — the examples below are for IST, which
is UTC+5:30, so 22:00 IST = 16:30 UTC, 07:30 IST = 02:00 UTC):
```bash
ROLE_ARN=$(aws iam get-role --role-name attendance-scheduler --query 'Role.Arn' --output text)

# STOP at 22:00 IST (16:30 UTC) daily
aws scheduler create-schedule --name attendance-stop --region <REGION> \
  --schedule-expression 'cron(30 16 * * ? *)' \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target "{\"Arn\":\"arn:aws:scheduler:::aws-sdk:ec2:stopInstances\",\"RoleArn\":\"${ROLE_ARN}\",\"Input\":\"{\\\"InstanceIds\\\":[\\\"<INSTANCE_ID>\\\"]}\"}"

# START at 07:30 IST (02:00 UTC) Mon–Fri
aws scheduler create-schedule --name attendance-start --region <REGION> \
  --schedule-expression 'cron(0 2 ? * MON-FRI *)' \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target "{\"Arn\":\"arn:aws:scheduler:::aws-sdk:ec2:startInstances\",\"RoleArn\":\"${ROLE_ARN}\",\"Input\":\"{\\\"InstanceIds\\\":[\\\"<INSTANCE_ID>\\\"]}\"}"
```

**Start must be before the first check-in of the day.** Adjust the cron to your
office hours. TLS auto-renew (certbot) runs only while the instance is up — the
daily-up window covers it.

---

## Step 7 — Backups (optional but recommended)

```bash
# Create an S3 bucket, edit backup.sh's BUCKET var, then cron it on the instance:
sudo cp /tmp/deploy/backup.sh /opt/attendance/backup.sh
sudo chmod +x /opt/attendance/backup.sh
# hourly during working hours (edit BUCKET in the file first):
( sudo crontab -l 2>/dev/null; echo "0 9-19 * * 1-5 /opt/attendance/backup.sh >> /var/log/attendance-backup.log 2>&1" ) | sudo crontab -
```
(The instance needs an IAM role or `aws configure` creds allowing `s3:PutObject`.)

---

## Verify

- `https://attendance.mycompany.com/` loads with a valid padlock.
- Login + check-in works from a phone on-site (rejected off-site).
- Admin dashboard reachable at `/_/`.
- Stop then start the instance (console) → Elastic IP unchanged, data intact,
  HTTPS still valid.

Once this is live, do the biometric device integration (bridge/README.md) — the
device pushes to `https://attendance.mycompany.com/iclock/...`.
