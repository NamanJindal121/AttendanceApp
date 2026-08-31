import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Download, FileDown, Table2, List, Building2 } from "lucide-react";
import { pb } from "../../pb";
import DateRangePicker from "../../DateRangePicker";
import { dayKey, dayStatus, groupByDay, statusText } from "../../attendance";
import { daysInRange } from "../../dateRanges";

// Local calendar day for a Date. Deliberately NOT toISOString(), which is UTC
// and rolls the date back a day for anyone east of Greenwich.
const isoDate = (d) => dayKey(d);

// PocketBase stores and compares timestamps in UTC, so a local calendar day
// has to be converted before it goes into a filter. Pasting the local date in
// raw offsets every boundary by the timezone — in IST that hides a punch made
// between 00:00 and 05:29 from its own day.
const utcBound = (day, endOfDay) =>
  new Date(`${day}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`)
    .toISOString()
    .replace("T", " ");

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
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");

  // Identifies the newest in-flight load. The PocketBase SDK auto-cancels a
  // duplicate request, and a superseded one must not clobber the state (or
  // raise an error) belonging to the request that replaced it.
  const reqId = useRef(0);

  const load = async (f = from, t = to) => {
    const id = ++reqId.current;
    setLoading(true);
    setError("");
    try {
      // Inclusive range: local midnight of `f` to local end-of-day of `t`,
      // expressed in UTC so the bounds line up with the stored timestamps.
      const filter = `timestamp >= "${utcBound(f, false)}" && timestamp <= "${utcBound(t, true)}"`;
      const [items, emps, sets, grps] = await Promise.all([
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
        pb.collection("groups").getFullList({ filter: "active = true", sort: "name" }),
      ]);
      if (id !== reqId.current) return;
      setRows(items);
      setEmployees(emps);
      setSettings(sets[0] || null);
      setGroups(grps);
    } catch (err) {
      // An auto-cancelled or superseded request is not a failure.
      if (err?.isAbort || id !== reqId.current) return;
      // Never fall through to a rendered table on failure: an empty result set
      // draws the consolidated view as every employee absent on every date,
      // which is indistinguishable from a real month of absences.
      setRows([]);
      setError("Could not load attendance for this range. Check your connection and try again.");
    } finally {
      if (id === reqId.current) setLoading(false);
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

  const filteredEmployees = useMemo(() => {
    if (!selectedGroup) return employees;
    return employees.filter((e) => e.group === selectedGroup);
  }, [employees, selectedGroup]);

  const filteredRows = useMemo(() => {
    if (!selectedGroup) return rows;
    const empIds = new Set(filteredEmployees.map((e) => e.id));
    return rows.filter((r) => empIds.has(r.employee));
  }, [rows, filteredEmployees, selectedGroup]);

  // One row per date, one column per employee. Statuses come from the same
  // dayStatus() the month calendar uses, so the values match it exactly.
  const matrix = useMemo(() => {
    if (!settings || filteredEmployees.length === 0) return [];
    const byEmp = {};
    for (const r of filteredRows) {
      (byEmp[r.employee] ||= []).push(r);
    }
    const byDayPerEmp = filteredEmployees.map((emp) => groupByDay(byEmp[emp.id] || []));
    const today = new Date();
    return dates.map((d) => ({
      date: d,
      cells: filteredEmployees.map((emp, i) => ({
        employeeId: emp.id,
        status: dayStatus(d, byDayPerEmp[i][d], emp, settings, today),
      })),
    }));
  }, [filteredRows, filteredEmployees, settings, dates]);

  const doExport = async () => {
    if (view === "matrix") {
      // Loaded on demand: jsPDF is ~400kB and only an admin pressing Export
      // ever needs it, so it stays out of the bundle every employee downloads.
      setExporting(true);
      try {
        const { exportMatrixPdf } = await import("../../reportPdf");
        const groupName = selectedGroup
          ? groups.find((g) => g.id === selectedGroup)?.name || ""
          : "";
        exportMatrixPdf({ matrix, employees: filteredEmployees, from, to, groupName });
      } catch (_) {
        // The exporter is deliberately not precached by the service worker, so
        // this is the expected failure when offline.
        setError("Could not load the PDF exporter. It needs a connection the first time it is used.");
      } finally {
        setExporting(false);
      }
      return;
    }
    const header = csvRow(["employee", "type", "timestamp", "source", "flagged"]);
    const lines = filteredRows.map((r) =>
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

  const empty = view === "matrix" ? matrix.length === 0 : filteredRows.length === 0;

  return (
    <div className="pad">
      <div className="filters">
        {groups.length > 0 && (
          <select
            className="group-filter"
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
          >
            <option value="">All</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
        <DateRangePicker from={from} to={to} onApply={applyRange} />
        <button onClick={() => load()} disabled={loading}>
          <Search /> {loading ? "…" : "Refresh"}
        </button>
        <button onClick={() => setView(view === "log" ? "matrix" : "log")}>
          {view === "log" ? <><Table2 /> Consolidated report</> : <><List /> Punch log</>}
        </button>
        <button onClick={doExport} disabled={empty || exporting}>
          {view === "matrix"
            ? <><FileDown /> {exporting ? "Preparing…" : "Export PDF"}</>
            : <><Download /> Export CSV</>}
        </button>
      </div>

      {error ? (
        <p className="error">{error}</p>
      ) : view === "matrix" ? (
        <ConsolidatedTable matrix={matrix} employees={filteredEmployees} loading={loading} />
      ) : (
        <PunchLog rows={filteredRows} />
      )}
    </div>
  );
}

// Dates down the side, one column per active employee. Each cell carries the
// same text and colour as that day in the employee's own calendar.
function ConsolidatedTable({ matrix, employees, loading }) {
  if (!loading && employees.length === 0) {
    return <p className="muted">No active employees to report on.</p>;
  }
  if (!loading && matrix.length === 0) {
    return <p className="muted">Selected range contains no days.</p>;
  }
  // Days actually attended, per employee — the footer tally.
  const presentTotals = employees.map(
    (_, i) => matrix.filter((row) => row.cells[i]?.status.status === "present").length
  );

  return (
    <>
      <div className="table-wrap matrix-wrap">
        <table className="table matrix">
          <thead>
            <tr>
              <th className="sticky-col">Date</th>
              {employees.map((e) => (
                <th key={e.id} className="matrix-emp" title={e.full_name}>
                  {e.full_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => {
              const [y, m, d] = row.date.split("-").map(Number);
              const dt = new Date(y, m - 1, d);
              const weekend = dt.getDay() === 0;
              return (
                <tr key={row.date} className={weekend ? "is-weekend" : ""}>
                  <td className="sticky-col matrix-daycol">
                    <span className="matrix-dow">
                      {dt.toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                    <span>
                      {String(d).padStart(2, "0")}/{String(m).padStart(2, "0")}
                    </span>
                  </td>
                  {row.cells.map((c) => {
                    const s = c.status;
                    const cls = ["matrix-cell", s.status];
                    if (s.late) cls.push("is-late");
                    if (s.halfDay) cls.push("is-half-day");
                    if (s.shortfall) cls.push("is-shortfall");
                    return (
                      <td key={c.employeeId} className={cls.join(" ")}>
                        {statusText(s)}
                        {s.noCheckout && (
                          <span className="cal-nocheckout" title="No check-out">*</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky-col">Days present</td>
              {presentTotals.map((n, i) => (
                <td key={employees[i].id} className="matrix-total">{n}</td>
              ))}
            </tr>
          </tfoot>
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
