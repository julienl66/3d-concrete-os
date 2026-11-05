import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";

const secondsOf = (row, now) => Number(row.elapsed_seconds || 0) + (row.status === "running" && row.started_at ? Math.max(0, (now - new Date(row.started_at).getTime()) / 1000) : 0);
const formatTime = (seconds) => { const s = Math.floor(Math.max(0, seconds)); return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const hours = (seconds) => `${(seconds / 3600).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h`;
const today = () => new Date().toLocaleDateString("en-CA");

export default function TempsRobots({ user }) {
  const [robots, setRobots] = useState([]);
  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [robotId, setRobotId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [robotName, setRobotName] = useState("");
  const [manual, setManual] = useState({ date: today(), duration: "", notes: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [filterRobot, setFilterRobot] = useState("");
  const [filterProject, setFilterProject] = useState("");

  async function reload() {
    const [r, p, e] = await Promise.all([
      supabase.from("robots").select("*").order("name"),
      supabase.from("projects").select("id,name,project_code").order("name"),
      supabase.from("robot_time_entries").select("*").order("created_at", { ascending: false }).limit(2000),
    ]);
    const error = r.error || p.error || e.error;
    if (error) { setMessage(`Erreur Supabase : ${error.message}. Vérifie que le SQL fourni a été exécuté.`); return; }
    setRobots(r.data || []); setProjects(p.data || []); setEntries(e.data || []);
  }
  useEffect(() => { reload(); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const active = entries.find((e) => String(e.robot_id) === robotId && ["running", "paused"].includes(e.status));
  const anyActive = entries.find((e) => String(e.robot_id) === robotId && ["running", "paused"].includes(e.status));
  const selected = entries.filter((e) => (!filterRobot || String(e.robot_id) === filterRobot) && (!filterProject || String(e.project_id) === filterProject));
  const total = selected.reduce((sum, e) => sum + secondsOf(e, now), 0);
  const byRobot = useMemo(() => robots.map((r) => ({ name: r.name, seconds: selected.filter((e) => String(e.robot_id) === String(r.id)).reduce((s, e) => s + secondsOf(e, now), 0) })).filter((r) => r.seconds > 0), [robots, selected, now]);
  const byProject = useMemo(() => projects.map((p) => ({ name: p.name, seconds: selected.filter((e) => String(e.project_id) === String(p.id)).reduce((s, e) => s + secondsOf(e, now), 0) })).filter((p) => p.seconds > 0), [projects, selected, now]);
  const robotLabel = (id) => robots.find((r) => String(r.id) === String(id))?.name || "Robot supprimé";
  const projectLabel = (id) => projects.find((p) => String(p.id) === String(id))?.name || "Projet supprimé";

  async function act(kind) {
    if (!robotId || (kind === "start" && !projectId)) { setMessage("Sélectionne un robot et un projet."); return; }
    setBusy(true); setMessage("");
    try {
      let error;
      if (kind === "start") {
        if (anyActive) throw new Error("Ce robot possède déjà un chronomètre actif.");
        ({ error } = await supabase.from("robot_time_entries").insert({ robot_id: robotId, project_id: projectId, status: "running", started_at: new Date().toISOString(), elapsed_seconds: 0, entry_date: today(), created_by: user?.name || "" }));
      } else {
        if (!active) throw new Error("Aucun chronomètre actif pour ce robot.");
        const elapsed = Math.round(secondsOf(active, Date.now()));
        const patch = kind === "pause" ? { status: "paused", started_at: null, elapsed_seconds: elapsed } : kind === "resume" ? { status: "running", started_at: new Date().toISOString() } : { status: "completed", started_at: null, elapsed_seconds: elapsed, finished_at: new Date().toISOString() };
        if (kind === "resume") delete patch.elapsed_seconds;
        ({ error } = await supabase.from("robot_time_entries").update(patch).eq("id", active.id).eq("status", active.status));
      }
      if (error) throw error;
      await reload();
    } catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  }

  async function addManual(event) {
    event.preventDefault();
    const duration = Number(manual.duration);
    if (!robotId || !projectId || !manual.date || !Number.isFinite(duration) || duration <= 0) { setMessage("Renseigne robot, projet, date et durée positive (en heures)."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.from("robot_time_entries").insert({ robot_id: robotId, project_id: projectId, entry_date: manual.date, elapsed_seconds: Math.round(duration * 3600), status: "completed", source: "manual", notes: manual.notes, created_by: user?.name || "" });
    if (error) setMessage(error.message); else { setManual({ date: today(), duration: "", notes: "" }); await reload(); setMessage("Temps enregistré."); }
    setBusy(false);
  }

  async function addRobot(event) {
    event.preventDefault(); if (!robotName.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("robots").insert({ name: robotName.trim() });
    if (error) setMessage(error.message); else { setRobotName(""); await reload(); }
    setBusy(false);
  }

  async function removeEntry(id) {
    if (!window.confirm("Supprimer définitivement cet enregistrement de temps ?")) return;
    const { error } = await supabase.from("robot_time_entries").delete().eq("id", id);
    if (error) setMessage(error.message); else await reload();
  }

  return <section className="page robot-time-page">
    <h1>⏱️ Temps robots</h1>
    <p>Chronomètre et suivi des heures de fonctionnement par robot et par projet.</p>
    {message && <div className="card" role="status">{message}</div>}
    <div className="card"><h2>Choisir le robot et le projet</h2>
      <div className="robot-time-fields">
        <label>Robot<select value={robotId} onChange={(e) => { setRobotId(e.target.value); setMessage(""); }}><option value="">Sélectionner un robot</option>{robots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Projet<select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Sélectionner un projet</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.project_code ? `${p.project_code} — ` : ""}{p.name}</option>)}</select></label>
      </div>
      <form onSubmit={addRobot} className="robot-time-inline"><input value={robotName} onChange={(e) => setRobotName(e.target.value)} placeholder="Nom d'un nouveau robot" aria-label="Nom du nouveau robot" /><button type="submit" disabled={busy}>Ajouter un robot</button></form>
    </div>
    <div className="card"><h2>Chronomètre</h2>
      <div className="robot-time-clock">{formatTime(active ? secondsOf(active, now) : 0)}</div>
      {active && <p>Projet en cours : <strong>{projectLabel(active.project_id)}</strong> — {active.status === "running" ? "En marche" : "En pause"}</p>}
      <div className="robot-time-inline">
        {!active && <button disabled={busy || !robotId || !projectId} onClick={() => act("start")}>▶ Démarrer</button>}
        {active?.status === "running" && <button disabled={busy} onClick={() => act("pause")}>⏸ Pause</button>}
        {active?.status === "paused" && <button disabled={busy} onClick={() => act("resume")}>▶ Reprendre</button>}
        {active && <button disabled={busy} onClick={() => act("stop")}>■ Terminer et enregistrer</button>}
      </div>
      <small>Le chronomètre est enregistré dans Supabase et continue après la fermeture de l'ERP. Un seul chronomètre actif par robot.</small>
    </div>
    <div className="card"><h2>Ajouter un temps manuellement</h2>
      <form onSubmit={addManual} className="robot-time-fields">
        <label>Date<input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} required /></label>
        <label>Durée (heures)<input type="number" min="0.01" step="0.01" placeholder="Ex. 2,5" value={manual.duration} onChange={(e) => setManual({ ...manual, duration: e.target.value })} required /></label>
        <label className="robot-time-wide">Commentaire<input value={manual.notes} onChange={(e) => setManual({ ...manual, notes: e.target.value })} placeholder="Impression, préparation, essai…" /></label>
        <button disabled={busy || !robotId || !projectId} type="submit">Enregistrer les heures</button>
      </form>
    </div>
    <div className="card"><h2>Statistiques et historique</h2>
      <div className="robot-time-fields"><label>Filtrer par robot<select value={filterRobot} onChange={(e) => setFilterRobot(e.target.value)}><option value="">Tous les robots</option>{robots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Filtrer par projet<select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}><option value="">Tous les projets</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
      <h3>Total : {hours(total)}</h3>
      <div className="robot-time-fields"><div><h3>Par robot</h3>{byRobot.map((r) => <p key={r.name}>{r.name} : <strong>{hours(r.seconds)}</strong></p>)}</div><div><h3>Par projet</h3>{byProject.map((p) => <p key={p.name}>{p.name} : <strong>{hours(p.seconds)}</strong></p>)}</div></div>
      <div className="robot-time-scroll"><table><thead><tr><th>Date</th><th>Robot</th><th>Projet</th><th>Durée</th><th>Type / état</th><th>Commentaire</th><th></th></tr></thead><tbody>{selected.map((e) => <tr key={e.id}><td>{e.entry_date}</td><td>{robotLabel(e.robot_id)}</td><td>{projectLabel(e.project_id)}</td><td>{formatTime(secondsOf(e, now))}</td><td>{e.source === "manual" ? "Manuel" : e.status === "running" ? "En marche" : e.status === "paused" ? "En pause" : "Chronomètre"}</td><td>{e.notes || "—"}</td><td><button onClick={() => removeEntry(e.id)} disabled={busy}>Supprimer</button></td></tr>)}</tbody></table></div>
      {entries.length >= 2000 && <p>Affichage limité aux 2 000 derniers enregistrements.</p>}
    </div>
  </section>;
}
