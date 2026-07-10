import { useEffect, useState } from "react";
import { pb } from "../../pb";

const BLANK = {
  email: "",
  full_name: "",
  biometric_user_id: "",
  role: "employee",
  active: true,
  password: "",
};

export default function Employees() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");

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
            <th>Role</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {list.map((emp) => (
            <tr key={emp.id}>
              <td>{emp.full_name}</td>
              <td>{emp.email}</td>
              <td>{emp.biometric_user_id || "—"}</td>
              <td>{emp.role}</td>
              <td>
                <button className="link" onClick={() => toggleActive(emp)}>
                  {emp.active ? "Yes" : "No"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
