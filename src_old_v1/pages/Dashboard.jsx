import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";

const WEEK_LIMIT = 35;

function getWeekNumber(dateString) {
  const date = new Date(dateString);
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const pastDays = Math.floor((date - firstDay) / 86400000);
  return Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
}

export default function Dashboard({ user }) {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => { loadEntries(); }, []);

  async function loadEntries() {
    let query = supabase
      .from("time_entries")
      .select("*, employees(name), projects(name)")
      .order("work_date", { ascending: false })
      .limit(500);

    if (user.role !== "admin") query = query.eq("employee_id", user.id);

    const { data, error } = await query;
    if (error) setError(error.message);
    else setEntries(data || []);
  }

  const stats = useMemo(() => {
    const total = entries.reduce((sum, e) => sum + Number(e.total_hours || 0), 0);
    const byEmployee = {};

    for (const e of entries) {
      const employee = e.employees?.name || "Inconnu";
      if (!byEmployee[employee]) byEmployee[employee] = {};
      const week = `${new Date(e.work_date).getFullYear()}-S${getWeekNumber(e.work_date)}`;
      byEmployee[employee][week] = (byEmployee[employee][week] || 0) + Number(e.total_hours || 0);
    }

    let overtime = 0;
    Object.values(byEmployee).forEach(weeks => {
      Object.values(weeks).forEach(hours => {
        if (hours > WEEK_LIMIT) overtime += hours - WEEK_LIMIT;
      });
    });

    return { total, overtime, normal: Math.max(0, total - overtime) };
  }, [entries]);

  function exportCSV() {
    const rows = [
      ["Employé", "Date", "Projet", "Début", "Fin", "Pause", "Total", "Commentaire"],
      ...entries.map(e => [
        e.employees?.name || "",
        e.work_date,
        e.projects?.name || "",
        e.start_time,
        e.end_time,
        e.break_minutes,
        e.total_hours,
        e.comment || "",
      ]),
    ];

    const csv = rows
      .map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
      .join("\\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "export-heures-3dconcrete.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h2>Tableau de bord</h2>
          <p>Récapitulatif des heures enregistrées.</p>
        </div>
        <button className="btn primary" onClick={exportCSV}>Exporter CSV</button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="stats-grid">
        <div className="stat-card"><span>Total</span><strong>{stats.total.toFixed(2)} h</strong></div>
        <div className="stat-card"><span>Heures normales</span><strong>{stats.normal.toFixed(2)} h</strong></div>
        <div className="stat-card"><span>Heures sup. estimées</span><strong>{stats.overtime.toFixed(2)} h</strong></div>
      </div>

      <div className="card">
        <h3>Dernières saisies</h3>
        <table>
          <thead>
            <tr><th>Employé</th><th>Date</th><th>Projet</th><th>Début</th><th>Fin</th><th>Total</th></tr>
          </thead>
          <tbody>
            {entries.slice(0, 20).map(e => (
              <tr key={e.id}>
                <td>{e.employees?.name}</td>
                <td>{e.work_date}</td>
                <td>{e.projects?.name}</td>
                <td>{e.start_time}</td>
                <td>{e.end_time}</td>
                <td><strong>{Number(e.total_hours || 0).toFixed(2)} h</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
