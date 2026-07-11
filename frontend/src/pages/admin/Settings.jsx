import { useEffect, useState } from "react";
import { pb } from "../../pb";

// Geofence configuration editor. Edits the single `settings` record that the
// server-side hook reads on every check-in — changes take effect immediately,
// no redeploy.
export default function Settings() {
  const [rec, setRec] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    pb.collection("settings")
      .getFullList({ limit: 1 })
      .then((items) => setRec(items[0] || null))
      .catch(() => {});
  }, []);

  if (!rec) return <div className="pad">Loading…</div>;

  const set = (k, v) => setRec({ ...rec, [k]: v });

  const useMyLocation = () => {
    navigator.geolocation.getCurrentPosition((pos) =>
      setRec({
        ...rec,
        office_lat: pos.coords.latitude,
        office_lng: pos.coords.longitude,
      })
    );
  };

  const save = async () => {
    setError("");
    setSaved(false);
    try {
      await pb.collection("settings").update(rec.id, {
        office_lat: Number(rec.office_lat),
        office_lng: Number(rec.office_lng),
        radius_meters: Number(rec.radius_meters),
        max_gps_accuracy_meters: Number(rec.max_gps_accuracy_meters),
        require_selfie: !!rec.require_selfie,
        work_days: Array.isArray(rec.work_days) ? rec.work_days : [1, 2, 3, 4, 5, 6],
        late_grace_minutes: Number(rec.late_grace_minutes ?? 10),
      });
      setSaved(true);
    } catch (err) {
      setError(err?.response?.message || "Could not save.");
    }
  };

  return (
    <div className="pad narrow">
      <label>
        Office latitude
        <input
          type="number"
          step="any"
          value={rec.office_lat}
          onChange={(e) => set("office_lat", e.target.value)}
        />
      </label>
      <label>
        Office longitude
        <input
          type="number"
          step="any"
          value={rec.office_lng}
          onChange={(e) => set("office_lng", e.target.value)}
        />
      </label>
      <button className="link" onClick={useMyLocation}>
        Use my current location
      </button>
      <label>
        Radius (metres)
        <input
          type="number"
          value={rec.radius_meters}
          onChange={(e) => set("radius_meters", e.target.value)}
        />
      </label>
      <label>
        Max GPS accuracy (metres)
        <input
          type="number"
          value={rec.max_gps_accuracy_meters}
          onChange={(e) => set("max_gps_accuracy_meters", e.target.value)}
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!rec.require_selfie}
          onChange={(e) => set("require_selfie", e.target.checked)}
        />
        Require a selfie at check-in
      </label>

      <div className="field">
        <span>Working days</span>
        <div className="day-toggles">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => {
            const days = Array.isArray(rec.work_days) ? rec.work_days : [];
            const on = days.includes(i);
            return (
              <button
                type="button"
                key={i}
                className={`day-toggle ${on ? "on" : ""}`}
                onClick={() => {
                  const next = on
                    ? days.filter((x) => x !== i)
                    : [...days, i].sort();
                  set("work_days", next);
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      <label>
        Late grace period (minutes)
        <input
          type="number"
          value={rec.late_grace_minutes ?? 10}
          onChange={(e) => set("late_grace_minutes", e.target.value)}
        />
      </label>

      <button onClick={save}>Save</button>
      {saved && <p className="status success">Saved.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
