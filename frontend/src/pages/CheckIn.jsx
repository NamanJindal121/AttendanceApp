import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  History as HistoryIcon,
  Shield,
  LogOut,
  LogIn,
  Clock,
} from "lucide-react";
import { pb } from "../pb";
import { useAuth } from "../auth";
import { getPosition } from "../capture";
import CameraCapture from "../CameraCapture";

export default function CheckIn() {
  const { user, isAdmin, logout } = useAuth();
  const [lastType, setLastType] = useState(null); // last punch type today
  const [requireSelfie, setRequireSelfie] = useState(false);
  const [status, setStatus] = useState({ kind: "idle", msg: "" });
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [pendingPos, setPendingPos] = useState(null); // location awaiting a selfie

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

  // Send the record. `selfie` (a Blob) is attached only when provided.
  const submit = async (pos, selfie) => {
    setStatus({ kind: "working", msg: "Submitting…" });
    try {
      const data = new FormData();
      data.append("type", nextType);
      data.append("lat", pos.lat);
      data.append("lng", pos.lng);
      data.append("gps_accuracy", pos.accuracy);
      if (selfie) data.append("selfie", selfie, "selfie.jpg");

      await pb.collection("attendance_records").create(data);

      setLastType(nextType);
      setStatus({
        kind: "success",
        msg: `${nextType === "check_in" ? "Checked in" : "Checked out"} successfully.`,
      });
    } catch (err) {
      const msg =
        err?.response?.message || err?.message || "Something went wrong.";
      setStatus({ kind: "error", msg });
    } finally {
      setBusy(false);
    }
  };

  const punch = async () => {
    setBusy(true);
    setStatus({ kind: "working", msg: "Getting your location…" });
    try {
      const pos = await getPosition();
      if (requireSelfie) {
        // Hand off to the camera modal; submission happens once the user
        // confirms their photo (onCapture below).
        setPendingPos(pos);
        setShowCamera(true);
        setStatus({ kind: "idle", msg: "" });
      } else {
        await submit(pos, null);
      }
    } catch (err) {
      const msg =
        err?.response?.message || err?.message || "Something went wrong.";
      setStatus({ kind: "error", msg });
      setBusy(false);
    }
  };

  const onSelfieConfirmed = async (blob) => {
    setShowCamera(false);
    await submit(pendingPos, blob);
    setPendingPos(null);
  };

  const onSelfieCancel = () => {
    setShowCamera(false);
    setPendingPos(null);
    setBusy(false);
    setStatus({ kind: "idle", msg: "" });
  };

  return (
    <div className="screen">
      <header className="topbar">
        <span className="brand with-logo">
          <span className="label-full">{user.full_name || user.email}</span>
        </span>
        <div className="spacer" />
        <Link to="/calendar" className="link">
          <CalendarDays /> <span className="label">Calendar</span>
        </Link>
        <Link to="/history" className="link">
          <HistoryIcon /> <span className="label">History</span>
        </Link>
        {isAdmin && (
          <Link to="/admin" className="link">
            <Shield /> <span className="label">Admin</span>
          </Link>
        )}
        <button className="link" onClick={logout}>
          <LogOut /> <span className="label">Sign out</span>
        </button>
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
            {busy ? (
              <Clock className="spin" />
            ) : nextType === "check_in" ? (
              <LogIn />
            ) : (
              <LogOut />
            )}
            {busy ? "…" : nextLabel}
          </button>

          {status.kind !== "idle" && (
            <p className={`status ${status.kind}`}>{status.msg}</p>
          )}
        </div>
      </div>

      {showCamera && (
        <CameraCapture
          onCapture={onSelfieConfirmed}
          onCancel={onSelfieCancel}
        />
      )}
    </div>
  );
}
