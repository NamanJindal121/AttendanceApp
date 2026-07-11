import { useEffect, useState } from "react";
import { pb } from "../../pb";
import Calendar from "../../Calendar";

// Admin view: pick any employee and see their month attendance calendar.
export default function AttendanceCalendar() {
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [settings, setSettings] = useState(null);
  const [records, setRecords] = useState([]);

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

  // Load the selected employee's attendance whenever the selection changes.
  useEffect(() => {
    if (!selectedId) return;
    pb.collection("attendance_records")
      .getFullList({ filter: `employee = "${selectedId}"`, sort: "-timestamp" })
      .then(setRecords)
      .catch(() => setRecords([]));
  }, [selectedId]);

  const selected = employees.find((e) => e.id === selectedId);

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
    </div>
  );
}
