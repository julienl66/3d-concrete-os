import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";

export default function Projets({ user, permissions }) {
  const [projects, setProjects] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectEvents, setProjectEvents] = useState([]);
  const [projectStock, setProjectStock] = useState([]);
  const [projectSteps, setProjectSteps] = useState([]);
  const [projectDocuments, setProjectDocuments] = useState([]);
  const [projectProductionPlanning, setProjectProductionPlanning] = useState([]);
  const [projectInstallationPlanning, setProjectInstallationPlanning] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [activeTab, setActiveTab] = useState("general");
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockSearch, setStockSearch] = useState("");
  const [stockQuantity, setStockQuantity] = useState(1);
  const [stockSelectedItem, setStockSelectedItem] = useState(null);
  const [selectedDocumentCategory, setSelectedDocumentCategory] = useState("Commercial");
  const [view, setView] = useState("list");
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    client_name: "",
    project_name: "",
    description: "",
    requested_delivery_date: "",
    requested_installation_date: "",
  });

  function hasRight(action) {
    if (user?.role === "admin") return true;
    return !!permissions?.projets?.[action];
  }


  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: projectsData, error: projectsError } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (projectsError) {
      setMessage(projectsError.message);
      return;
    }

    const { data: requestsData, error: requestsError } = await supabase
      .from("project_requests")
      .select("*")
      .eq("status", "submitted")
      .order("created_at", { ascending: false });

    if (requestsError) {
      setMessage(requestsError.message);
      return;
    }

    setProjects(projectsData || []);
    setRequests(requestsData || []);

    const { data: stockItemsData } = await supabase
      .from("stock_items")
      .select("*")
      .eq("active", true)
      .order("name");

    setStockItems(stockItemsData || []);

    if (selectedProject) {
      const updated = (projectsData || []).find((p) => p.id === selectedProject.id);
      setSelectedProject(updated || null);
      if (updated) {
        loadProjectDetails(updated);
      }
    }
  }

  async function loadProjectDetails(project) {
    const { data: eventsData } = await supabase
      .from("punch_events")
      .select("*, employees(name)")
      .eq("project_id", project.id)
      .order("event_time", { ascending: true });

    const { data: stockData } = await supabase
      .from("stock_movements")
      .select("*, stock_items(reference, name, unit)")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });

    const { data: stepsData } = await supabase
      .from("project_steps")
      .select("*")
      .eq("project_id", project.id)
      .order("step_order", { ascending: true });

    const { data: documentsData } = await supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });

    const { data: productionPlanningData } = await supabase
      .from("production_planning")
      .select("*")
      .eq("project_id", project.id)
      .order("planned_start", { ascending: true });

    const { data: installationPlanningData } = await supabase
      .from("installation_planning")
      .select("*")
      .eq("project_id", project.id)
      .order("planned_date", { ascending: true });

    setProjectEvents(eventsData || []);
    setProjectStock(stockData || []);
    setProjectSteps(stepsData || []);
    setProjectDocuments(documentsData || []);
    setProjectProductionPlanning(productionPlanningData || []);
    setProjectInstallationPlanning(installationPlanningData || []);
  }

  function generateProjectCode() {
    const year = new Date().getFullYear();
    const count = projects.filter((project) =>
      String(project.project_code || "").includes(`P-${year}`)
    ).length + 1;

    return `P-${year}-${String(count).padStart(3, "0")}`;
  }

  async function submitRequest(e) {
    e.preventDefault();
    setMessage("");

    if (!form.client_name || !form.project_name) {
      setMessage("Client et nom du projet obligatoires.");
      return;
    }

    const { error } = await supabase.from("project_requests").insert({
      commercial_id: user.id,
      client_name: form.client_name,
      project_name: form.project_name,
      description: form.description,
      requested_delivery_date: form.requested_delivery_date || null,
      requested_installation_date: form.requested_installation_date || null,
      status: "submitted",
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setForm({
      client_name: "",
      project_name: "",
      description: "",
      requested_delivery_date: "",
      requested_installation_date: "",
    });

    setMessage("Demande projet envoyée.");
    loadData();
  }

  async function validateRequest(request) {
    if (!hasRight("can_validate")) {
      setMessage("Action non autorisée.");
      return;
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        project_code: generateProjectCode(),
        name: request.project_name,
        client_name: request.client_name,
        description: request.description,
        active: true,
        status: "validated",
        source_request_id: request.id,
        validated_delivery_date: request.requested_delivery_date,
        validated_installation_date: request.requested_installation_date,
        estimated_hours: 0,
        progress_percent: 0,
        project_color: request.project_color || "#2563eb",
      })
      .select()
      .single();

    if (projectError) {
      setMessage(projectError.message);
      return;
    }

    const { error: updateError } = await supabase
      .from("project_requests")
      .update({
        status: "validated",
        validated_by: user.id,
        validated_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    if (updateError) {
      setMessage(updateError.message);
      return;
    }

    setMessage(`Projet validé : ${project.project_code || ""} ${project.name}`);
    loadData();
  }

  async function refuseRequest(request) {
    if (!hasRight("can_validate")) {
      setMessage("Action non autorisée.");
      return;
    }

    const reason = window.prompt("Motif du refus ?");
    if (reason === null) return;

    const { error } = await supabase
      .from("project_requests")
      .update({
        status: "refused",
        admin_comment: reason,
        validated_by: user.id,
        validated_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Demande refusée.");
    loadData();
  }

  async function deleteRequest(request) {
    if (!hasRight("can_delete")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(`Supprimer la demande projet "${request.project_name}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("project_requests")
      .update({
        status: "deleted",
        admin_comment: "Demande supprimée depuis l'interface",
        validated_by: user.id,
        validated_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Demande supprimée.");
    loadData();
  }

  async function updateProject(project, patch) {
    if (!hasRight("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const { error } = await supabase.from("projects").update(patch).eq("id", project.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Projet mis à jour.");
    loadData();
  }

  async function archiveProject(project) {
    if (!hasRight("can_archive")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(`Archiver le projet "${project.name}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("projects")
      .update({ active: false, status: "archived" })
      .eq("id", project.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (selectedProject?.id === project.id) {
      setSelectedProject(null);
      setView("list");
    }

    setMessage("Projet archivé.");
    await loadData();
  }

  async function deleteProject(project) {
    if (!hasRight("can_delete")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(
      `Supprimer définitivement le projet "${project.name}" ? Cette action est irréversible.`
    );

    if (!ok) return;

    const { error } = await supabase.from("projects").delete().eq("id", project.id);

    if (error) {
      setMessage(
        "Suppression impossible : ce projet est déjà lié à du pointage, du planning ou du stock. Archive-le plutôt."
      );
      return;
    }

    setSelectedProject(null);
    setView("list");
    setMessage("Projet supprimé.");
    await loadData();
  }

  async function promptText(project, field, label) {
    const value = window.prompt(label, project[field] || "");
    if (value === null) return;
    await updateProject(project, { [field]: value || null });
  }

  async function promptNumber(project, field, label) {
    const value = Number(window.prompt(label, project[field] || 0));
    if (Number.isNaN(value)) return;
    await updateProject(project, { [field]: value });
  }

  async function changeProjectStatus(project) {
    const statuses = [
      "validated",
      "planned",
      "in_production",
      "ready",
      "installed",
      "archived",
    ];

    const list = statuses.map((status, index) => `${index + 1}. ${status}`).join("\n");
    const choice = Number(window.prompt(`Choisis le statut :\n${list}`, "1"));

    if (!choice || choice < 1 || choice > statuses.length) return;

    await updateProject(project, { status: statuses[choice - 1] });
  }

  async function createProduction(project) {
    const { error } = await supabase.from("production_planning").insert({
      project_id: project.id,
      title: `${project.project_code || ""} ${project.name}`.trim(),
      planned_start: project.production_start_date || project.validated_delivery_date || null,
      planned_end: project.production_end_date || project.validated_delivery_date || null,
      priority: "normal",
      status: "planned",
      notes: "Créé depuis la fiche projet",
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Ajouté au planning production.");
    await loadProjectDetails(project);
  }

  async function createInstallation(project) {
    const { error } = await supabase.from("installation_planning").insert({
      project_id: project.id,
      title: `${project.project_code || ""} ${project.name}`.trim(),
      planned_date: project.validated_installation_date || null,
      location: project.project_address || project.client_name || "",
      status: "planned",
      notes: "Créé depuis la fiche projet",
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Ajouté au planning pose.");
    await loadProjectDetails(project);
  }

  async function recalculateProjectProgress(projectId) {
    const { data } = await supabase
      .from("project_steps")
      .select("*")
      .eq("project_id", projectId);

    const steps = data || [];
    const done = steps.filter((step) => step.done).length;
    const progress = steps.length ? Math.round((done / steps.length) * 100) : 0;

    await supabase
      .from("projects")
      .update({ progress_percent: progress })
      .eq("id", projectId);
  }

  async function createDefaultSteps(project) {
    const defaultSteps = [
      "Validation commerciale",
      "Étude technique",
      "Modélisation 3D",
      "Préparation impression",
      "Impression",
      "Assemblage",
      "Finition / ponçage",
      "Contrôle qualité",
      "Emballage",
      "Pose",
      "Clôture projet",
    ];

    const rows = defaultSteps.map((title, index) => ({
      project_id: project.id,
      title,
      step_order: index + 1,
      done: false,
    }));

    const { error } = await supabase.from("project_steps").insert(rows);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Étapes de fabrication créées.");
    await loadProjectDetails(project);
    await recalculateProjectProgress(project.id);
    await loadData();
  }

  async function addProjectStep(project) {
    const title = window.prompt("Nom de la nouvelle étape ?");
    if (!title) return;

    const nextOrder =
      projectSteps.length > 0
        ? Math.max(...projectSteps.map((step) => Number(step.step_order || 0))) + 1
        : 1;

    const { error } = await supabase.from("project_steps").insert({
      project_id: project.id,
      title,
      step_order: nextOrder,
      done: false,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Étape ajoutée.");
    await loadProjectDetails(project);
    await recalculateProjectProgress(project.id);
    await loadData();
  }

  async function toggleProjectStep(step) {
    const done = !step.done;

    const { error } = await supabase
      .from("project_steps")
      .update({
        done,
        done_at: done ? new Date().toISOString() : null,
      })
      .eq("id", step.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(done ? "Étape terminée." : "Étape remise en cours.");
    await loadProjectDetails(selectedProject);
    await recalculateProjectProgress(selectedProject.id);
    await loadData();
  }

  async function renameProjectStep(step) {
    const title = window.prompt("Nouveau nom de l'étape ?", step.title);
    if (title === null) return;

    const { error } = await supabase
      .from("project_steps")
      .update({ title })
      .eq("id", step.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Étape renommée.");
    await loadProjectDetails(selectedProject);
  }

  async function deleteProjectStep(step) {
    const ok = window.confirm(`Supprimer l'étape "${step.title}" ?`);
    if (!ok) return;

    const { error } = await supabase.from("project_steps").delete().eq("id", step.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Étape supprimée.");
    await loadProjectDetails(selectedProject);
    await recalculateProjectProgress(selectedProject.id);
    await loadData();
  }

  async function editProductionPlanning(item, field, label) {
    const value = window.prompt(label, item[field] || "");
    if (value === null) return;

    const { error } = await supabase
      .from("production_planning")
      .update({ [field]: value || null })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Planning production modifié.");
    await loadProjectDetails(selectedProject);
  }

  async function editInstallationPlanning(item, field, label) {
    const value = window.prompt(label, item[field] || "");
    if (value === null) return;

    const { error } = await supabase
      .from("installation_planning")
      .update({ [field]: value || null })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Planning pose modifié.");
    await loadProjectDetails(selectedProject);
  }

  async function deleteProductionPlanning(item) {
    const ok = window.confirm(`Supprimer la ligne de planning production "${item.title}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("production_planning")
      .delete()
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Planning production supprimé.");
    await loadProjectDetails(selectedProject);
  }

  async function deleteInstallationPlanning(item) {
    const ok = window.confirm(`Supprimer la ligne de planning pose "${item.title}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("installation_planning")
      .delete()
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Planning pose supprimé.");
    await loadProjectDetails(selectedProject);
  }

  async function uploadProjectDocument(project, event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${project.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("project-documents")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      setMessage(uploadError.message);
      return;
    }

    const { data: publicData } = supabase.storage
      .from("project-documents")
      .getPublicUrl(path);

    const { error: insertError } = await supabase.from("project_documents").insert({
      project_id: project.id,
      file_name: file.name,
      file_url: publicData.publicUrl,
      file_type: file.type || "document",
      document_category: selectedDocumentCategory || "Divers",
      created_by: user?.id || null,
    });

    if (insertError) {
      setMessage(insertError.message);
      return;
    }

    setMessage("Document ajouté.");
    event.target.value = "";
    await loadProjectDetails(project);
  }

  async function deleteProjectDocument(document) {
    const ok = window.confirm(`Supprimer le document "${document.file_name}" ?`);
    if (!ok) return;

    const urlParts = document.file_url.split("/project-documents/");
    const storagePath = urlParts[1];

    if (storagePath) {
      await supabase.storage.from("project-documents").remove([storagePath]);
    }

    const { error } = await supabase
      .from("project_documents")
      .delete()
      .eq("id", document.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Document supprimé.");
    await loadProjectDetails(selectedProject);
  }

  function openStockModal() {
    setStockSearch("");
    setStockQuantity(1);
    setStockSelectedItem(null);
    setStockModalOpen(true);
  }

  async function addSelectedStockToProject(project) {
    if (!stockSelectedItem) {
      setMessage("Sélectionne un article.");
      return;
    }

    const qty = Number(stockQuantity || 0);

    if (!qty || qty <= 0) {
      setMessage("Quantité invalide.");
      return;
    }

    const current = Number(stockSelectedItem.current_quantity || 0);
    const newQuantity = current - qty;

    const { error: updateError } = await supabase
      .from("stock_items")
      .update({ current_quantity: newQuantity })
      .eq("id", stockSelectedItem.id);

    if (updateError) {
      setMessage(updateError.message);
      return;
    }

    const { error: movementError } = await supabase.from("stock_movements").insert({
      item_id: stockSelectedItem.id,
      project_id: project.id,
      movement_type: "out",
      quantity: qty,
      comment: `Sortie stock depuis la fiche projet ${project.project_code || ""}`,
      created_by: user?.id || null,
    });

    if (movementError) {
      setMessage(movementError.message);
      return;
    }

    setStockModalOpen(false);
    setMessage("Article ajouté au projet et stock mis à jour.");
    await loadData();
    await loadProjectDetails(project);
  }

  async function cancelStockMovement(movement) {
    const ok = window.confirm("Annuler ce mouvement et recréditer le stock ?");

    if (!ok) return;

    const itemId = movement.item_id;
    const item = stockItems.find((stockItem) => stockItem.id === itemId);

    if (!item) {
      setMessage("Article introuvable dans le stock.");
      return;
    }

    const qty = Number(movement.quantity || 0);
    const current = Number(item.current_quantity || 0);

    const newQuantity =
      movement.movement_type === "out"
        ? current + qty
        : current - qty;

    const { error: updateError } = await supabase
      .from("stock_items")
      .update({ current_quantity: newQuantity })
      .eq("id", itemId);

    if (updateError) {
      setMessage(updateError.message);
      return;
    }

    const { error: deleteError } = await supabase
      .from("stock_movements")
      .delete()
      .eq("id", movement.id);

    if (deleteError) {
      setMessage(deleteError.message);
      return;
    }

    setMessage("Mouvement annulé et stock corrigé.");
    await loadData();
    await loadProjectDetails(selectedProject);
  }

  function openProject(project) {
    setSelectedProject(project);
    setActiveTab("general");
    setView("detail");
    loadProjectDetails(project);
  }

  const submittedRequests = requests.filter((request) => request.status === "submitted");
  const activeProjects = projects.filter((project) => project.active);
  const archivedProjects = projects.filter((project) => !project.active);

  function statusLabel(status) {
    const labels = {
      validated: "Validé",
      planned: "Planifié",
      in_production: "En production",
      ready: "Prêt",
      installed: "Posé",
      archived: "Archivé",
      active: "Actif",
    };

    return labels[status] || status || "-";
  }

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString("fr-FR")} €`;
  }

  function progress(project) {
    const value = Number(project.progress_percent || 0);
    return Math.max(0, Math.min(100, value));
  }

  function formatDateTime(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function calculateProjectHours(events) {
    const eventsByEmployee = {};

    events.forEach((event) => {
      if (!eventsByEmployee[event.employee_id]) {
        eventsByEmployee[event.employee_id] = [];
      }

      eventsByEmployee[event.employee_id].push(event);
    });

    let totalMs = 0;

    Object.values(eventsByEmployee).forEach((employeeEvents) => {
      let start = null;

      employeeEvents.forEach((event) => {
        if (event.event_type === "ARRIVAL" || event.event_type === "RESUME") {
          start = new Date(event.event_time);
        }

        if ((event.event_type === "PAUSE" || event.event_type === "DEPART") && start) {
          totalMs += new Date(event.event_time) - start;
          start = null;
        }
      });
    });

    return totalMs / 1000 / 60 / 60;
  }

  const documentCategories = [
    "Commercial",
    "Technique",
    "Fabrication",
    "Pose",
    "Photos",
    "Factures",
    "Divers",
  ];

  const documentsForSelectedCategory = projectDocuments.filter(
    (document) => (document.document_category || "Divers") === selectedDocumentCategory
  );

  function documentCategoryHasFiles(category) {
    return projectDocuments.some(
      (document) => (document.document_category || "Divers") === category
    );
  }

  const modalFilteredStockItems = stockItems.filter((item) => {
    const query = stockSearch.toLowerCase();

    return (
      (item.reference || "").toLowerCase().includes(query) ||
      (item.name || "").toLowerCase().includes(query) ||
      (item.category || "").toLowerCase().includes(query)
    );
  });

  const projectHours = calculateProjectHours(projectEvents);
  const estimatedHours = Number(selectedProject?.estimated_hours || 0);
  const hourGap = projectHours - estimatedHours;

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Projets</p>
          <h2>{view === "detail" ? "Fiche projet" : "Pilotage projets"}</h2>
          <p>
            {view === "detail"
              ? "Dossier central du projet : général, planning, budget, pointage et stock."
              : "Demandes commerciales, validation et projets actifs."}
          </p>
        </div>

        {view === "detail" && (
          <button className="btn secondary" onClick={() => setView("list")}>
            ← Retour projets
          </button>
        )}
      </div>

      {message && <div className="alert info">{message}</div>}

      {view === "list" && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <span>Demandes à valider</span>
              <strong>{submittedRequests.length}</strong>
            </div>

            <div className="stat-card">
              <span>Projets actifs</span>
              <strong>{activeProjects.length}</strong>
            </div>

            <div className="stat-card accent">
              <span>Projets archivés</span>
              <strong>{archivedProjects.length}</strong>
            </div>
          </div>

          <div className="card">
            <h3>Nouvelle demande projet</h3>

            <form onSubmit={submitRequest} className="grid">
              <div>
                <label>Client</label>
                <input
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  placeholder="Ex : CMA 66"
                />
              </div>

              <div>
                <label>Nom du projet</label>
                <input
                  value={form.project_name}
                  onChange={(e) => setForm({ ...form, project_name: e.target.value })}
                  placeholder="Ex : Banque d'accueil"
                />
              </div>

              <div>
                <label>Date de livrabilité souhaitée</label>
                <input
                  type="date"
                  value={form.requested_delivery_date}
                  onChange={(e) =>
                    setForm({ ...form, requested_delivery_date: e.target.value })
                  }
                />
              </div>

              <div>
                <label>Date de pose souhaitée</label>
                <input
                  type="date"
                  value={form.requested_installation_date}
                  onChange={(e) =>
                    setForm({ ...form, requested_installation_date: e.target.value })
                  }
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Description du projet, contraintes, quantités, contexte..."
                />
              </div>

              <div className="align-end">
                <button className="btn primary">Soumettre le projet</button>
              </div>
            </form>
          </div>

          <div className="card">
            <h3>Demandes à valider</h3>

            <table>
              <thead>
                <tr>
                  <th>Projet</th>
                  <th>Client</th>
                  <th>Livrabilité</th>
                  <th>Pose</th>
                  <th>Statut</th>
                  {hasRight("can_validate") && <th>Actions</th>}
                </tr>
              </thead>

              <tbody>
                {requests.filter((request) => request.status === "submitted").map((request) => (
                  <tr key={request.id}>
                    <td>
                      <strong>{request.project_name}</strong>
                      <br />
                      <small>{request.description}</small>
                    </td>
                    <td>{request.client_name}</td>
                    <td>{request.requested_delivery_date || "-"}</td>
                    <td>{request.requested_installation_date || "-"}</td>
                    <td>
                      <span className={`status-pill ${request.status}`}>
                        {request.status}
                      </span>
                    </td>

                    {hasRight("can_validate") && (
                      <td>
                        {request.status === "submitted" ? (
                          <div className="inline-actions">
                            <button
                              className="btn small"
                              onClick={() => validateRequest(request)}
                            >
                              Valider
                            </button>
                            <button
                              className="btn small danger-soft"
                              onClick={() => refuseRequest(request)}
                            >
                              Refuser
                            </button>

                            <button
                              className="btn small danger-soft"
                              onClick={() => deleteRequest(request)}
                            >
                              Supprimer
                            </button>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Tous les projets actifs</h3>

            <div className="project-cards-grid">
              {activeProjects.map((project) => (
                <article className="project-tile" key={project.id}>
                  <div className="project-tile-head">
                    <span>{project.project_code || "Sans code"}</span>
                    <span className="status-pill validated">
                      {statusLabel(project.status)}
                    </span>
                  </div>

                  <h3>{project.name}</h3>
                  <p>{project.client_name || "-"}</p>

                  <div className="progress-line">
                    <div style={{ width: `${progress(project)}%` }} />
                  </div>

                  <div className="project-tile-meta">
                    <span>{progress(project)} %</span>
                    <span>Liv. {project.validated_delivery_date || "-"}</span>
                  </div>

                  <div className="inline-actions">
                    <button className="btn primary" onClick={() => openProject(project)}>
                      Ouvrir
                    </button>

                    <button className="btn small" onClick={() => archiveProject(project)}>
                      Archiver
                    </button>

                    <button className="btn small danger-soft" onClick={() => deleteProject(project)}>
                      Supprimer
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </>
      )}

      {view === "detail" && selectedProject && (
        <div className="project-detail">
          <div className="project-hero card">
            <div>
              <p className="eyebrow">{selectedProject.project_code || "Sans code"}</p>
              <h2>{selectedProject.name}</h2>
              <p>{selectedProject.client_name || "-"}</p>
            </div>

            <div className="project-hero-right">
              <span className="status-pill validated">
                {statusLabel(selectedProject.status)}
              </span>
              <strong>{progress(selectedProject)} %</strong>
              <div className="progress-line large">
                <div style={{ width: `${progress(selectedProject)}%` }} />
              </div>
            </div>
          </div>

          <div className="project-tabs">
            <button className={activeTab === "general" ? "active" : ""} onClick={() => setActiveTab("general")}>📋 Général</button>
            <button className={activeTab === "planning" ? "active" : ""} onClick={() => setActiveTab("planning")}>📅 Planning</button>
            <button className={activeTab === "fabrication" ? "active" : ""} onClick={() => setActiveTab("fabrication")}>🏭 Fabrication</button>
            <button className={activeTab === "stock" ? "active" : ""} onClick={() => setActiveTab("stock")}>📦 Stock</button>
            <button className={activeTab === "pointage" ? "active" : ""} onClick={() => setActiveTab("pointage")}>⏱️ Pointage</button>
            <button className={activeTab === "documents" ? "active" : ""} onClick={() => setActiveTab("documents")}>📄 Documents</button>
            <button className={activeTab === "financier" ? "active" : ""} onClick={() => setActiveTab("financier")}>💰 Financier</button>
          </div>

          {activeTab === "general" && (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <span>Heures prévues</span>
                  <strong>{estimatedHours.toFixed(2)} h</strong>
                </div>

                <div className="stat-card">
                  <span>Heures pointées</span>
                  <strong>{projectHours.toFixed(2)} h</strong>
                </div>

                <div className="stat-card accent">
                  <span>Écart heures</span>
                  <strong>{hourGap.toFixed(2)} h</strong>
                </div>
              </div>

              <div className="project-detail-grid">
                <div className="card">
                  <h3>Général</h3>
                  <p><strong>Client :</strong> {selectedProject.client_name || "-"}</p>
                  <p><strong>Contact :</strong> {selectedProject.contact_name || "-"}</p>
                  <p><strong>Email :</strong> {selectedProject.contact_email || "-"}</p>
                  <p><strong>Téléphone :</strong> {selectedProject.contact_phone || "-"}</p>
                  <p><strong>Adresse :</strong> {selectedProject.project_address || "-"}</p>
                  <p><strong>Description :</strong> {selectedProject.description || "-"}</p>
                </div>

                <div className="card">
                  <h3>Actions rapides</h3>

                  <div className="inline-actions">
                    <button className="btn small" onClick={() => promptText(selectedProject, "project_code", "Code projet ?")}>Code</button>
                    <button className="btn small" onClick={() => promptText(selectedProject, "client_name", "Client ?")}>Client</button>
                    <button className="btn small" onClick={() => promptText(selectedProject, "contact_name", "Contact ?")}>Contact</button>
                    <button className="btn small" onClick={() => promptText(selectedProject, "contact_email", "Email contact ?")}>Email</button>
                    <button className="btn small" onClick={() => promptText(selectedProject, "contact_phone", "Téléphone contact ?")}>Téléphone</button>
                    <button className="btn small" onClick={() => promptText(selectedProject, "project_address", "Adresse projet ?")}>Adresse</button>
                    <button className="btn small" onClick={() => promptText(selectedProject, "description", "Description ?")}>Description</button>
                    <button className="btn small" onClick={() => promptNumber(selectedProject, "progress_percent", "Avancement en % ?")}>Avancement</button>
                    <button className="btn small" onClick={() => changeProjectStatus(selectedProject)}>Statut</button>
                    <button className="btn small" onClick={() => archiveProject(selectedProject)}>Archiver</button>
                    <button className="btn small danger-soft" onClick={() => deleteProject(selectedProject)}>Supprimer</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "planning" && (
            <div className="project-detail-grid">
              <div className="card">
                <div className="page-head">
                  <div>
                    <h3>Planning production</h3>
                    <p>Début, fin, statut et actions de production.</p>
                  </div>

                  <button className="btn primary" onClick={() => createProduction(selectedProject)}>
                    + Planifier production
                  </button>
                </div>

                {projectProductionPlanning.length === 0 ? (
                  <p>Aucune production planifiée pour ce projet.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Titre</th>
                        <th>Début</th>
                        <th>Fin</th>
                        <th>Priorité</th>
                        <th>Statut</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {projectProductionPlanning.map((item) => (
                        <tr key={item.id}>
                          <td><strong>{item.title}</strong></td>
                          <td>{item.planned_start || "-"}</td>
                          <td>{item.planned_end || "-"}</td>
                          <td>{item.priority || "-"}</td>
                          <td>{item.status || "-"}</td>
                          <td>
                            <div className="inline-actions">
                              <button className="btn small" onClick={() => editProductionPlanning(item, "planned_start", "Début production ? AAAA-MM-JJ")}>
                                Début
                              </button>
                              <button className="btn small" onClick={() => editProductionPlanning(item, "planned_end", "Fin production ? AAAA-MM-JJ")}>
                                Fin
                              </button>
                              <button className="btn small" onClick={() => editProductionPlanning(item, "status", "Statut ? planned / in_progress / done")}>
                                Statut
                              </button>
                              <button className="btn small danger-soft" onClick={() => deleteProductionPlanning(item)}>
                                Supprimer
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="card">
                <div className="page-head">
                  <div>
                    <h3>Planning pose</h3>
                    <p>Date, lieu, statut et actions de pose.</p>
                  </div>

                  <button className="btn primary" onClick={() => createInstallation(selectedProject)}>
                    + Planifier pose
                  </button>
                </div>

                {projectInstallationPlanning.length === 0 ? (
                  <p>Aucune pose planifiée pour ce projet.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Titre</th>
                        <th>Date</th>
                        <th>Lieu</th>
                        <th>Statut</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {projectInstallationPlanning.map((item) => (
                        <tr key={item.id}>
                          <td><strong>{item.title}</strong></td>
                          <td>{item.planned_date || "-"}</td>
                          <td>{item.location || "-"}</td>
                          <td>{item.status || "-"}</td>
                          <td>
                            <div className="inline-actions">
                              <button className="btn small" onClick={() => editInstallationPlanning(item, "planned_date", "Date pose ? AAAA-MM-JJ")}>
                                Date
                              </button>
                              <button className="btn small" onClick={() => editInstallationPlanning(item, "location", "Lieu de pose ?")}>
                                Lieu
                              </button>
                              <button className="btn small" onClick={() => editInstallationPlanning(item, "status", "Statut ? planned / done")}>
                                Statut
                              </button>
                              <button className="btn small danger-soft" onClick={() => deleteInstallationPlanning(item)}>
                                Supprimer
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="card">
                <h3>Dates projet</h3>
                <p><strong>Signature :</strong> {selectedProject.signed_date || "-"}</p>
                <p><strong>Livrabilité :</strong> {selectedProject.validated_delivery_date || "-"}</p>
                <p><strong>Pose :</strong> {selectedProject.validated_installation_date || "-"}</p>

                <div className="inline-actions">
                  <button className="btn small" onClick={() => promptText(selectedProject, "signed_date", "Date signature ? AAAA-MM-JJ")}>Signature</button>
                  <button className="btn small" onClick={() => promptText(selectedProject, "validated_delivery_date", "Livrabilité ? AAAA-MM-JJ")}>Livraison</button>
                  <button className="btn small" onClick={() => promptText(selectedProject, "validated_installation_date", "Pose ? AAAA-MM-JJ")}>Pose</button>
                </div>
              </div>

              <div className="card">
                <h3>Avancement</h3>
                <p><strong>Statut projet :</strong> {statusLabel(selectedProject.status)}</p>
                <p><strong>Avancement :</strong> {selectedProject.progress_percent || 0} %</p>
                <div className="progress-line">
                  <div style={{ width: `${progress(selectedProject)}%` }} />
                </div>
              </div>
            </div>
          )}

          {activeTab === "fabrication" && (
            <div className="card">
              <div className="page-head">
                <div>
                  <h3>Workflow de fabrication</h3>
                  <p>Ajoute, modifie, coche ou supprime les étapes du projet.</p>
                </div>

                <div className="inline-actions">
                  <button className="btn small" onClick={() => createDefaultSteps(selectedProject)}>
                    Générer étapes type
                  </button>
                  <button className="btn primary" onClick={() => addProjectStep(selectedProject)}>
                    Ajouter étape
                  </button>
                </div>
              </div>

              {projectSteps.length === 0 ? (
                <p>Aucune étape. Clique sur “Générer étapes type” ou ajoute une étape manuellement.</p>
              ) : (
                <div className="steps-list">
                  {projectSteps.map((step) => (
                    <div className={step.done ? "step-row done" : "step-row"} key={step.id}>
                      <button className="step-check" onClick={() => toggleProjectStep(step)}>
                        {step.done ? "✓" : ""}
                      </button>

                      <div>
                        <strong>{step.title}</strong>
                        <small>
                          Ordre {step.step_order || "-"}
                          {step.done_at ? ` · terminé le ${formatDateTime(step.done_at)}` : ""}
                        </small>
                      </div>

                      <div className="inline-actions">
                        <button className="btn small" onClick={() => renameProjectStep(step)}>
                          Renommer
                        </button>
                        <button className="btn small danger-soft" onClick={() => deleteProjectStep(step)}>
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "stock" && (
            <div className="card">
              <div className="page-head">
                <div>
                  <h3>Stock consommé sur le projet</h3>
                  <p>Les articles ajoutés ici sont automatiquement retirés du stock général.</p>
                </div>

                <button className="btn primary" onClick={openStockModal}>
                  Ajouter article au projet
                </button>
              </div>

              {projectStock.length === 0 ? (
                <p>Aucun mouvement de stock lié à ce projet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Article</th>
                      <th>Mouvement</th>
                      <th>Quantité</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {projectStock.map((movement) => (
                      <tr key={movement.id}>
                        <td>{formatDateTime(movement.created_at)}</td>
                        <td>
                          <strong>{movement.stock_items?.reference || "-"}</strong>
                          <br />
                          <small>{movement.stock_items?.name || "-"}</small>
                        </td>
                        <td>{movement.movement_type}</td>
                        <td>
                          {movement.quantity} {movement.stock_items?.unit || ""}
                        </td>
                        <td>
                          <button
                            className="btn small danger-soft"
                            onClick={() => cancelStockMovement(movement)}
                          >
                            Annuler
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === "pointage" && (
            <div className="card">
              <h3>Pointage lié au projet</h3>

              <div className="stats-grid">
                <div className="stat-card">
                  <span>Heures prévues</span>
                  <strong>{estimatedHours.toFixed(2)} h</strong>
                </div>

                <div className="stat-card">
                  <span>Heures pointées</span>
                  <strong>{projectHours.toFixed(2)} h</strong>
                </div>

                <div className="stat-card accent">
                  <span>Écart</span>
                  <strong>{hourGap.toFixed(2)} h</strong>
                </div>
              </div>

              {projectEvents.length === 0 ? (
                <p>Aucun pointage lié à ce projet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Employé</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {projectEvents.map((event) => (
                      <tr key={event.id}>
                        <td>{formatDateTime(event.event_time)}</td>
                        <td>{event.employees?.name || "-"}</td>
                        <td>{event.event_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === "documents" && (
            <div className="card">
              <div className="page-head">
                <div>
                  <h3>Documents du projet</h3>
                  <p>Classe les fichiers par sous-catégorie : commercial, technique, fabrication, pose, photos, factures.</p>
                </div>

                <label className="btn primary file-button">
                  + Ajouter un document
                  <input
                    type="file"
                    onChange={(event) => uploadProjectDocument(selectedProject, event)}
                  />
                </label>
              </div>

              <div className="document-category-tabs">
                {documentCategories.map((category) => (
                  <button
                    key={category}
                    className={selectedDocumentCategory === category ? "active" : ""}
                    onClick={() => setSelectedDocumentCategory(category)}
                  >
                    {documentCategoryHasFiles(category) ? "🟢 " : ""}
                    {category}
                  </button>
                ))}
              </div>

              {documentsForSelectedCategory.length === 0 ? (
                <p>Aucun document dans “{selectedDocumentCategory}”.</p>
              ) : (
                <div className="documents-list">
                  {documentsForSelectedCategory.map((document) => (
                    <div className="document-row" key={document.id}>
                      <div>
                        <strong>{document.file_name}</strong>
                        <small>
                          {document.document_category || "Divers"} · {document.file_type || "document"} · {formatDateTime(document.created_at)}
                        </small>
                      </div>

                      <div className="inline-actions">
                        <a className="btn small" href={document.file_url} target="_blank" rel="noreferrer">
                          Ouvrir
                        </a>

                        <a className="btn small" href={document.file_url} download>
                          Télécharger
                        </a>

                        <button className="btn small danger-soft" onClick={() => deleteProjectDocument(document)}>
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "financier" && (
            <div className="card">
              <h3>Financier</h3>
              <p><strong>Montant vendu :</strong> {formatMoney(selectedProject.sale_amount)}</p>
              <p><strong>Budget matière :</strong> {formatMoney(selectedProject.estimated_material_budget)}</p>
              <p><strong>Budget main-d'œuvre :</strong> {formatMoney(selectedProject.estimated_labor_budget)}</p>

              <div className="inline-actions">
                <button className="btn small" onClick={() => promptNumber(selectedProject, "sale_amount", "Montant vendu ?")}>Vente</button>
                <button className="btn small" onClick={() => promptNumber(selectedProject, "estimated_material_budget", "Budget matière ?")}>Budget matière</button>
                <button className="btn small" onClick={() => promptNumber(selectedProject, "estimated_labor_budget", "Budget main-d'œuvre ?")}>Budget MO</button>
                <button className="btn small" onClick={() => promptNumber(selectedProject, "estimated_hours", "Temps estimé en heures ?")}>Temps estimé</button>
              </div>
            </div>
          )}
        </div>
      )}

      {stockModalOpen && selectedProject && (
        <div className="modal-backdrop">
          <div className="stock-modal">
            <div className="page-head">
              <div>
                <p className="eyebrow">Stock projet</p>
                <h3>Ajouter un article au projet</h3>
                <p>{selectedProject.project_code || ""} {selectedProject.name}</p>
              </div>

              <button className="btn small" onClick={() => setStockModalOpen(false)}>
                Fermer
              </button>
            </div>

            <input
              placeholder="Rechercher une référence ou une désignation..."
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
            />

            <div className="stock-picker-list">
              {modalFilteredStockItems.map((item) => (
                <button
                  key={item.id}
                  className={stockSelectedItem?.id === item.id ? "selected" : ""}
                  onClick={() => setStockSelectedItem(item)}
                >
                  <span>
                    <strong>{item.reference || "-"}</strong>
                    <small>{item.name}</small>
                  </span>

                  <span>
                    {item.current_quantity || 0} {item.unit || ""}
                  </span>
                </button>
              ))}
            </div>

            <div className="stock-modal-footer">
              <div>
                <label>Quantité à sortir</label>
                <input
                  type="number"
                  min="1"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                />
              </div>

              <button className="btn primary" onClick={() => addSelectedStockToProject(selectedProject)}>
                Ajouter au projet
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
