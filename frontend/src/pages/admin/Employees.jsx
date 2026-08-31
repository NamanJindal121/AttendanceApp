import { useEffect, useState } from "react";
import { UserPlus, Pencil, Check, X } from "lucide-react";
import { pb } from "../../pb";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMAIL_DOMAIN = "@jindal.biz";

const BLANK = {
  username: "",
  full_name: "",
  group: "",
  biometric_user_id: "",
  aadhar_card: null,
  role: "employee",
  active: true,
  password: "",
  schedule_type: "fixed", // "fixed" or "freelancer"
  scheduled_check_in: "09:30",
  scheduled_check_out: "19:30",
  daily_hours: "",
  work_days: [], // empty = inherit office default
};

// Compact working-day picker. `days` is an array of weekday numbers (0-6);
// onChange gets the new array. Empty array means "use office default".
function DayPicker({ days, onChange }) {
  const set = Array.isArray(days) ? days : [];
  return (
    <div className="day-toggles">
      {DAY_LABELS.map((d, i) => {
        const on = set.includes(i);
        return (
          <button
            type="button"
            key={i}
            className={`day-toggle sm ${on ? "on" : ""}`}
            title={on ? "Working day" : "Off"}
            onClick={() =>
              onChange(
                on ? set.filter((x) => x !== i) : [...set, i].sort()
              )
            }
          >
            {d[0]}
          </button>
        );
      })}
    </div>
  );
}

