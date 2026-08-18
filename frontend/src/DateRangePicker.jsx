import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { dayKey, monthGrid } from "./attendance";
import { PRESETS, midnight } from "./dateRanges";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

function prettyDate(key) {
  if (!key) return "—";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Two-month range picker with a preset rail, modelled on the reference design
// but using the app's own palette. `from`/`to` are local "YYYY-MM-DD" strings;
// onApply(from, to) fires only when Apply is pressed.
export default function DateRangePicker({ from, to, onApply }) {
  const today = useMemo(() => midnight(new Date()), []);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [preset, setPreset] = useState("custom");
  // Left-hand month of the pair; the right-hand one is always the next month.
  const [cursor, setCursor] = useState(() => {
    const [y, m] = (from || dayKey(today)).split("-").map(Number);
    return { year: y, month: m - 2 };
  });
  const popRef = useRef(null);

  // Reset the draft whenever the popover is (re)opened.
  useEffect(() => {
    if (!open) return;
    setStart(from);
    setEnd(to);
    setPreset("custom");
    const [y, m] = (from || dayKey(today)).split("-").map(Number);
    setCursor({ year: y, month: m - 2 });
  }, [open, from, to, today]);

  // Close on outside click / Escape without committing the draft.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const applyPreset = (p) => {
    const [a, b] = p.range(today);
    setStart(dayKey(a));
    setEnd(dayKey(b));
    setPreset(p.key);
    setCursor({ year: b.getFullYear(), month: b.getMonth() - 1 });
  };

  // First click (or a click on a completed range) starts a new selection;
  // the second click closes it, swapping if the user picked backwards.
  const pickDay = (cellKey) => {
    setPreset("custom");
    if (!start || (start && end)) {
      setStart(cellKey);
      setEnd("");
      return;
    }
    if (cellKey < start) {
      setEnd(start);
      setStart(cellKey);
    } else {
      setEnd(cellKey);
    }
  };

  const move = (delta) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const commit = () => {
    if (!start) return;
    onApply(start, end || start);
    setOpen(false);
  };

  const todayKey = dayKey(today);

  const renderMonth = (year, month) => {
    const d = new Date(year, month, 1);
    const y = d.getFullYear();
    const mo = d.getMonth();
    return (
      <div className="drp-month" key={`${y}-${mo}`}>
        <div className="drp-month-name">{MONTHS[mo]} {y}</div>
        <div className="drp-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="drp-dow">{w}</div>
          ))}
          {monthGrid(y, mo).map((week, wi) =>
            week.map((cell, ci) => {
              if (!cell) return <div key={`${wi}-${ci}`} className="drp-day empty" />;
              const key = dayKey(cell);
              const future = key > todayKey;
              const isStart = key === start;
              const isEnd = key === end;
              const inRange = start && end && key > start && key < end;
              const cls = ["drp-day"];
              if (future) cls.push("disabled");
              if (isStart || isEnd) cls.push("selected");
              if (isStart && end) cls.push("range-start");
              if (isEnd && start !== end) cls.push("range-end");
              if (inRange) cls.push("in-range");
              return (
                <button
                  type="button"
                  key={key}
                  className={cls.join(" ")}
                  disabled={future}
                  onClick={() => pickDay(key)}
                >
                  {cell.getDate()}
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="drp" ref={popRef}>
      <button type="button" className="drp-trigger" onClick={() => setOpen((o) => !o)}>
        <CalendarDays />
        {prettyDate(from)} – {prettyDate(to)}
      </button>

      {open && (
        <div className="drp-pop">
          <div className="drp-rail">
            <div className={`drp-preset${preset === "custom" ? " active" : ""}`}>
              Custom
            </div>
            {PRESETS.map((p) => (
              <button
                type="button"
                key={p.key}
                className={`drp-preset${preset === p.key ? " active" : ""}`}
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="drp-main">
            <div className="drp-inputs">
              <div className="drp-input">
                <span>Start date</span>
                <strong>{prettyDate(start)}</strong>
              </div>
              <span className="drp-dash">–</span>
              <div className="drp-input">
                <span>End date</span>
                <strong>{prettyDate(end)}</strong>
              </div>
            </div>

            <div className="drp-months">
              <button type="button" className="drp-nav prev" onClick={() => move(-1)} title="Previous month">
                <ChevronLeft />
              </button>
              {renderMonth(cursor.year, cursor.month)}
              {renderMonth(cursor.year, cursor.month + 1)}
              <button type="button" className="drp-nav next" onClick={() => move(1)} title="Next month">
                <ChevronRight />
              </button>
            </div>

            <div className="drp-actions">
              <button type="button" className="ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" onClick={commit} disabled={!start}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
