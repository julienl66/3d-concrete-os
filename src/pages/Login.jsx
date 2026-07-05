import { useState } from "react";
import { supabase } from "../services/supabase.js";

export default function Login({ onLogin }) {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    setMessage("");

    if (!pin.trim()) {
      setMessage("Code PIN obligatoire.");
      return;
    }

    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("pin", pin.trim())
      .eq("active", true)
      .limit(1);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (!data || data.length === 0) {
      setMessage("Code PIN incorrect ou employé désactivé.");
      return;
    }

    onLogin(data[0]);
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="brand login-brand">
          <span>3D</span>
          <div>
            <strong>CONCRETE</strong>
            <small>OS interne</small>
          </div>
        </div>

        <h1>Connexion</h1>
        <p>Entre ton code PIN pour accéder à l'ERP.</p>

        {message && (
          <div className="alert info">
            {message}
          </div>
        )}

        <label>Code PIN</label>

        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
          autoFocus
        />

        <button className="btn primary" type="submit">
          Se connecter
        </button>
      </form>
    </main>
  );
}