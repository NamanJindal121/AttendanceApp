import { useEffect, useState } from "react";
import { MapPin, Save, Building2, Plus, Pencil, Check, X } from "lucide-react";
import { pb } from "../../pb";

// Geofence configuration editor. Edits the single `settings` record that the
// server-side hook reads on every check-in — changes take effect immediately,
// no redeploy.
export default function Settings() {
  const [rec, setRec] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [groups, setGroups] = useState([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editGroupName, setEditGroupName] = useState("");

  useEffect(() => {
    pb.collection("settings")
      .getFullList({ limit: 1 })
      .then((items) => setRec(items[0] || null))
      .catch(() => {});

    pb.collection("groups")
      .getFullList({ sort: "name" })
      .then(setGroups)
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

  const addGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      const g = await pb.collection("groups").create({ name: newGroupName, active: true });
      setGroups([...groups, g].sort((a, b) => a.name.localeCompare(b.name)));
      setNewGroupName("");
    } catch (err) {
      alert(err?.response?.message || "Failed to add group");
    }
  };

  const toggleGroupActive = async (group) => {
    try {
      const g = await pb.collection("groups").update(group.id, { active: !group.active });
      setGroups(groups.map((x) => (x.id === group.id ? g : x)));
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const saveGroupName = async (group) => {
    if (!editGroupName.trim() || editGroupName === group.name) {
      setEditingGroupId(null);
      return;
    }
    try {
      const g = await pb.collection("groups").update(group.id, { name: editGroupName });
      setGroups(groups.map((x) => (x.id === group.id ? g : x)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingGroupId(null);
    } catch (err) {
      alert(err?.response?.message || "Failed to update name");
    }
  };

  return (
    <div className="pad narrow">
      <div className="groups-section">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
          <Building2 size={20} /> Groups
        </h2>
        
        <form onSubmit={addGroup} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input 
            type="text" 
            placeholder="New group name" 
            value={newGroupName} 
            onChange={(e) => setNewGroupName(e.target.value)} 
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={!newGroupName.trim()}><Plus size={16} /> Add</button>
        </form>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {groups.map((group) => (
            <li key={group.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--surface-color, #f9f9f9)', borderRadius: '4px' }}>
              {editingGroupId === group.id ? (
                <>
                  <input
                    type="text"
                    value={editGroupName}
                    onChange={(e) => setEditGroupName(e.target.value)}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <button className="icon" onClick={() => saveGroupName(group)}><Check size={16} /></button>
                  <button className="icon" onClick={() => setEditingGroupId(null)}><X size={16} /></button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, opacity: group.active ? 1 : 0.5 }}>{group.name}</span>
                  <button 
                    className={`toggle ${group.active ? "on" : ""}`}
                    onClick={() => toggleGroupActive(group)}
                    style={{ minWidth: '60px' }}
                  >
                    {group.active ? "Yes" : "No"}
                  </button>
                  <button className="icon" onClick={() => { setEditingGroupId(group.id); setEditGroupName(group.name); }}>
                    <Pencil size={16} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      <hr style={{ margin: '2rem 0' }} />

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
        <MapPin /> Use my current location
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

      <button onClick={save}><Save /> Save</button>
      {saved && <p className="status success">Saved.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
