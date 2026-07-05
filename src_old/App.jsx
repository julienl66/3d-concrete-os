import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function App() {
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadEmployees() {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("name");

      if (error) {
        setError(error.message);
      } else {
        setEmployees(data);
      }
    }

    loadEmployees();
  }, []);

  return (
    <div style={{ padding: 40, fontFamily: "Arial" }}>
      <h1>3D Concrete Time</h1>
      <h2>Test connexion Supabase</h2>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <ul>
        {employees.map((employee) => (
          <li key={employee.id}>
            {employee.name} — {employee.role}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;