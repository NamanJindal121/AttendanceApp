// Shared attendance-status logic used by both the employee and admin calendars.
//
// Status is COMPUTED from raw attendance_records + the employee's schedule +
// office settings — nothing is stored. This keeps the biometric/app record the
// single source of truth and lets schedule/work-day changes apply retroactively.

// Local YYYY-MM-DD key for a Date (calendar days are local, not UTC).
export function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// "HH:MM" -> minutes since midnight, or null if unset/invalid.
function parseHHMM(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Group attendance records by local day. Returns { "YYYY-MM-DD": [records...] }.
export function groupByDay(records) {
  const byDay = {};
  for (const r of records) {
    const key = dayKey(new Date(r.timestamp));
    (byDay[key] ||= []).push(r);
  }
  return byDay;
}

// Compute a single day's status.
//   dateStr: "YYYY-MM-DD"
//   dayRecords: attendance records that fall on that day (any order)
//   employee: has scheduled_check_in / scheduled_check_out
//   settings: has work_days (array of 0-6) and late_grace_minutes
//   today: Date for "future day" detection
//
// Returns { status, late, noCheckout } where status is one of:
//   "present" | "absent" | "off" (non-working day) | "future" | "no-record-off"
export function dayStatus(dateStr, dayRecords, employee, settings, today) {
  const date = new Date(dateStr + "T00:00:00");
  const weekday = date.getDay(); // 0=Sun..6=Sat
  const workDays = Array.isArray(settings?.work_days)
    ? settings.work_days
    : [1, 2, 3, 4, 5, 6];
  const isWorkDay = workDays.includes(weekday);

  const records = dayRecords || [];
  const checkIns = records
    .filter((r) => r.type === "check_in")
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const checkOuts = records.filter((r) => r.type === "check_out");

  // Future day: don't judge it yet.
  const todayKey = dayKey(today);
  if (dateStr > todayKey) {
    return { status: "future", late: false, noCheckout: false };
  }

  if (checkIns.length > 0) {
    // Present. Late if the FIRST check-in is > grace minutes after schedule.
    let late = false;
    const sched = parseHHMM(employee?.scheduled_check_in);
    const grace = Number(settings?.late_grace_minutes ?? 10);
    if (sched !== null) {
      const first = new Date(checkIns[0].timestamp);
      const firstMin = first.getHours() * 60 + first.getMinutes();
      late = firstMin > sched + grace;
    }
    const noCheckout = checkOuts.length === 0;
    return { status: "present", late, noCheckout };
  }

  // No check-in: absent on a work day, neutral otherwise.
  return {
    status: isWorkDay ? "absent" : "off",
    late: false,
    noCheckout: false,
  };
}

// Build the weeks grid (array of weeks, each 7 cells; leading/trailing null pads)
// for a given year/month (month is 0-based). Weeks start on Sunday.
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
