import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";

const LISTS = [
  { key: "families", title: "Familles produits", table: "crm_product_families", placeholder: "Ex : Fontaine, assise circulaire..." },
  { key: "sectors", title: "Secteurs", table: "crm_sectors", placeholder: "Ex : Promoteur, aménageur..." },
  { key: "sources", title: "Sources de leads", table: "crm_lead_sources", placeholder: "Ex : Salon des maires..." },
  { key: "competitors", title: "Concurrents", table: "crm_competitors", placeholder: "Nom concurrent" },
];

export default function CommercialSettings({ user, setMessage }) {
  const [stages, setStages] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [lists, setLists] = useState({
    families: [],
    sectors: [],
    sources: [],
    competitors: [],
  });

  const [listForms, setListForms] = useState({
    families: "",
    sectors: "",
    sources: "",
    competitors: "",
  });

  const [objectiveForm, setObjectiveForm] = useState({
    employee_id: "",
    objective_year: new Date().getFullYear(),
    annual_target: "",
    notes: "",
  });

  useEffect(() => {
    loadCommercialSettings();
  }, []);

  async function loadCommercialSettings() {
    const [
      stagesResponse,
      employeesResponse,
      objectivesResponse,
      familiesResponse,
      sectorsResponse,
      sourcesResponse,
      competitorsResponse,
    ] = await Promise.all([
      supabase.from("crm_pipeline_stages").select("*").eq("active", true).order("stage_order"),
      supabase.from("employees").select("*").eq("active", true).order("name"),
      supabase.from("crm_commercial_objectives").select("*").eq("active", true).order("objective_year", { ascending: false }),
      supabase.from("crm_product_families").select("*").eq("active", true).order("name"),
      supabase.from("crm_sectors").select("*").eq("active", true).order("name"),
      supabase.from("crm_lead_sources").select("*").eq("active", true).order("name"),
      supabase.from("crm_competitors").select("*").eq("active", true).order("name"),
    ]);

    const error =
      stagesResponse.error ||
      employeesResponse.error ||
      objectivesResponse.error ||
      familiesResponse.error ||
      sectorsResponse.error ||
      sourcesResponse.error ||
      competitorsResponse.error;

    if (error) {
      setMessage?.(error.message);
      return;
    }

    setStages(stagesResponse.data || []);
    setEmployees(employeesResponse.data || []);
    setObjectives(objectivesResponse.data || []);
    setLists({
      families: familiesResponse.data || [],
      sectors: sectorsResponse.data || [],
      sources: sourcesResponse.data || [],
      competitors: competitorsResponse.data || [],
    });
  }

  function employeeName(id) {
    return employees.find((employee) => employee.id === id)?.name || "Non affecté";
  }

  async function updateStage(stage, patch) {
    const { error } = await supabase
      .from("crm_pipeline_stages")
      .update(patch)
      .eq("id", stage.id);

    if (error) {
      setMessage?.(error.message);
      return;
    }

    setMessage?.("Paramètre d'étape modifié.");
    await loadCommercialSettings();
  }

  async function addListItem(listConfig) {
    const value = listForms[listConfig.key]?.trim();

    if (!value) {
      setMessage?.("Nom obligatoire.");
      return;
    }

    const { error } = await supabase.from(listConfig.table).insert({
      name: value,
      active: true,
    });

    if (error) {
      setMessage?.(error.message);
      return;
    }

    setListForms((current) => ({ ...current, [listConfig.key]: "" }));
    setMessage?.("Élément ajouté.");
    await loadCommercialSettings();
  }

  async function renameListItem(listConfig, item) {
    const name = window.prompt("Nouveau nom ?", item.name);
    if (name === null) return;

    const { error } = await supabase
      .from(listConfig.table)
      .update({ name })
      .eq("id", item.id);

    if (error) {
      setMessage?.(error.message);
      return;
    }

    setMessage?.("Élément modifié.");
    await loadCommercialSettings();
  }

  async function archiveListItem(listConfig, item) {
    const ok = window.confirm(`Archiver "${item.name}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from(listConfig.table)
      .update({ active: false })
      .eq("id", item.id);

    if (error) {
      setMessage?.(error.message);
      return;
    }

    setMessage?.("Élément archivé.");
    await loadCommercialSettings();
  }

  async function createObjective(e) {
    e.preventDefault();

    if (!objectiveForm.employee_id) {
      setMessage?.("Choisis un commercial.");
      return;
    }

    const { error } = await supabase.from("crm_commercial_objectives").insert({
      employee_id: objectiveForm.employee_id,
      objective_year: Number(objectiveForm.objective_year || new Date().getFullYear()),
      annual_target: Number(objectiveForm.annual_target || 0),
      notes: objectiveForm.notes || null,
      active: true,
    });

    if (error) {
      setMessage?.(error.message);
      return;
    }

    setObjectiveForm({
      employee_id: "",
      objective_year: new Date().getFullYear(),
      annual_target: "",
      notes: "",
    });

    setMessage?.("Objectif commercial ajouté.");
    await loadCommercialSettings();
  }

  async function archiveObjective(objective) {
    const ok = window.confirm("Archiver cet objectif ?");
    if (!ok) return;

    const { error } = await supabase
      .from("crm_commercial_objectives")
      .update({ active: false })
      .eq("id", objective.id);

    if (error) {
      setMessage?.(error.message);
      return;
    }

    setMessage?.("Objectif archivé.");
    await loadCommercialSettings();
  }

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
  }

  return (
    <div className="commercial-settings">
      <div className="card">
        <div className="page-head">
          <div>
            <h3>Paramètres commerciaux</h3>
            <p>Probabilités, délais moyens, pipe et objectifs utilisés par le CRM et la Business Intelligence.</p>
          </div>

          <button className="btn secondary" onClick={loadCommercialSettings}>
            Actualiser
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Étapes du pipeline</h3>
        <p>Ces paramètres servent au pipe pondéré et aux prévisions.</p>

        <div className="commercial-stage-list">
          {stages.map((stage) => (
            <div className="commercial-stage-row" key={stage.id}>
              <div className="commercial-stage-title">
                <span style={{ background: stage.color || "#2563eb" }} />
                <strong>{stage.stage_order}. {stage.name}</strong>
              </div>

              <div>
                <label>Probabilité %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={stage.default_probability_percent ?? 30}
                  onChange={(e) => updateStage(stage, { default_probability_percent: Number(e.target.value || 0) })}
                />
              </div>

              <div>
                <label>Délai moyen jours</label>
                <input
                  type="number"
                  min="0"
                  value={stage.average_duration_days ?? 14}
                  onChange={(e) => updateStage(stage, { average_duration_days: Number(e.target.value || 0) })}
                />
              </div>

              <div className="commercial-switch">
                <label>Compte dans le pipe</label>
                <button
                  type="button"
                  className={stage.counts_in_pipeline !== false ? "btn small primary" : "btn small"}
                  onClick={() => updateStage(stage, { counts_in_pipeline: stage.counts_in_pipeline === false })}
                >
                  {stage.counts_in_pipeline !== false ? "Oui" : "Non"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="commercial-settings-grid">
        {LISTS.map((listConfig) => (
          <div className="card" key={listConfig.key}>
            <h3>{listConfig.title}</h3>

            <div className="admin-inline-form">
              <input
                value={listForms[listConfig.key]}
                onChange={(e) => setListForms((current) => ({ ...current, [listConfig.key]: e.target.value }))}
                placeholder={listConfig.placeholder}
              />
              <button className="btn primary" type="button" onClick={() => addListItem(listConfig)}>
                Ajouter
              </button>
            </div>

            <div className="admin-list">
              {(lists[listConfig.key] || []).map((item) => (
                <div className="admin-row" key={item.id}>
                  <strong>{item.name}</strong>
                  <div className="inline-actions">
                    <button className="btn small" onClick={() => renameListItem(listConfig, item)}>
                      Modifier
                    </button>
                    <button className="btn small danger-soft" onClick={() => archiveListItem(listConfig, item)}>
                      Archiver
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Objectifs commerciaux</h3>

        <form className="commercial-objective-form" onSubmit={createObjective}>
          <div>
            <label>Commercial</label>
            <select value={objectiveForm.employee_id} onChange={(e) => setObjectiveForm({ ...objectiveForm, employee_id: e.target.value })}>
              <option value="">Choisir</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Année</label>
            <input
              type="number"
              value={objectiveForm.objective_year}
              onChange={(e) => setObjectiveForm({ ...objectiveForm, objective_year: e.target.value })}
            />
          </div>

          <div>
            <label>Objectif annuel</label>
            <input
              type="number"
              value={objectiveForm.annual_target}
              onChange={(e) => setObjectiveForm({ ...objectiveForm, annual_target: e.target.value })}
            />
          </div>

          <div>
            <label>Notes</label>
            <input
              value={objectiveForm.notes}
              onChange={(e) => setObjectiveForm({ ...objectiveForm, notes: e.target.value })}
            />
          </div>

          <button className="btn primary">Ajouter</button>
        </form>

        <div className="admin-list">
          {objectives.map((objective) => (
            <div className="admin-row" key={objective.id}>
              <div>
                <strong>{employeeName(objective.employee_id)}</strong>
                <small>{objective.objective_year} · {formatMoney(objective.annual_target)}</small>
              </div>

              <button className="btn small danger-soft" onClick={() => archiveObjective(objective)}>
                Archiver
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
