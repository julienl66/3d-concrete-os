import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function calculateHours(start, end, pause) {
  if (!start || !end) return 0;
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  let a = h1 * 60 + m1;
  let b = h2 * 60 + m2;
  if (b < a) b += 24 * 60;
  return Math.round((Math.max(0, b - a - Number(pause || 0)) / 60) * 100) / 100;
}

export default function Pointage({ user }) {
  const [projects, setProjects] = useState([]);
  const [workDate, setWorkDate] = useState(today());
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState([
    { project_id: "", start_time: "", end_time: "", break_minutes: 0, comment: "" },
  ]);

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("active", true)
      .order("name");

    setProjects(data || []);
    setEntries([{ project_id: data?.[0]?.id || "", start_time: "", end_time: "", break_minutes: 0, comment: "" }]);
  }

  function updateEntry(index, field, value) {
    setEntries(current => current.map((e, i) => i === index ? { ...e, [field]: value } : e));
  }

  function addLine() {
    setEntries(current => [
      ...current,
      { project_id: projects[0]?.id || "", start_time: "", end_time: "", break_minutes: 0, comment: "" },
    ]);
  }

  function removeLine(index) {
    setEntries(current => current.filter((_, i) => i !== index));
  }

  async function saveDay() {
    setMessage("");

    const rows = entries
      .filter(e => e.project_id && e.start_time && e.end_time)
      .map(e => ({
        employee_id: user.id,
        project_id: e.project_id,
        work_date: workDate,
        start_time: e.start_time,
        end_time: e.end_time,
        break_minutes: Number(e.break_minutes || 0),
        total_hours: calculateHours(e.start_time, e.end_time, e.break_minutes),
        comment: e.comment || "",
      }));

    if (!rows.length) return setMessage("Aucune ligne complète à enregistrer.");

    const { error } = await supabase.from("time_entries").insert(rows);
    if (error) return setMessage(error.message);

    setMessage("Journée enregistrée.");
    setEntries([{ project_id: projects[0]?.id || "", start_time: "", end_time: "", break_minutes: 0, comment: "" }]);
  }

  const totalDay = entries.reduce((sum, e) => sum + calculateHours(e.start_time, e.end_time, e.break_minutes), 0);

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Multi-projets</p>
          <h2>Pointage</h2>
          <p>Saisis une journée en la répartissant sur plusieurs projets.</p>
        </div>
        <div className="total-pill">{totalDay.toFixed(2)} h</div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="card">
        <label>Date travaillée</label>
        <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />

        {entries.map((entry, index) => (
          <div className="entry-line" key={index}>
            <div className="entry-title">Projet #{index + 1}</div>

            <div className="grid">
              <div>
                <label>Projet</label>
                <select value={entry.project_id} onChange={(e) => updateEntry(index, "project_id", e.target.value)}>
                  {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </div>

              <div>
                <label>Pause minutes</label>
                <input type="number" value={entry.break_minutes} onChange={(e) => updateEntry(index, "break_minutes", e.target.value)} />
              </div>

              <div>
                <label>Début</label>
                <input type="time" value={entry.start_time} onChange={(e) => updateEntry(index, "start_time", e.target.value)} />
              </div>

              <div>
                <label>Fin</label>
                <input type="time" value={entry.end_time} onChange={(e) => updateEntry(index, "end_time", e.target.value)} />
              </div>
            </div>

            <label>Commentaire</label>
            <textarea value={entry.comment} onChange={(e) => updateEntry(index, "comment", e.target.value)} placeholder="Détail de l'intervention..." />

            <div className="line-footer">
              <strong>{calculateHours(entry.start_time, entry.end_time, entry.break_minutes).toFixed(2)} h</strong>
              {entries.length > 1 && <button className="btn danger" onClick={() => removeLine(index)}>Supprimer</button>}
            </div>
          </div>
        ))}

        <div className="actions">
          <button className="btn secondary" onClick={addLine}>Ajouter un projet</button>
          <button className="btn primary" onClick={saveDay}>Enregistrer la journée</button>
        </div>
      </div>
    </section>
  );
}
