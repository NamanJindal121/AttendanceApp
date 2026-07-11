import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { pb } from "../pb";
import { useAuth } from "../auth";

export default function History() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);

  useEffect(() => {
    pb.collection("attendance_records")
      .getList(1, 50, {
        filter: `employee = "${user.id}"`,
        sort: "-timestamp",
      })
      .then((res) => setRecords(res.items))
      .catch(() => {});
  }, [user.id]);

  return (
    <div className="screen">
      <header className="topbar">
        <Link to="/" className="link">
          <ArrowLeft /> <span className="label">Back</span>
        </Link>
        <div className="spacer" />
        <span className="brand">My History</span>
      </header>

      <ul className="list">
        {records.map((r) => (
          <li key={r.id} className="row">
            <span className={`badge ${r.type}`}>
              {r.type === "check_in" ? "IN" : "OUT"}
            </span>
            <span className="ts">
              {new Date(r.timestamp).toLocaleString()}
            </span>
            <span className={`source ${r.source}`}>{r.source}</span>
            {r.flagged && <span className="flag">flagged</span>}
          </li>
        ))}
        {records.length === 0 && <li className="row muted">No records yet.</li>}
      </ul>
    </div>
  );
}
