import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { pb } from "../pb";
import { useAuth } from "../auth";
import Calendar from "../Calendar";

// Employee view: my own month attendance calendar.
export default function MyCalendar() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    pb.collection("settings")
      .getFullList({ limit: 1 })
      .then((s) => setSettings(s[0] || null))
      .catch(() => {});
    pb.collection("attendance_records")
      .getFullList({ filter: `employee = "${user.id}"`, sort: "-timestamp" })
      .then(setRecords)
      .catch(() => setRecords([]));
  }, [user.id]);

  return (
    <div className="screen">
      <header className="topbar">
        <Link to="/" className="link">← Back</Link>
        <div className="spacer" />
        <span>My Calendar</span>
      </header>
      <div className="pad">
        {settings ? (
          <Calendar records={records} employee={user} settings={settings} />
        ) : (
          <p className="muted">Loading…</p>
        )}
      </div>
    </div>
  );
}
