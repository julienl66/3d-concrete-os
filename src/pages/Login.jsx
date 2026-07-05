import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";

export default function Login({ onLogin }) {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { loadEmployees(); }, []);

  async function loadEmployees() {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("active", true)
      .order("name");

    if (error) return setError(error.message);
    setEmployees(data || []);
    if (data?.length) setEmployeeId(data[0].id);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("id", employeeId)
      .eq("pin", pin)
      .single();

    if (error || !data) return setError("Code PIN incorrect.");
    onLogin(data);
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-badge">3D CONCRETE</div>
        <h1>Suivi des heures</h1>
        <p>Connexion rapide par employé</p>

        {error && <div className="alert error">{error}</div>}

        <label>Employé</label>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          {employees.map(employee => (
            <option key={employee.id} value={employee.id}>{employee.name}</option>
          ))}
        </select>

        <label>Code PIN</label>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Ex : 1234"
        />

        <button className="btn primary full">Se connecter</button>
      </form>
    </div>
  );
}
