import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";

export default function Administration({ user }) {
  const [activities, setActivities] = useState([]);
  const [stockCategories, setStockCategories] = useState([]);
  const [taskTypes, setTaskTypes] = useState([]);
  const [workflowTemplates, setWorkflowTemplates] = useState([]);
  const [workflowSteps, setWorkflowSteps] = useState([]);
  const [resources, setResources] = useState([]);
  const [biSettings, setBiSettings] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [message, setMessage] = useState("");

  const [activityForm, setActivityForm] = useState({
    name: "",
    color: "#2563eb",
  });

  const [stockCategoryName, setStockCategoryName] = useState("");

  const [taskTypeForm, setTaskTypeForm] = useState({
    name: "",
    color: "#2563eb",
  });

  const [workflowTemplateName, setWorkflowTemplateName] = useState("");

  const [workflowStepForm, setWorkflowStepForm] = useState({
    name: "",
    step_order: 1,
    default_duration_days: 1,
    task_type_id: "",
  });

  const [resourceForm, setResourceForm] = useState({
    name: "",
    resource_type: "machine",
    status: "available",
    notes: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedTemplateId && workflowTemplates.length > 0) {
      setSelectedTemplateId(workflowTemplates[0].id);
    }
  }, [workflowTemplates, selectedTemplateId]);

  async function loadData() {
    await Promise.all([loadActivities(), loadStockCategories(), loadTaskTypes(), loadWorkflowTemplates(), loadWorkflowSteps(), loadResources(), loadBiSettings()]);
  }

  async function loadBiSettings() {
    const { data, error } = await supabase
      .from("bi_settings")
      .select("*")
      .order("setting_order");

    if (error) {
      setMessage(error.message);
      return;
    }

    setBiSettings(data || []);
  }

  async function updateBiSetting(setting) {
    const value = window.prompt(setting.label || setting.setting_key, setting.setting_value || "");
    if (value === null) return;

    const { error } = await supabase
      .from("bi_settings")
      .update({ setting_value: value })
      .eq("id", setting.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Objectif BI modifié.");
    loadBiSettings();
  }

  async function loadActivities() {
    const { data, error } = await supabase
      .from("work_activities")
      .select("*")
      .eq("active", true)
      .order("name");

    if (error) {
      setMessage(error.message);
      return;
    }

    setActivities(data || []);
  }

  async function loadStockCategories() {
    const { data, error } = await supabase
      .from("stock_categories")
      .select("*")
      .eq("active", true)
      .order("name");

    if (error) {
      setMessage(error.message);
      return;
    }

    setStockCategories(data || []);
  }

  async function createActivity(e) {
    e.preventDefault();

    if (!activityForm.name) {
      setMessage("Nom de l'activité obligatoire.");
      return;
    }

    const { error } = await supabase.from("work_activities").insert({
      name: activityForm.name,
      color: activityForm.color || "#2563eb",
      active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setActivityForm({
      name: "",
      color: "#2563eb",
    });

    setMessage("Activité ajoutée.");
    loadActivities();
  }

  async function renameActivity(activity) {
    const name = window.prompt("Nouveau nom de l'activité ?", activity.name);
    if (name === null) return;

    const { error } = await supabase
      .from("work_activities")
      .update({ name })
      .eq("id", activity.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Activité modifiée.");
    loadActivities();
  }

  async function changeActivityColor(activity) {
    const color = window.prompt("Couleur HEX ?", activity.color || "#2563eb");
    if (color === null) return;

    const { error } = await supabase
      .from("work_activities")
      .update({ color })
      .eq("id", activity.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Couleur modifiée.");
    loadActivities();
  }

  async function deleteActivity(activity) {
    const ok = window.confirm(
      `Supprimer l'activité "${activity.name}" ? Les anciens pointages resteront en base.`
    );

    if (!ok) return;

    const { error } = await supabase
      .from("work_activities")
      .update({ active: false })
      .eq("id", activity.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Activité supprimée.");
    loadActivities();
  }

  async function createStockCategory(e) {
    e.preventDefault();

    if (!stockCategoryName) {
      setMessage("Nom de sous-catégorie obligatoire.");
      return;
    }

    const { error } = await supabase.from("stock_categories").insert({
      name: stockCategoryName,
      active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setStockCategoryName("");
    setMessage("Sous-catégorie stock ajoutée.");
    loadStockCategories();
  }

  async function renameStockCategory(category) {
    const name = window.prompt("Nouveau nom de la sous-catégorie ?", category.name);
    if (name === null) return;

    const { error } = await supabase
      .from("stock_categories")
      .update({ name })
      .eq("id", category.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Sous-catégorie modifiée.");
    loadStockCategories();
  }

  async function deleteStockCategory(category) {
    const ok = window.confirm(
      `Supprimer la sous-catégorie "${category.name}" ? Les articles liés passeront sans sous-catégorie.`
    );

    if (!ok) return;

    const { error: unlinkError } = await supabase
      .from("stock_items")
      .update({ category_id: null })
      .eq("category_id", category.id);

    if (unlinkError) {
      setMessage(unlinkError.message);
      return;
    }

    const { error } = await supabase
      .from("stock_categories")
      .update({ active: false })
      .eq("id", category.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Sous-catégorie supprimée.");
    loadStockCategories();
  }

  async function loadTaskTypes() {
    const { data, error } = await supabase
      .from("production_task_types")
      .select("*")
      .eq("active", true)
      .order("name");

    if (error) {
      setMessage(error.message);
      return;
    }

    setTaskTypes(data || []);
  }

  async function createTaskType(e) {
    e.preventDefault();

    if (!taskTypeForm.name) {
      setMessage("Nom de tâche obligatoire.");
      return;
    }

    const { error } = await supabase.from("production_task_types").insert({
      name: taskTypeForm.name,
      color: taskTypeForm.color || "#2563eb",
      active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setTaskTypeForm({
      name: "",
      color: "#2563eb",
    });

    setMessage("Type de tâche ajouté.");
    loadTaskTypes();
  }

  async function renameTaskType(taskType) {
    const name = window.prompt("Nouveau nom du type de tâche ?", taskType.name);
    if (name === null) return;

    const { error } = await supabase
      .from("production_task_types")
      .update({ name })
      .eq("id", taskType.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Type de tâche modifié.");
    loadTaskTypes();
  }

  async function changeTaskTypeColor(taskType) {
    const color = window.prompt("Couleur HEX ?", taskType.color || "#2563eb");
    if (color === null) return;

    const { error } = await supabase
      .from("production_task_types")
      .update({ color })
      .eq("id", taskType.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Couleur modifiée.");
    loadTaskTypes();
  }

  async function deleteTaskType(taskType) {
    const ok = window.confirm(
      `Supprimer le type de tâche "${taskType.name}" ? Les anciennes tâches conserveront leur historique.`
    );

    if (!ok) return;

    const { error } = await supabase
      .from("production_task_types")
      .update({ active: false })
      .eq("id", taskType.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Type de tâche supprimé.");
    loadTaskTypes();
  }

  async function loadWorkflowTemplates() {
    const { data, error } = await supabase
      .from("project_workflow_templates")
      .select("*")
      .eq("active", true)
      .order("name");

    if (error) {
      setMessage(error.message);
      return;
    }

    setWorkflowTemplates(data || []);
  }

  async function loadWorkflowSteps() {
    const { data, error } = await supabase
      .from("project_workflow_steps")
      .select("*, production_task_types(name, color)")
      .eq("active", true)
      .order("step_order", { ascending: true });

    if (error) {
      setMessage(error.message);
      return;
    }

    setWorkflowSteps(data || []);
  }

  async function createWorkflowTemplate(e) {
    e.preventDefault();

    if (!workflowTemplateName) {
      setMessage("Nom du modèle obligatoire.");
      return;
    }

    const { data, error } = await supabase
      .from("project_workflow_templates")
      .insert({
        name: workflowTemplateName,
        active: true,
      })
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setWorkflowTemplateName("");
    setSelectedTemplateId(data.id);
    setMessage("Modèle de workflow ajouté.");
    await loadWorkflowTemplates();
  }

  async function renameWorkflowTemplate(template) {
    const name = window.prompt("Nouveau nom du modèle ?", template.name);
    if (name === null) return;

    const { error } = await supabase
      .from("project_workflow_templates")
      .update({ name })
      .eq("id", template.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Modèle renommé.");
    await loadWorkflowTemplates();
  }

  async function deleteWorkflowTemplate(template) {
    const ok = window.confirm(`Archiver le modèle "${template.name}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("project_workflow_templates")
      .update({ active: false })
      .eq("id", template.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (selectedTemplateId === template.id) {
      setSelectedTemplateId("");
    }

    setMessage("Modèle archivé.");
    await loadWorkflowTemplates();
    await loadWorkflowSteps();
  }

  async function createWorkflowStep(e) {
    e.preventDefault();

    if (!selectedTemplateId) {
      setMessage("Sélectionne un modèle de workflow.");
      return;
    }

    if (!workflowStepForm.name) {
      setMessage("Nom de l'étape obligatoire.");
      return;
    }

    const { error } = await supabase
      .from("project_workflow_steps")
      .insert({
        template_id: selectedTemplateId,
        name: workflowStepForm.name,
        step_order: Number(workflowStepForm.step_order || 1),
        default_duration_days: Number(workflowStepForm.default_duration_days || 1),
        task_type_id: workflowStepForm.task_type_id || null,
        active: true,
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    setWorkflowStepForm({
      name: "",
      step_order: Number(workflowStepForm.step_order || 1) + 1,
      default_duration_days: 1,
      task_type_id: "",
    });

    setMessage("Étape ajoutée.");
    await loadWorkflowSteps();
  }

  async function editWorkflowStep(step) {
    const name = window.prompt("Nom de l'étape ?", step.name);
    if (name === null) return;

    const order = window.prompt("Ordre ?", String(step.step_order || 1));
    if (order === null) return;

    const duration = window.prompt("Durée par défaut en jours ?", String(step.default_duration_days || 1));
    if (duration === null) return;

    const { error } = await supabase
      .from("project_workflow_steps")
      .update({
        name,
        step_order: Number(order || 1),
        default_duration_days: Number(duration || 1),
      })
      .eq("id", step.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Étape modifiée.");
    await loadWorkflowSteps();
  }

  async function deleteWorkflowStep(step) {
    const ok = window.confirm(`Supprimer l'étape "${step.name}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("project_workflow_steps")
      .update({ active: false })
      .eq("id", step.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Étape supprimée.");
    await loadWorkflowSteps();
  }

  const selectedWorkflowTemplate = workflowTemplates.find(
    (template) => template.id === selectedTemplateId
  );

  const selectedWorkflowSteps = workflowSteps
    .filter((step) => step.template_id === selectedTemplateId)
    .sort((a, b) => Number(a.step_order || 0) - Number(b.step_order || 0));

  async function loadResources() {
    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .eq("active", true)
      .order("resource_type")
      .order("name");

    if (error) {
      setMessage(error.message);
      return;
    }

    setResources(data || []);
  }

  async function createResource(e) {
    e.preventDefault();

    if (!resourceForm.name) {
      setMessage("Nom de la ressource obligatoire.");
      return;
    }

    const { error } = await supabase.from("resources").insert({
      name: resourceForm.name,
      resource_type: resourceForm.resource_type || "machine",
      status: resourceForm.status || "available",
      notes: resourceForm.notes || null,
      active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setResourceForm({
      name: "",
      resource_type: "machine",
      status: "available",
      notes: "",
    });

    setMessage("Ressource ajoutée.");
    await loadResources();
  }

  async function editResource(resource) {
    const name = window.prompt("Nom de la ressource ?", resource.name);
    if (name === null) return;

    const type = window.prompt("Type : machine / zone / vehicle / tool ?", resource.resource_type || "machine");
    if (type === null) return;

    const status = window.prompt("Statut : available / busy / maintenance / unavailable ?", resource.status || "available");
    if (status === null) return;

    const notes = window.prompt("Notes ?", resource.notes || "");
    if (notes === null) return;

    const { error } = await supabase
      .from("resources")
      .update({
        name,
        resource_type: type || "machine",
        status: status || "available",
        notes: notes || null,
      })
      .eq("id", resource.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Ressource modifiée.");
    await loadResources();
  }

  async function deleteResource(resource) {
    const ok = window.confirm(`Archiver la ressource "${resource.name}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("resources")
      .update({ active: false })
      .eq("id", resource.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Ressource archivée.");
    await loadResources();
  }

  function resourceTypeLabel(type) {
    const labels = {
      machine: "Machine",
      zone: "Zone",
      vehicle: "Véhicule",
      tool: "Outillage",
      employee: "Employé",
    };

    return labels[type] || type || "-";
  }

  function resourceStatusLabel(status) {
    const labels = {
      available: "Disponible",
      busy: "Occupée",
      maintenance: "Maintenance",
      unavailable: "Indisponible",
    };

    return labels[status] || status || "-";
  }

  if (user?.role !== "admin") {
    return (
      <section className="page">
        <div className="card">
          <h2>Accès refusé</h2>
          <p>Cette page est réservée aux administrateurs.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Paramètres ERP</h2>
          <p>Gère les listes utilisées dans le logiciel sans passer par Supabase.</p>
        </div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="stats-grid">
        <div className="stat-card">
          <span>Activités pointage</span>
          <strong>{activities.length}</strong>
        </div>

        <div className="stat-card accent">
          <span>Sous-catégories stock</span>
          <strong>{stockCategories.length}</strong>
        </div>

        <div className="stat-card">
          <span>Types de tâches planning</span>
          <strong>{taskTypes.length}</strong>
        </div>

        <div className="stat-card accent">
          <span>Modèles workflow</span>
          <strong>{workflowTemplates.length}</strong>
        </div>

        <div className="stat-card">
          <span>Ressources atelier</span>
          <strong>{resources.length}</strong>
        </div>

        <div className="stat-card accent">
          <span>Objectifs BI</span>
          <strong>{biSettings.length}</strong>
        </div>
      </div>

      <div className="card">
        <h3>Objectifs Business Intelligence</h3>
        <p>Ces valeurs pilotent les objectifs de CA, pipeline, marge, production et calculs de l'indice 3D Concrete.</p>

        {biSettings.length === 0 ? (
          <p>Aucun objectif BI configuré.</p>
        ) : (
          <div className="admin-list">
            {biSettings.map((setting) => (
              <div className="admin-row" key={setting.id}>
                <div>
                  <strong>{setting.label || setting.setting_key}</strong>
                  <small>{setting.description || setting.setting_key}</small>
                </div>

                <div className="inline-actions">
                  <strong>{setting.setting_value}</strong>
                  <button className="btn small" onClick={() => updateBiSetting(setting)}>
                    Modifier
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-grid">
        <div className="card">
          <h3>Activités de pointage</h3>

          <form onSubmit={createActivity} className="admin-inline-form">
            <input
              value={activityForm.name}
              onChange={(e) =>
                setActivityForm({ ...activityForm, name: e.target.value })
              }
              placeholder="Ex : Nettoyage atelier"
            />

            <input
              type="color"
              value={activityForm.color}
              onChange={(e) =>
                setActivityForm({ ...activityForm, color: e.target.value })
              }
            />

            <button className="btn primary">Ajouter</button>
          </form>

          <div className="admin-list">
            {activities.map((activity) => (
              <div className="admin-row" key={activity.id}>
                <div>
                  <span
                    className="admin-color-dot"
                    style={{ background: activity.color || "#2563eb" }}
                  />
                  <strong>{activity.name}</strong>
                </div>

                <div className="inline-actions">
                  <button className="btn small" onClick={() => renameActivity(activity)}>
                    Renommer
                  </button>

                  <button className="btn small" onClick={() => changeActivityColor(activity)}>
                    Couleur
                  </button>

                  <button className="btn small danger-soft" onClick={() => deleteActivity(activity)}>
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Types de tâches planning</h3>

          <form onSubmit={createTaskType} className="admin-inline-form">
            <input
              value={taskTypeForm.name}
              onChange={(e) =>
                setTaskTypeForm({ ...taskTypeForm, name: e.target.value })
              }
              placeholder="Ex : Découpe, collage, reprise impression..."
            />

            <input
              type="color"
              value={taskTypeForm.color}
              onChange={(e) =>
                setTaskTypeForm({ ...taskTypeForm, color: e.target.value })
              }
            />

            <button className="btn primary">Ajouter</button>
          </form>

          <div className="admin-list">
            {taskTypes.map((taskType) => (
              <div className="admin-row" key={taskType.id}>
                <div>
                  <span
                    className="admin-color-dot"
                    style={{ background: taskType.color || "#2563eb" }}
                  />
                  <strong>{taskType.name}</strong>
                </div>

                <div className="inline-actions">
                  <button className="btn small" onClick={() => renameTaskType(taskType)}>
                    Renommer
                  </button>

                  <button className="btn small" onClick={() => changeTaskTypeColor(taskType)}>
                    Couleur
                  </button>

                  <button className="btn small danger-soft" onClick={() => deleteTaskType(taskType)}>
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Sous-catégories de stock</h3>

          <form onSubmit={createStockCategory} className="admin-inline-form">
            <input
              value={stockCategoryName}
              onChange={(e) => setStockCategoryName(e.target.value)}
              placeholder="Ex : Fibres, Ciments, Outillage..."
            />

            <button className="btn primary">Ajouter</button>
          </form>

          <div className="admin-list">
            {stockCategories.map((category) => (
              <div className="admin-row" key={category.id}>
                <div>
                  <strong>{category.name}</strong>
                </div>

                <div className="inline-actions">
                  <button className="btn small" onClick={() => renameStockCategory(category)}>
                    Renommer
                  </button>

                  <button className="btn small danger-soft" onClick={() => deleteStockCategory(category)}>
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card workflow-admin-card">
          <h3>Ressources atelier</h3>
          <p>Machines, zones, véhicules et outillages planifiables dans l'ERP.</p>

          <form onSubmit={createResource} className="resource-form">
            <div>
              <label>Nom</label>
              <input
                value={resourceForm.name}
                onChange={(e) =>
                  setResourceForm({ ...resourceForm, name: e.target.value })
                }
                placeholder="Ex : Robot ABB, Malaxeur, Camion..."
              />
            </div>

            <div>
              <label>Type</label>
              <select
                value={resourceForm.resource_type}
                onChange={(e) =>
                  setResourceForm({ ...resourceForm, resource_type: e.target.value })
                }
              >
                <option value="machine">Machine</option>
                <option value="zone">Zone</option>
                <option value="vehicle">Véhicule</option>
                <option value="tool">Outillage</option>
              </select>
            </div>

            <div>
              <label>Statut</label>
              <select
                value={resourceForm.status}
                onChange={(e) =>
                  setResourceForm({ ...resourceForm, status: e.target.value })
                }
              >
                <option value="available">Disponible</option>
                <option value="busy">Occupée</option>
                <option value="maintenance">Maintenance</option>
                <option value="unavailable">Indisponible</option>
              </select>
            </div>

            <div>
              <label>Notes</label>
              <input
                value={resourceForm.notes}
                onChange={(e) =>
                  setResourceForm({ ...resourceForm, notes: e.target.value })
                }
                placeholder="Infos utiles..."
              />
            </div>

            <button className="btn primary">Ajouter</button>
          </form>

          {resources.length === 0 ? (
            <p>Aucune ressource.</p>
          ) : (
            <div className="resource-list">
              {resources.map((resource) => (
                <div className={`resource-row resource-${resource.status}`} key={resource.id}>
                  <div>
                    <strong>{resource.name}</strong>
                    <small>
                      {resourceTypeLabel(resource.resource_type)} · {resourceStatusLabel(resource.status)}
                    </small>
                    {resource.notes && <small>{resource.notes}</small>}
                  </div>

                  <div className="inline-actions">
                    <button className="btn small" onClick={() => editResource(resource)}>
                      Modifier
                    </button>
                    <button className="btn small danger-soft" onClick={() => deleteResource(resource)}>
                      Archiver
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card workflow-admin-card">
          <h3>Modèles de workflow projet</h3>

          <form onSubmit={createWorkflowTemplate} className="admin-inline-form workflow-template-form">
            <input
              value={workflowTemplateName}
              onChange={(e) => setWorkflowTemplateName(e.target.value)}
              placeholder="Ex : Banc, Lettrage, Banque d'accueil, Récif..."
            />

            <button className="btn primary">Créer modèle</button>
          </form>

          {workflowTemplates.length === 0 ? (
            <p>Aucun modèle de workflow.</p>
          ) : (
            <>
              <div className="workflow-template-tabs">
                {workflowTemplates.map((template) => (
                  <button
                    key={template.id}
                    className={selectedTemplateId === template.id ? "active" : ""}
                    onClick={() => setSelectedTemplateId(template.id)}
                  >
                    {template.name}
                  </button>
                ))}
              </div>

              {selectedWorkflowTemplate && (
                <div className="workflow-template-head">
                  <div>
                    <strong>{selectedWorkflowTemplate.name}</strong>
                    <small>{selectedWorkflowSteps.length} étape(s)</small>
                  </div>

                  <div className="inline-actions">
                    <button className="btn small" onClick={() => renameWorkflowTemplate(selectedWorkflowTemplate)}>
                      Renommer
                    </button>
                    <button className="btn small danger-soft" onClick={() => deleteWorkflowTemplate(selectedWorkflowTemplate)}>
                      Archiver
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={createWorkflowStep} className="workflow-step-form">
                <div>
                  <label>Étape</label>
                  <input
                    value={workflowStepForm.name}
                    onChange={(e) =>
                      setWorkflowStepForm({ ...workflowStepForm, name: e.target.value })
                    }
                    placeholder="Ex : Impression, Ponçage, Contrôle qualité..."
                  />
                </div>

                <div>
                  <label>Ordre</label>
                  <input
                    type="number"
                    value={workflowStepForm.step_order}
                    onChange={(e) =>
                      setWorkflowStepForm({ ...workflowStepForm, step_order: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label>Durée jours</label>
                  <input
                    type="number"
                    value={workflowStepForm.default_duration_days}
                    onChange={(e) =>
                      setWorkflowStepForm({ ...workflowStepForm, default_duration_days: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label>Type tâche planning</label>
                  <select
                    value={workflowStepForm.task_type_id}
                    onChange={(e) =>
                      setWorkflowStepForm({ ...workflowStepForm, task_type_id: e.target.value })
                    }
                  >
                    <option value="">Aucun</option>
                    {taskTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button className="btn primary">Ajouter étape</button>
              </form>

              {selectedWorkflowSteps.length === 0 ? (
                <p>Aucune étape dans ce modèle.</p>
              ) : (
                <div className="workflow-step-list">
                  {selectedWorkflowSteps.map((step) => (
                    <div className="workflow-step-row" key={step.id}>
                      <div className="workflow-step-order">{step.step_order}</div>

                      <div>
                        <strong>{step.name}</strong>
                        <small>
                          {step.default_duration_days || 1} jour(s)
                          {step.production_task_types?.name
                            ? ` · ${step.production_task_types.name}`
                            : " · Aucun type planning"}
                        </small>
                      </div>

                      <div className="inline-actions">
                        <button className="btn small" onClick={() => editWorkflowStep(step)}>
                          Modifier
                        </button>
                        <button className="btn small danger-soft" onClick={() => deleteWorkflowStep(step)}>
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </section>
  );
}
