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
// Returns { status, late, lateBy, noCheckout } where status is one of:
//   "present" | "absent" | "off" (non-working day) | "future"
// and lateBy is the number of minutes past (scheduled + grace), 0 if on time.
export function dayStatus(dateStr, dayRecords, employee, settings, today) {
  const date = new Date(dateStr + "T00:00:00");
  const weekday = date.getDay(); // 0=Sun..6=Sat
  // Per-employee work_days override the office-wide default when set.
  const workDays = Array.isArray(employee?.work_days) && employee.work_days.length
    ? employee.work_days
    : Array.isArray(settings?.work_days)
      ? settings.work_days
      : [1, 2, 3, 4, 5, 6];
  const isWorkDay = workDays.includes(weekday);

  const records = dayRecords || [];
  // Sort ALL records by timestamp ascending to calculate exact time worked
  const sortedRecords = [...records].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const checkIns = sortedRecords.filter((r) => r.type === "check_in");
  const checkOuts = sortedRecords.filter((r) => r.type === "check_out");

  // Future day: don't judge it yet.
  const todayKey = dayKey(today);
  if (dateStr > todayKey) {
    return { status: "future", late: false, lateBy: 0, noCheckout: false, workedMinutes: 0, shortfall: false, halfDay: false };
  }

  if (checkIns.length > 0) {
    // Calculate total time worked
    let workedMinutes = 0;
    let currentIn = null;

    for (const r of sortedRecords) {
      if (r.type === "check_in") {
        if (!currentIn) currentIn = new Date(r.timestamp);
      } else if (r.type === "check_out") {
        if (currentIn) {
          const out = new Date(r.timestamp);
          workedMinutes += Math.floor((out - currentIn) / 60000);
          currentIn = null;
        }
      }
    }

    const noCheckout = checkOuts.length === 0 || currentIn !== null;

    // Check if freelancer mode (daily_hours > 0)
    const dailyHours = Number(employee?.daily_hours || 0);
    if (dailyHours > 0) {
      const shortfall = workedMinutes < (dailyHours * 60 - 15); // 15 minutes grace for freelancer
      // Half-day: worked less than half the daily commitment
      const halfDay = !noCheckout && workedMinutes < (dailyHours * 60 / 2);
      return { status: "present", late: false, lateBy: 0, noCheckout, workedMinutes, shortfall, halfDay, isFreelancer: true };
    }

    // Fixed Schedule Mode
    let lateBy = 0;
    const sched = parseHHMM(employee?.scheduled_check_in);
    const grace = Number(settings?.late_grace_minutes ?? 10);
    if (sched !== null) {
      const first = new Date(checkIns[0].timestamp);
      const firstMin = first.getHours() * 60 + first.getMinutes();
      // Minutes past the scheduled start (not counting grace) — used to display.
      const over = firstMin - sched;
      if (over > grace) lateBy = over;
    }

    // Half-day: last check-out is more than 1hr before scheduled check-out
    let halfDay = false;
    const schedOut = parseHHMM(employee?.scheduled_check_out);
    if (schedOut !== null && checkOuts.length > 0 && !noCheckout) {
      const lastOut = new Date(checkOuts[checkOuts.length - 1].timestamp);
      const lastOutMin = lastOut.getHours() * 60 + lastOut.getMinutes();
      if (schedOut - lastOutMin > 60) halfDay = true;
    }

    return { status: "present", late: lateBy > 0, lateBy, noCheckout, workedMinutes, shortfall: false, halfDay, isFreelancer: false };
  }

  // No check-in: absent on a work day, neutral otherwise.
  return {
    status: isWorkDay ? "absent" : "off",
    late: false,
    lateBy: 0,
    noCheckout: false,
    workedMinutes: 0,
    shortfall: false,
    halfDay: false,
    isFreelancer: Number(employee?.daily_hours || 0) > 0,
  };
}

// Format a lateBy minute count as "Late by 1h 15m" / "Late by 25m".
export function formatLateBy(minutes) {
  if (!minutes || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `Late by ${h}h${m > 0 ? " " + m + "m" : ""}`;
  return `Late by ${m}m`;
}

// Format worked minutes as "3h 15m"
export function formatWorkedTime(minutes) {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h${m > 0 ? " " + m + "m" : ""}`;
  return `${m}m`;
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

// The short text shown for a single day — used by both the month calendar cell
// and the consolidated report cell, so the two can never drift apart.
// Non-working and future days return "" and are styled by the caller.
export function statusText(s) {
  if (s.status === "present") {
    if (s.halfDay) return "Half day";
    if (s.isFreelancer) return formatWorkedTime(s.workedMinutes);
    return s.late ? formatLateBy(s.lateBy) : "Present";
  }
  if (s.status === "absent") return "Absent";
  return "";
}
