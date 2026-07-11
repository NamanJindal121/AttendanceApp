import { useMemo, useState } from "react";
import { dayKey, groupByDay, dayStatus, monthGrid, formatLateBy } from "./attendance";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// A month attendance calendar for one employee.
//   records:  that employee's attendance_records
//   employee: { scheduled_check_in, scheduled_check_out }
//   settings: { work_days, late_grace_minutes }
//   today:    a Date (defaults to now)
export default function Calendar({ records, employee, settings, today = new Date() }) {
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));

  const byDay = useMemo(() => groupByDay(records || []), [records]);
  const weeks = useMemo(
    () => monthGrid(cursor.year, cursor.month),
    [cursor]
  );

  const move = (delta) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  // Month summary counts (present / absent / late).
  const summary = useMemo(() => {
    let present = 0, absent = 0, late = 0;
    for (const week of weeks) {
      for (const cell of week) {
        if (!cell) continue;
        const key = dayKey(cell);
        const s = dayStatus(key, byDay[key], employee, settings, today);
        if (s.status === "present") {
          present++;
          if (s.late) late++;
        } else if (s.status === "absent") {
          absent++;
        }
      }
    }
    return { present, absent, late };
  }, [weeks, byDay, employee, settings, today]);

  const todayKey = dayKey(today);

  return (
    <div className="calendar">
      <div className="cal-head">
        <button className="link" onClick={() => move(-1)}>‹ Prev</button>
        <strong>{MONTHS[cursor.month]} {cursor.year}</strong>
        <button className="link" onClick={() => move(1)}>Next ›</button>
      </div>

      <div className="cal-summary">
        <span className="chip present">{summary.present} present</span>
        <span className="chip late">{summary.late} late</span>
        <span className="chip absent">{summary.absent} absent</span>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-dow">{w}</div>
        ))}
        {weeks.map((week, wi) =>
          week.map((cell, ci) => {
            if (!cell) return <div key={`${wi}-${ci}`} className="cal-cell empty" />;
            const key = dayKey(cell);
            const s = dayStatus(key, byDay[key], employee, settings, today);
            const classes = ["cal-cell", s.status];
            if (s.late) classes.push("is-late");
            if (key === todayKey) classes.push("is-today");
            return (
              <div key={key} className={classes.join(" ")} title={label(s)}>
                <span className="cal-daynum">{cell.getDate()}</span>
                {s.status === "present" && (
                  <span className="cal-tag">
                    {s.late ? formatLateBy(s.lateBy) : "Present"}
                    {s.noCheckout && <span className="cal-nocheckout" title="No check-out">*</span>}
                  </span>
                )}
                {s.status === "absent" && <span className="cal-tag">Absent</span>}
              </div>
            );
          })
        )}
      </div>

      <div className="cal-legend">
        <span><i className="dot present" /> Present</span>
        <span><i className="dot is-late" /> Late (&gt; grace)</span>
        <span><i className="dot absent" /> Absent</span>
        <span><i className="dot off" /> Non-working</span>
        <span>* = no check-out recorded</span>
      </div>
    </div>
  );
}

function label(s) {
  if (s.status === "present") {
    return (
      (s.late ? formatLateBy(s.lateBy) : "Present") +
      (s.noCheckout ? " — no check-out" : "")
    );
  }
  if (s.status === "absent") return "Absent";
  if (s.status === "off") return "Non-working day";
  if (s.status === "future") return "";
  return "";
}
