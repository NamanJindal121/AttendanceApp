@echo off
echo === Pulling latest code ===
cd /d E:\attendance\repo
git pull

echo === Building frontend ===
cd frontend
call npm install
call npm run build

echo === Copying files to PocketBase ===
xcopy /E /I /Y dist E:\attendance\pb_public
xcopy /E /I /Y ..\backend\pb_hooks E:\attendance\pb_hooks

echo === Restarting Services ===
E:\attendance\nssm.exe restart AttendancePB
E:\attendance\nssm.exe restart AttendancePoller

echo === Done! ===
pause
