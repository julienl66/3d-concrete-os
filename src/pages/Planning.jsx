import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";

const PRIORITIES = [
  { value: "low", label: "Basse", className: "priority-low" },
  { value: "normal", label: "Normale", className: "priority-normal" },
  { value: "high", label: "Haute", className: "priority-high" },
  { value: "urgent", label: "Urgente", className: "priority-urgent" },
];

const PRODUCTION_STATUSES = [
  { value: "planned", label: "Planifiée", className: "status-planned" },
  { value: "in_progress", label: "En cours", className: "status-progress" },
  { value: "paused", label: "En pause", className: "status-paused" },
  { value: "done", label: "Terminée", className: "status-done" },
];

const INSTALLATION_STATUSES = [
  { value: "planned", label: "Planifiée", className: "status-planned" },
  { value: "in_progress", label: "En cours", className: "status-progress" },
  { value: "done", label: "Posée", className: "status-done" },
  { value: "cancelled", label: "Annulée", className: "status-cancelled" },
];

export default function Planning({ user }) {
  const [projects, setProjects] = useState([]);
  const [production, setProduction] = useState([]);
  const [installation, setInstallation] = useState([]);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    loadPlanning();
  }, []);

  async function loadPlanning() {
    const { data: projectsData, error: projectsError } = await supabase
      .from("projects")
      .select("*")
      .eq("active", true)
      .order("validated_delivery_date", { ascending: true });

    if (projectsError) {
      setMessage(projectsError.message);
      return;
    }

    const { data: productionData, error: productionError } = await supabase
      .from("production_planning")
      .select("*, projects(name, client_name, project_code, validated_delivery_date, validated_installation_date)")
      .order("planned_start", { ascending: true });

    if (productionError) {
      setMessage(productionError.message);
      return;
    }

    const { data: installationData, error: installationError } = await supabase
      .from("installation_planning")
      .select("*, projects(name, client_name, project_code, validated_delivery_date, validated_installation_date)")
      .order("planned_date", { ascending: true });

    if (installationError) {
      setMessage(installationError.message);
      return;
    }

    setProjects(projectsData || []);
    setProduction(productionData || []);
    setInstallation(installationData || []);
  }

  function optionInfo(options, value) {
    return options.find((option) => option.value === value) || options[0];
  }

  function isLate(dateValue) {
    if (!dateValue) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateValue);
    return date < today;
  }

  function isThisWeek(dateValue) {
    if (!dateValue) return false;
    const today = new Date();
    const date = new Date(dateValue);
    const diff = date - today;
    return diff >= -86400000 && diff <= 7 * 86400000;
  }

  async function createProduction(project) {
    const alreadyExists = production.some((item) => item.project_id === project.id);

    if (alreadyExists) {
      const ok = window.confirm("Ce projet est déjà en planning production. Ajouter une nouvelle ligne quand même ?");
      if (!ok) return;
    }

    const { error } = await supabase.from("production_planning").insert({
      project_id: project.id,
      title: `${project.project_code || ""} ${project.name}`.trim(),
      planned_start: project.production_start_date || project.validated_delivery_date || null,
      planned_end: project.production_end_date || project.validated_delivery_date || null,
      priority: "normal",
      status: "planned",
      notes: "Créé depuis le planning global",
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Production ajoutée au planning.");
    loadPlanning();
  }

  async function createInstallation(project) {
    const alreadyExists = installation.some((item) => item.project_id === project.id);

    if (alreadyExists) {
      const ok = window.confirm("Ce projet est déjà en planning pose. Ajouter une nouvelle ligne quand même ?");
      if (!ok) return;
    }

    const { error } = await supabase.from("installation_planning").insert({
      project_id: project.id,
      title: `${project.project_code || ""} ${project.name}`.trim(),
      planned_date: project.validated_installation_date || null,
      location: project.project_address || project.client_name || "",
      status: "planned",
      notes: "Créé depuis le planning global",
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Pose ajoutée au planning.");
    loadPlanning();
  }

  async function updateProduction(item, patch) {
    const { error } = await supabase
      .from("production_planning")
      .update(patch)
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Planning production modifié.");
    loadPlanning();
  }

  async function updateInstallation(item, patch) {
    const { error } = await supabase
      .from("installation_planning")
      .update(patch)
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Planning pose modifié.");
    loadPlanning();
  }

  async function deleteProduction(item) {
    const ok = window.confirm(`Supprimer la planification production "${item.title}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("production_planning")
      .delete()
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Ligne production supprimée.");
    loadPlanning();
  }

  async function deleteInstallation(item) {
    const ok = window.confirm(`Supprimer la planification pose "${item.title}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("installation_planning")
      .delete()
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Ligne pose supprimée.");
    loadPlanning();
  }

  function isProductionPlanned(projectId) {
    return production.some((item) => item.project_id === projectId);
  }

  function isInstallationPlanned(projectId) {
    return installation.some((item) => item.project_id === projectId);
  }

  const filteredProduction = production.filter((item) => {
    if (filter === "all") return true;
    if (filter === "urgent") return item.priority === "urgent";
    if (filter === "in_progress") return item.status === "in_progress";
    if (filter === "late") return isLate(item.planned_end) && item.status !== "done";
    if (filter === "done") return item.status === "done";
    if (filter === "week") return isThisWeek(item.planned_start) || isThisWeek(item.planned_end);
    return true;
  });

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Planning</p>
          <h2>Production & pose</h2>
          <p>Planning global avec priorités, statuts, alertes et code couleur.</p>
        </div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="stats-grid">
        <div className="stat-card">
          <span>Projets actifs</span>
          <strong>{projects.length}</strong>
        </div>

        <div className="stat-card">
          <span>Productions planifiées</span>
          <strong>{production.length}</strong>
        </div>

        <div className="stat-card accent">
          <span>Poses planifiées</span>
          <strong>{installation.length}</strong>
        </div>
      </div>

      <div className="planning-filters">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Tous</button>
        <button className={filter === "urgent" ? "active" : ""} onClick={() => setFilter("urgent")}>Urgents</button>
        <button className={filter === "in_progress" ? "active" : ""} onClick={() => setFilter("in_progress")}>En cours</button>
        <button className={filter === "late" ? "active" : ""} onClick={() => setFilter("late")}>En retard</button>
        <button className={filter === "week" ? "active" : ""} onClick={() => setFilter("week")}>Cette semaine</button>
        <button className={filter === "done" ? "active" : ""} onClick={() => setFilter("done")}>Terminés</button>
      </div>

      <div className="card">
        <h3>Projets à planifier</h3>

        <table>
          <thead>
            <tr>
              <th>Projet</th>
              <th>Client</th>
              <th>Livrabilité</th>
              <th>Pose</th>
              <th>Production</th>
              <th>Pose</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>
                  <strong>{project.project_code || "Sans code"}</strong>
                  <br />
                  <small>{project.name}</small>
                </td>

                <td>{project.client_name || "-"}</td>
                <td>{project.validated_delivery_date || "-"}</td>
                <td>{project.validated_installation_date || "-"}</td>

                <td>
                  {isProductionPlanned(project.id) ? (
                    <span className="status-pill validated">Planifiée</span>
                  ) : (
                    <span className="status-pill refused">À faire</span>
                  )}
                </td>

                <td>
                  {isInstallationPlanned(project.id) ? (
                    <span className="status-pill validated">Planifiée</span>
                  ) : (
                    <span className="status-pill refused">À faire</span>
                  )}
                </td>

                <td>
                  <div className="inline-actions">
                    <button className="btn small" onClick={() => createProduction(project)}>
                      Planifier prod
                    </button>
                    <button className="btn small" onClick={() => createInstallation(project)}>
                      Planifier pose
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="planning-grid">
        <div className="card">
          <h3>Planning production</h3>

          {filteredProduction.length === 0 ? (
            <p>Aucune production dans ce filtre.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Projet</th>
                  <th>Début</th>
                  <th>Fin</th>
                  <th>Alerte</th>
                  <th>Priorité</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredProduction.map((item) => {
                  const priority = optionInfo(PRIORITIES, item.priority || "normal");
                  const status = optionInfo(PRODUCTION_STATUSES, item.status || "planned");
                  const late = isLate(item.planned_end) && item.status !== "done";

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.projects?.project_code || ""}</strong>
                        <br />
                        <small>{item.title || item.projects?.name}</small>
                      </td>

                      <td>
                        <input
                          type="date"
                          value={item.planned_start || ""}
                          onChange={(e) => updateProduction(item, { planned_start: e.target.value || null })}
                        />
                      </td>

                      <td>
                        <input
                          type="date"
                          value={item.planned_end || ""}
                          onChange={(e) => updateProduction(item, { planned_end: e.target.value || null })}
                        />
                      </td>

                      <td>
                        {late ? (
                          <span className="planning-badge alert-red">En retard</span>
                        ) : isThisWeek(item.planned_end) ? (
                          <span className="planning-badge alert-orange">Cette semaine</span>
                        ) : (
                          <span className="planning-badge alert-green">OK</span>
                        )}
                      </td>

                      <td>
                        <span className={`planning-badge ${priority.className}`}>
                          {priority.label}
                        </span>
                        <select
                          value={item.priority || "normal"}
                          onChange={(e) => updateProduction(item, { priority: e.target.value })}
                        >
                          {PRIORITIES.map((priority) => (
                            <option key={priority.value} value={priority.value}>
                              {priority.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <span className={`planning-badge ${status.className}`}>
                          {status.label}
                        </span>
                        <select
                          value={item.status || "planned"}
                          onChange={(e) => updateProduction(item, { status: e.target.value })}
                        >
                          {PRODUCTION_STATUSES.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <button className="btn small danger-soft" onClick={() => deleteProduction(item)}>
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>Planning pose</h3>

          {installation.length === 0 ? (
            <p>Aucune pose planifiée.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Projet</th>
                  <th>Date</th>
                  <th>Alerte</th>
                  <th>Lieu</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {installation.map((item) => {
                  const status = optionInfo(INSTALLATION_STATUSES, item.status || "planned");
                  const late = isLate(item.planned_date) && item.status !== "done";

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.projects?.project_code || ""}</strong>
                        <br />
                        <small>{item.title || item.projects?.name}</small>
                      </td>

                      <td>
                        <input
                          type="date"
                          value={item.planned_date || ""}
                          onChange={(e) => updateInstallation(item, { planned_date: e.target.value || null })}
                        />
                      </td>

                      <td>
                        {late ? (
                          <span className="planning-badge alert-red">En retard</span>
                        ) : isThisWeek(item.planned_date) ? (
                          <span className="planning-badge alert-orange">Cette semaine</span>
                        ) : (
                          <span className="planning-badge alert-green">OK</span>
                        )}
                      </td>

                      <td>
                        <input
                          value={item.location || ""}
                          onChange={(e) => updateInstallation(item, { location: e.target.value || null })}
                          placeholder="Lieu de pose"
                        />
                      </td>

                      <td>
                        <span className={`planning-badge ${status.className}`}>
                          {status.label}
                        </span>
                        <select
                          value={item.status || "planned"}
                          onChange={(e) => updateInstallation(item, { status: e.target.value })}
                        >
                          {INSTALLATION_STATUSES.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <button className="btn small danger-soft" onClick={() => deleteInstallation(item)}>
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
