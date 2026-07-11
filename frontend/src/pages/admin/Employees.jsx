import { useEffect, useState } from "react";
import { pb } from "../../pb";

const BLANK = {
  email: "",
  full_name: "",
  biometric_user_id: "",
  role: "employee",
  active: true,
  password: "",
  scheduled_check_in: "09:00",
  scheduled_check_out: "18:00",
};

export default function Employees() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // employee being edited (draft)

  const load = () =>
    pb
      .collection("employees")
      .getFullList({ sort: "full_name" })
      .then(setList)
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await pb.collection("employees").create({
        ...form,
        passwordConfirm: form.password,
        emailVisibility: true,
      });
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

  const saveEdit = async () => {
    setError("");
    try {
      await pb.collection("employees").update(editing.id, {
        full_name: editing.full_name,
        biometric_user_id: editing.biometric_user_id,
        role: editing.role,
        scheduled_check_in: editing.scheduled_check_in,
        scheduled_check_out: editing.scheduled_check_out,
      });
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
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
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
        <button type="submit">Add</button>
      </form>
      {error && <p className="error">{error}</p>}

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Biometric ID</th>
            <th>Schedule</th>
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
                <td>{emp.email}</td>
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
                <td>{emp.active ? "Yes" : "No"}</td>
                <td>
                  <button className="link" onClick={saveEdit}>Save</button>
                  <button className="link" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={emp.id}>
                <td>{emp.full_name}</td>
                <td>{emp.email}</td>
                <td>{emp.biometric_user_id || "—"}</td>
                <td>
                  {emp.scheduled_check_in || "—"}
                  {emp.scheduled_check_in ? " – " : ""}
                  {emp.scheduled_check_out || ""}
                </td>
                <td>{emp.role}</td>
                <td>
                  <button className="link" onClick={() => toggleActive(emp)}>
                    {emp.active ? "Yes" : "No"}
                  </button>
                </td>
                <td>
                  <button className="link" onClick={() => setEditing({ ...emp })}>
                    Edit
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
