import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { pb } from "../pb";
import { useAuth } from "../auth";
import { getPosition, captureSelfie } from "../capture";

export default function CheckIn() {
  const { user, isAdmin, logout } = useAuth();
  const [lastType, setLastType] = useState(null); // last punch type today
  const [requireSelfie, setRequireSelfie] = useState(false);
  const [status, setStatus] = useState({ kind: "idle", msg: "" });
  const [busy, setBusy] = useState(false);

  // The next action is the opposite of the last punch (default: check in).
  const nextType = lastType === "check_in" ? "check_out" : "check_in";
  const nextLabel = nextType === "check_in" ? "Check In" : "Check Out";

  useEffect(() => {
    (async () => {
      try {
        const settings = await pb.collection("settings").getFullList({ limit: 1 });
        if (settings[0]) setRequireSelfie(!!settings[0].require_selfie);
      } catch (_) {}
      try {
        const last = await pb.collection("attendance_records").getList(1, 1, {
          filter: `employee = "${user.id}"`,
          sort: "-timestamp",
        });
        if (last.items[0]) setLastType(last.items[0].type);
      } catch (_) {}
    })();
  }, [user.id]);

  const punch = async () => {
    setBusy(true);
    setStatus({ kind: "working", msg: "Getting your location…" });
    try {
      const pos = await getPosition();

      const data = new FormData();
      data.append("type", nextType);
      data.append("lat", pos.lat);
      data.append("lng", pos.lng);
      data.append("gps_accuracy", pos.accuracy);

      if (requireSelfie) {
        setStatus({ kind: "working", msg: "Taking your photo…" });
        const selfie = await captureSelfie();
        if (selfie) data.append("selfie", selfie, "selfie.jpg");
      }

      setStatus({ kind: "working", msg: "Submitting…" });
      await pb.collection("attendance_records").create(data);

      setLastType(nextType);
      setStatus({
        kind: "success",
        msg: `${nextType === "check_in" ? "Checked in" : "Checked out"} successfully.`,
      });
    } catch (err) {
      // Surface the server's geofence message when present.
      const msg =
        err?.response?.message || err?.message || "Something went wrong.";
      setStatus({ kind: "error", msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <span className="brand">{user.full_name || user.email}</span>
        <div className="spacer" />
        <Link to="/calendar" className="link">Calendar</Link>
        <Link to="/history" className="link">History</Link>
        {isAdmin && <Link to="/admin" className="link">Admin</Link>}
        <button className="link" onClick={logout}>Sign out</button>
      </header>

      <div className="center grow">
        <div className="punch-wrap">
          <p className="punch-hint">
            {nextType === "check_in"
              ? "Tap to start your workday"
              : "Tap to end your workday"}
          </p>
          <button
            className={`punch ${nextType}`}
            onClick={punch}
            disabled={busy}
          >
            {busy ? "…" : nextLabel}
          </button>

          {status.kind !== "idle" && (
            <p className={`status ${status.kind}`}>{status.msg}</p>
          )}
        </div>
      </div>
    </div>
  );
}
