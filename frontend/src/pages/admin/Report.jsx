import { useEffect, useState } from "react";
import { pb } from "../../pb";

// Default the date range to the last 7 days (yyyy-mm-dd for <input type=date>).
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export default function Report() {
  const [from, setFrom] = useState(
    isoDate(new Date(Date.now() - 6 * 86400000))
  );
  const [to, setTo] = useState(isoDate(new Date()));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Inclusive range: from 00:00:00 to 23:59:59 of the selected days.
      const filter = `timestamp >= "${from} 00:00:00" && timestamp <= "${to} 23:59:59"`;
      const items = await pb.collection("attendance_records").getFullList({
        filter,
        sort: "-timestamp",
        expand: "employee",
      });
      setRows(items);
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

  const exportCsv = () => {
    const header = ["employee", "type", "timestamp", "source", "flagged"];
    const lines = rows.map((r) => {
      const name = r.expand?.employee?.full_name || r.employee;
      return [name, r.type, r.timestamp, r.source, r.flagged].join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pad">
      <div className="filters">
        <label>
          From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button onClick={load} disabled={loading}>
          {loading ? "…" : "Apply"}
        </button>
        <button onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Type</th>
            <th>Time</th>
            <th>Source</th>
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
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">No records in range.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
