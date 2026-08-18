import { useEffect, useMemo, useState } from "react";
import { Search, Download, Table2, List } from "lucide-react";
import { pb } from "../../pb";
import DateRangePicker from "../../DateRangePicker";
import { dayKey, dayStatus, groupByDay, statusText } from "../../attendance";
import { daysInRange } from "../../dateRanges";

// Local calendar day for a Date. Deliberately NOT toISOString(), which is UTC
// and rolls the date back a day for anyone east of Greenwich.
const isoDate = (d) => dayKey(d);

const csvRow = (cells) =>
  cells
    .map((c) => {
      const v = c == null ? "" : String(c);
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    })
    .join(",");

const download = (name, text) => {
  const blob = new Blob([text], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

export default function Report() {
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("log"); // "log" | "matrix"

  const load = async (f = from, t = to) => {
    setLoading(true);
    try {
      // Inclusive range: from 00:00:00 to 23:59:59 of the selected days.
      const filter = `timestamp >= "${f} 00:00:00" && timestamp <= "${t} 23:59:59"`;
      const [items, emps, sets] = await Promise.all([
        pb.collection("attendance_records").getFullList({
          filter,
          sort: "-timestamp",
          expand: "employee",
        }),
        pb.collection("employees").getFullList({
          filter: "active = true",
          sort: "full_name",
        }),
        pb.collection("settings").getFullList({ limit: 1 }),
      ]);
      setRows(items);
      setEmployees(emps);
      setSettings(sets[0] || null);
    } catch (_) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyRange = (f, t) => {
    setFrom(f);
    setTo(t);
    load(f, t);
  };

  const dates = useMemo(() => daysInRange(from, to), [from, to]);

  // employeeId -> { "YYYY-MM-DD": dayStatus } for the whole range. Uses the
  // same dayStatus() the month calendar uses, so the values match exactly.
  const matrix = useMemo(() => {
    if (!settings) return [];
    const byEmp = {};
    for (const r of rows) {
      (byEmp[r.employee] ||= []).push(r);
    }
    const today = new Date();
    return employees.map((emp) => {
      const byDay = groupByDay(byEmp[emp.id] || []);
      return {
        employee: emp,
        cells: dates.map((d) => ({
          date: d,
          status: dayStatus(d, byDay[d], emp, settings, today),
        })),
      };
    });
  }, [rows, employees, settings, dates]);

  const exportCsv = () => {
    if (view === "matrix") {
      const header = csvRow(["Employee", ...dates]);
      const lines = matrix.map((r) =>
        csvRow([
          r.employee.full_name,
          ...r.cells.map((c) => {
            const s = c.status;
            if (s.status === "off") return "Off";
            if (s.status === "future") return "";
            return statusText(s) + (s.noCheckout ? " *" : "");
          }),
        ])
      );
      download(`attendance_consolidated_${from}_${to}.csv`, [header, ...lines].join("\n"));
      return;
    }
    const header = csvRow(["employee", "type", "timestamp", "source", "flagged"]);
    const lines = rows.map((r) =>
      csvRow([
        r.expand?.employee?.full_name || r.employee,
        r.type,
        r.timestamp,
        r.source,
        r.flagged,
      ])
    );
    download(`attendance_${from}_${to}.csv`, [header, ...lines].join("\n"));
  };

  const empty = view === "matrix" ? matrix.length === 0 : rows.length === 0;

  return (
    <div className="pad">
      <div className="filters">
        <DateRangePicker from={from} to={to} onApply={applyRange} />
        <button onClick={() => load()} disabled={loading}>
          <Search /> {loading ? "…" : "Refresh"}
        </button>
        <button onClick={() => setView(view === "log" ? "matrix" : "log")}>
          {view === "log" ? <><Table2 /> Consolidated report</> : <><List /> Punch log</>}
        </button>
        <button onClick={exportCsv} disabled={empty}>
          <Download /> Export CSV
        </button>
      </div>

      {view === "matrix" ? (
        <ConsolidatedTable matrix={matrix} dates={dates} loading={loading} />
      ) : (
        <PunchLog rows={rows} />
      )}
    </div>
  );
}

// Employees down the side, every day in the range across the top. Each cell
// carries the same text and colour as that day in the employee's calendar.
function ConsolidatedTable({ matrix, dates, loading }) {
  if (!loading && matrix.length === 0) {
    return <p className="muted">No active employees to report on.</p>;
  }
  return (
    <>
      <div className="table-wrap">
        <table className="table matrix">
          <thead>
            <tr>
              <th className="sticky-col">Employee</th>
              {dates.map((d) => {
                const [y, m, day] = d.split("-").map(Number);
                const dt = new Date(y, m - 1, day);
                return (
                  <th key={d} className="matrix-date">
                    <span className="matrix-dow">
                      {dt.toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                    <span>{dt.getDate()}/{m}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.employee.id}>
                <td className="sticky-col">{row.employee.full_name}</td>
                {row.cells.map((c) => {
                  const s = c.status;
                  const cls = ["matrix-cell", s.status];
                  if (s.late) cls.push("is-late");
                  if (s.halfDay) cls.push("is-half-day");
                  if (s.shortfall) cls.push("is-shortfall");
                  return (
                    <td key={c.date} className={cls.join(" ")} title={c.date}>
                      {statusText(s)}
                      {s.noCheckout && <span className="cal-nocheckout" title="No check-out">*</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cal-legend">
        <span><i className="dot present" /> Present</span>
        <span><i className="dot is-late" /> Late</span>
        <span><i className="dot is-half-day" /> Half day</span>
        <span><i className="dot absent" /> Absent</span>
        <span><i className="dot off" /> Non-working</span>
        <span>* = no check-out recorded</span>
      </div>
    </>
  );
}

function PunchLog({ rows }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Type</th>
            <th>Time</th>
            <th>Source</th>
            <th>Photo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.flagged ? "flagged-row" : ""}>
              <td>{r.expand?.employee?.full_name || r.employee}</td>
              <td>{r.type === "check_in" ? "IN" : "OUT"}</td>
              <td>{new Date(r.timestamp).toLocaleString()}</td>
              <td>
                <span className={`source ${r.source}`}>{r.source}</span>
                {r.flagged && <span className="flag">flagged</span>}
              </td>
              <td>
                {r.selfie ? (
                  <a href={pb.files.getURL(r, r.selfie)} target="_blank" rel="noreferrer">
                    <img
                      className="selfie-thumb"
                      src={pb.files.getURL(r, r.selfie, { thumb: "100x100" })}
                      alt="check-in selfie"
                    />
                  </a>
                ) : (
                  <span className="muted-inline">—</span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">No records in range.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
