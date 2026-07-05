import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";

export default function Employes({ user }) {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ name: "", pin: "", role: "employee" });
  const [message, setMessage] = useState("");

  useEffect(() => { loadEmployees(); }, []);

  if (user.role !== "admin") return <div className="alert error">Accès réservé administrateur.</div>;

  async function loadEmployees() {
    const { data } = await supabase.from("employees").select("*").order("name");
    setEmployees(data || []);
  }

  async function addEmployee(e) {
    e.preventDefault();
    setMessage("");

    if (!form.name || !form.pin) return setMessage("Nom et PIN obligatoires.");

    const { error } = await supabase.from("employees").insert({
      name: form.name,
      pin: form.pin,
      role: form.role,
      active: true,
    });

    if (error) return setMessage(error.message);

    setForm({ name: "", pin: "", role: "employee" });
    loadEmployees();
  }

  async function toggleActive(employee) {
    await supabase.from("employees").update({ active: !employee.active }).eq("id", employee.id);
    loadEmployees();
  }

  return (
    <section className="page">
      <h2>Employés</h2>
      {message && <div className="alert info">{message}</div>}

      <div className="card">
        <h3>Ajouter un employé</h3>
        <form onSubmit={addEmployee} className="grid">
          <div>
            <label>Nom</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label>PIN</label>
            <input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
          </div>
          <div>
            <label>Rôle</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="employee">Employé</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="align-end"><button className="btn primary">Ajouter</button></div>
        </form>
      </div>

      <div className="card">
        <h3>Liste</h3>
        <table>
          <thead><tr><th>Nom</th><th>Rôle</th><th>Actif</th><th>Action</th></tr></thead>
          <tbody>
            {employees.map(employee => (
              <tr key={employee.id}>
                <td>{employee.name}</td>
                <td>{employee.role}</td>
                <td>{employee.active ? "Oui" : "Non"}</td>
                <td><button className="btn small" onClick={() => toggleActive(employee)}>{employee.active ? "Désactiver" : "Réactiver"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