export default function Employees() {
  const [list, setList] = useState([]);
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // employee being edited (draft)

  const load = () =>
    pb
      .collection("employees")
      .getFullList({ filter: "active = true", sort: "full_name" })
      .then(setList)
      .catch(() => { });

  useEffect(() => {
    load();
    pb.collection("groups").getFullList({ filter: "active = true", sort: "name" }).then(setGroups).catch(() => {});
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        ...form,
        email: `${form.username}${EMAIL_DOMAIN}`,
        passwordConfirm: form.password,
        emailVisibility: true,
        daily_hours: isFreelancerForm ? Number(form.daily_hours || 0) : 0,
      };
      if (isFreelancerForm) {
        payload.scheduled_check_in = "";
        payload.scheduled_check_out = "";
      }
      delete payload.schedule_type; // not a PB field
      await pb.collection("employees").create(payload);
      setForm(BLANK);
      load();
    } catch (err) {
      setError(err?.response?.message || "Could not create employee.");
    }
  };

  const toggleActive = async (emp) => {
    await pb.collection("employees").update(emp.id, { active: !emp.active });
    load();
  };

  const isFreelancerForm = form.schedule_type === "freelancer";

  const saveEdit = async () => {
    setError("");
    try {
      const isEditFreelancer = Number(editing.daily_hours || 0) > 0;
      const data = {
        full_name: editing.full_name,
        group: editing.group || "",
        biometric_user_id: editing.biometric_user_id,
        role: editing.role,
        scheduled_check_in: isEditFreelancer ? "" : editing.scheduled_check_in,
        scheduled_check_out: isEditFreelancer ? "" : editing.scheduled_check_out,
        daily_hours: isEditFreelancer ? Number(editing.daily_hours) : 0,
        work_days: Array.isArray(editing.work_days) ? editing.work_days : [],
        active: !!editing.active,
      };
      if (editing.aadhar_card instanceof File) {
        data.aadhar_card = editing.aadhar_card;
      }
      await pb.collection("employees").update(editing.id, data);
      setEditing(null);
      load();
    } catch (err) {
      setError(err?.response?.message || "Could not save changes.");
    }
  };

  return (
    <div className="pad">
      <form className="inline-form" onSubmit={create}>
        <input
          placeholder="Full name"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          required
        />
        <select
          value={form.group}
          onChange={(e) => setForm({ ...form, group: e.target.value })}
        >
          <option value="">— No group —</option>
          {groups.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <input
          placeholder="Username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          required
        />
        <input
          placeholder="Biometric ID"
          value={form.biometric_user_id}
          onChange={(e) =>
            setForm({ ...form, biometric_user_id: e.target.value })
          }
        />
        <label className="field">
          Aadhar Card
          <input
            type="file"
            accept="image/*"
            onChange={(e) =>
              setForm({ ...form, aadhar_card: e.target.files[0] })
            }
          />
        </label>
        <label className="field">
          Schedule
          <select
            value={form.schedule_type}
            onChange={(e) => setForm({ ...form, schedule_type: e.target.value })}
          >
            <option value="fixed">Fixed Schedule</option>
            <option value="freelancer">Freelancer</option>
          </select>
        </label>
        {isFreelancerForm ? (
          <label className="field">
            Daily Hours
            <input
              type="number"
              min="1"
              max="24"
              step="0.5"
              placeholder="e.g. 3"
              value={form.daily_hours}
              onChange={(e) => setForm({ ...form, daily_hours: e.target.value })}
              required
            />
          </label>
        ) : (
          <>
            <label className="field">
              Check-in
              <input
                type="time"
                value={form.scheduled_check_in}
                onChange={(e) =>
                  setForm({ ...form, scheduled_check_in: e.target.value })
                }
              />
            </label>
            <label className="field">
              Check-out
              <input
                type="time"
                value={form.scheduled_check_out}
                onChange={(e) =>
                  setForm({ ...form, scheduled_check_out: e.target.value })
                }
              />
            </label>
          </>
        )}
        <label className="field">
          Work days <span className="muted-inline">(none = office default)</span>
          <DayPicker
            days={form.work_days}
            onChange={(wd) => setForm({ ...form, work_days: wd })}
          />
        </label>
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="employee">employee</option>
          <option value="admin">admin</option>
        </select>
        <input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          minLength={8}
          required
        />
        <button type="submit"><UserPlus /> Add</button>
      </form>
      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Group</th>
              <th>Username</th>
              <th>Biometric ID</th>
              <th>Aadhar Image</th>
              <th>Schedule</th>
              <th>Work days</th>
              <th>Role</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((emp) =>
              editing?.id === emp.id ? (
                <tr key={emp.id} className="editing">
                  <td>
                    <input
                      value={editing.full_name}
                      onChange={(e) =>
                        setEditing({ ...editing, full_name: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={editing.group || ""}
                      onChange={(e) => setEditing({ ...editing, group: e.target.value })}
                    >
                      <option value="">— No group —</option>
                      {groups.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>{emp.username}</td>
                  <td>
                    <input
                      style={{ width: "6rem" }}
                      value={editing.biometric_user_id}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          biometric_user_id: e.target.value,
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ width: "8rem" }}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          aadhar_card: e.target.files[0],
                        })
                      }
                    />
                    {emp.aadhar_card && !(editing.aadhar_card instanceof File) && (
                      <div className="muted" style={{ fontSize: "0.8em", marginTop: "4px" }}>
                        Replace existing
                      </div>
                    )}
                  </td>
                  <td>
                    {Number(editing.daily_hours || 0) > 0 ? (
                      <input
                        type="number"
                        min="1"
                        max="24"
                        step="0.5"
                        style={{ width: "5rem" }}
                        value={editing.daily_hours}
                        onChange={(e) =>
                          setEditing({ ...editing, daily_hours: e.target.value })
                        }
                      />
                    ) : (
                      <>
                        <input
                          type="time"
                          value={editing.scheduled_check_in || ""}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              scheduled_check_in: e.target.value,
                            })
                          }
                        />
                        {" – "}
                        <input
                          type="time"
                          value={editing.scheduled_check_out || ""}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              scheduled_check_out: e.target.value,
                            })
                          }
                        />
                      </>
                    )}
                  </td>
                  <td>
                    <DayPicker
                      days={editing.work_days}
                      onChange={(wd) => setEditing({ ...editing, work_days: wd })}
                    />
                  </td>
                  <td>
                    <select
                      value={editing.role}
                      onChange={(e) =>
                        setEditing({ ...editing, role: e.target.value })
                      }
                    >
                      <option value="employee">employee</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={editing.active ? "true" : "false"}
                      onChange={(e) =>
                        setEditing({ ...editing, active: e.target.value === "true" })
                      }
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </td>
                  <td>
                    <button className="link" onClick={saveEdit}>
                      <Check /> Save
                    </button>
                    <button className="link" onClick={() => setEditing(null)}>
                      <X /> Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={emp.id}>
                  <td>{emp.full_name}</td>
                  <td>{groups.find((b) => b.id === emp.group)?.name || <span className="muted">—</span>}</td>
                  <td>{emp.username}</td>
                  <td>{emp.biometric_user_id || "—"}</td>
                  <td>
                    {emp.aadhar_card ? (
                      <a href={pb.files.getUrl(emp, emp.aadhar_card)} target="_blank" rel="noreferrer" className="link">
                        View
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {Number(emp.daily_hours || 0) > 0
                      ? `Freelancer (${emp.daily_hours}h/day)`
                      : <>
                        {emp.scheduled_check_in || "—"}
                        {emp.scheduled_check_in ? " – " : ""}
                        {emp.scheduled_check_out || ""}
                      </>
                    }
                  </td>
                  <td>
                    {Array.isArray(emp.work_days) && emp.work_days.length
                      ? emp.work_days.map((d) => DAY_LABELS[d][0]).join(" ")
                      : <span className="muted">default</span>}
                  </td>
                  <td>{emp.role}</td>
                  <td>
                    <button className="link" onClick={() => toggleActive(emp)}>
                      {emp.active ? "Yes" : "No"}
                    </button>
                  </td>
                  <td>
                    <button className="link" onClick={() => setEditing({ ...emp })}>
                      <Pencil /> Edit
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
