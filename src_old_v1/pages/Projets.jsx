import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";

export default function Projets({ user }) {
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState("");

  useEffect(() => { loadProjects(); }, []);

  if (user.role !== "admin") return <div className="alert error">Accès réservé administrateur.</div>;

  async function loadProjects() {
    const { data } = await supabase.from("projects").select("*").order("name");
    setProjects(data || []);
  }

  async function addProject(e) {
    e.preventDefault();
    if (!name.trim()) return;

    await supabase.from("projects").insert({ name: name.trim(), active: true });
    setName("");
    loadProjects();
  }

  async function toggleActive(project) {
    await supabase.from("projects").update({ active: !project.active }).eq("id", project.id);
    loadProjects();
  }

  return (
    <section className="page">
      <h2>Projets</h2>

      <div className="card">
        <h3>Ajouter un projet</h3>
        <form onSubmit={addProject} className="grid">
          <div>
            <label>Nom du projet</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Banque CMA" />
          </div>
          <div className="align-end"><button className="btn primary">Ajouter</button></div>
        </form>
      </div>

      <div className="card">
        <h3>Liste des projets</h3>
        <table>
          <thead><tr><th>Nom</th><th>Actif</th><th>Action</th></tr></thead>
          <tbody>
            {projects.map(project => (
              <tr key={project.id}>
                <td>{project.name}</td>
                <td>{project.active ? "Oui" : "Non"}</td>
                <td><button className="btn small" onClick={() => toggleActive(project)}>{project.active ? "Archiver" : "Réactiver"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
