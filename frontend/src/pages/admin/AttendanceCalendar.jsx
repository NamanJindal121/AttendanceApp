import { useEffect, useState } from "react";
import { pb } from "../../pb";
import Calendar from "../../Calendar";
import { dayKey } from "../../attendance";

// Admin view: pick any employee, see their month calendar, and manually
// add / correct punches. Admins bypass the geofence hook (see main.pb.js), so
// manual records post directly to the attendance_records collection.
export default function AttendanceCalendar() {
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [settings, setSettings] = useState(null);
  const [records, setRecords] = useState([]);

  // Manual-punch form state.
  const [date, setDate] = useState(dayKey(new Date()));
  const [time, setTime] = useState("09:00");
  const [type, setType] = useState("check_in");
  const [msg, setMsg] = useState(null);

  const loadRecords = (empId) =>
    pb
      .collection("attendance_records")
      .getFullList({ filter: `employee = "${empId}"`, sort: "-timestamp" })
      .then(setRecords)
      .catch(() => setRecords([]));

  // Load the employee list + office settings once.
  useEffect(() => {
    pb.collection("employees")
      .getFullList({ sort: "full_name" })
      .then((list) => {
        setEmployees(list);
        if (list[0]) setSelectedId(list[0].id);
      })
      .catch(() => {});
    pb.collection("settings")
      .getFullList({ limit: 1 })
      .then((s) => setSettings(s[0] || null))
      .catch(() => {});
  }, []);

  // (Re)load the selected employee's attendance.
  useEffect(() => {
    if (selectedId) loadRecords(selectedId);
  }, [selectedId]);

  const selected = employees.find((e) => e.id === selectedId);

  const addPunch = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      // date + time are in the admin's local timezone; toISOString -> UTC,
      // which is how the calendar reads them back. Sending source=app keeps
      // manual entries visually distinct from device "biometric" punches.
      const ts = new Date(`${date}T${time}`).toISOString();
      await pb.collection("attendance_records").create({
        employee: selectedId,
        type,
        timestamp: ts,
        source: "app",
      });
      setMsg({ ok: true, text: "Punch added." });
      loadRecords(selectedId);
    } catch (err) {
      setMsg({ ok: false, text: err?.response?.message || "Could not add punch." });
    }
  };

  const removePunch = async (id) => {
    setMsg(null);
    try {
      await pb.collection("attendance_records").delete(id);
      loadRecords(selectedId);
    } catch (err) {
      setMsg({ ok: false, text: "Could not delete." });
    }
  };

  // Punches on the currently-selected form date (for correction/deletion).
  const dayPunches = records
    .filter((r) => dayKey(new Date(r.timestamp)) === date)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return (
    <div className="pad">
      <div className="filters">
        <label className="field">
          Employee
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <span className="muted-inline">
            Scheduled {selected.scheduled_check_in || "—"} –{" "}
            {selected.scheduled_check_out || "—"}
          </span>
        )}
      </div>

      {selected && settings && (
        <Calendar records={records} employee={selected} settings={settings} />
      )}

      {/* Manual add / correct */}
      {selected && (
        <div className="manual-punch">
          <h3>Add / correct a punch</h3>
          <form className="filters" onSubmit={addPunch}>
            <label className="field">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="field">
              Time
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <label className="field">
              Type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="check_in">check in</option>
                <option value="check_out">check out</option>
              </select>
            </label>
            <button type="submit">Add punch</button>
          </form>
          {msg && (
            <p className={msg.ok ? "status success" : "error"}>{msg.text}</p>
          )}

          <p className="muted">Punches on {date}:</p>
          <ul className="list">
            {dayPunches.map((r) => (
              <li key={r.id} className="row">
                <span className={`badge ${r.type}`}>
                  {r.type === "check_in" ? "IN" : "OUT"}
                </span>
                <span className="ts">
                  {new Date(r.timestamp).toLocaleTimeString()}
                </span>
                <span className={`source ${r.source}`}>{r.source}</span>
                <button
                  className="link"
                  style={{ marginLeft: "auto", color: "var(--red)" }}
                  onClick={() => removePunch(r.id)}
                >
                  Delete
                </button>
              </li>
            ))}
            {dayPunches.length === 0 && (
              <li className="row muted">No punches on this date.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
