import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";
import { emitEvent } from "../services/events.js";

export default function Projets({ user, permissions }) {
  const [projects, setProjects] = useState([]);
  const [requests, setRequests] = useState([]);
  const [crmContacts, setCrmContacts] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [workflowTemplates, setWorkflowTemplates] = useState([]);
  const [workflowSteps, setWorkflowSteps] = useState([]);
  const [projectTypes, setProjectTypes] = useState([]);
  const [annexCosts, setAnnexCosts] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectEvents, setProjectEvents] = useState([]);
  const [projectStock, setProjectStock] = useState([]);
  const [projectSteps, setProjectSteps] = useState([]);
  const [projectDocuments, setProjectDocuments] = useState([]);
  const [projectProductionPlanning, setProjectProductionPlanning] = useState([]);
  const [projectInstallationPlanning, setProjectInstallationPlanning] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [stockCategories, setStockCategories] = useState([]);
  const [stockModalCategoryId, setStockModalCategoryId] = useState("all");
  const [activeTab, setActiveTab] = useState("general");
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockSearch, setStockSearch] = useState("");

  const [annexForm, setAnnexForm] = useState({
    label: "",
    category: "Divers",
    quantity: 1,
    unit_cost: 0,
    notes: "",
  });
  const [stockQuantity, setStockQuantity] = useState(1);
  const [stockSelectedItem, setStockSelectedItem] = useState(null);
  const [selectedDocumentCategory, setSelectedDocumentCategory] = useState("Commercial");
  const [view, setView] = useState("list");
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    client_name: "",
    crm_contact_id: "",
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

    const { data: crmContactsData, error: crmContactsError } = await supabase
      .from("crm_contacts")
      .select("id, company_name, contact_name, city, email, phone")
      .order("company_name");

    if (crmContactsError) {
      setMessage(crmContactsError.message);
      return;
    }

    setProjects(projectsData || []);
    setRequests(requestsData || []);
    setCrmContacts(crmContactsData || []);

    const { data: workflowTemplatesData, error: workflowTemplatesError } = await supabase
      .from("project_workflow_templates")
      .select("*")
      .eq("active", true)
      .order("name");

    if (workflowTemplatesError) {
      setMessage(workflowTemplatesError.message);
      return;
    }

    const { data: workflowStepsData, error: workflowStepsError } = await supabase
      .from("project_workflow_steps")
      .select("*")
      .eq("active", true)
      .order("step_order", { ascending: true });

    if (workflowStepsError) {
      setMessage(workflowStepsError.message);
      return;
    }

    setWorkflowTemplates(workflowTemplatesData || []);
    setWorkflowSteps(workflowStepsData || []);

    const { data: projectTypesData, error: projectTypesError } = await supabase
      .from("project_types")
      .select("*")
      .eq("active", true)
      .order("name");

    if (projectTypesError) {
      setMessage(projectTypesError.message);
      return;
    }

    const { data: annexCostsData, error: annexCostsError } = await supabase
      .from("project_cost_entries")
      .select("*")
      .or("source.eq.manual,source.eq.annex,source.is.null")
      .order("cost_date", { ascending: false });

    if (annexCostsError) {
      setMessage(annexCostsError.message);
      return;
    }

    setProjectTypes(projectTypesData || []);
    setAnnexCosts(annexCostsData || []);

    const { data: stockItemsData, error: stockItemsError } = await supabase
      .from("stock_items")
      .select("*")
      .eq("active", true)
      .order("name");

    if (stockItemsError) {
      setMessage(stockItemsError.message);
      return;
    }

    const { data: stockCategoriesData, error: stockCategoriesError } = await supabase
      .from("stock_categories")
      .select("*")
      .eq("active", true)
      .order("name");

    if (stockCategoriesError) {
      setMessage(stockCategoriesError.message);
      return;
    }

    setStockItems(stockItemsData || []);
    setStockCategories(stockCategoriesData || []);

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
      .select("*, employees(name, hourly_rate)")
      .eq("project_id", project.id)
      .order("event_time", { ascending: true });

    const { data: stockData } = await supabase
      .from("stock_movements")
      .select("*, stock_items(reference, name, unit, unit_price, price_unit, category_id)")
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
      crm_contact_id: form.crm_contact_id || null,
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
      crm_contact_id: "",
      project_name: "",
      description: "",
      requested_delivery_date: "",
      requested_installation_date: "",
    });

    await emitEvent({
      event_type: "PROJECT_REQUEST_CREATED",
      entity_type: "project_request",
      title: `Nouvelle demande projet : ${form.project_name}`,
      description: form.client_name,
      payload: {
        client_name: form.client_name,
        crm_contact_id: form.crm_contact_id || null,
        project_name: form.project_name,
      },
      user,
    });

    setMessage("Demande projet envoyée.");
    loadData();
  }

  function findSuggestedWorkflow(request) {
    const text = `${request.project_name || ""} ${request.description || ""}`.toLowerCase();

    return (
      workflowTemplates.find((template) =>
        text.includes((template.name || "").toLowerCase())
      ) || workflowTemplates[0] || null
    );
  }

  async function generateWorkflowTasks(project, templateId, startDate) {
    if (!templateId) return;

    const steps = workflowSteps
      .filter((step) => step.template_id === templateId)
      .sort((a, b) => Number(a.step_order || 0) - Number(b.step_order || 0));

    if (steps.length === 0) return;

    let currentDate = new Date(startDate || new Date().toISOString().slice(0, 10));

    const rows = steps.map((step) => {
      const taskDate = currentDate.toISOString().slice(0, 10);

      currentDate.setDate(
        currentDate.getDate() + Number(step.default_duration_days || 1)
      );

      return {
        task_date: taskDate,
        project_id: project.id,
        task_type_id: step.task_type_id || null,
        title: step.name,
        notes: `Généré automatiquement depuis le workflow ${project.name}`,
        status: "planned",
        priority: "normal",
        created_by: user?.id || null,
      };
    });

    const { error } = await supabase.from("production_day_tasks").insert(rows);

    if (error) {
      setMessage(error.message);
    }
  }

  async function validateRequest(request) {
    if (!hasRight("can_validate")) {
      setMessage("Action non autorisée.");
      return;
    }

    const suggestedWorkflow = findSuggestedWorkflow(request);

    const workflowList = workflowTemplates
      .map((template, index) => `${index + 1}. ${template.name}`)
      .join("\n");

    let selectedWorkflow = suggestedWorkflow;

    if (workflowTemplates.length > 0) {
      const suggestedIndex = workflowTemplates.findIndex(
        (template) => template.id === suggestedWorkflow?.id
      );

      const choice = window.prompt(
        `Choisis le workflow projet :\n${workflowList}\n\nWorkflow proposé : ${
          suggestedWorkflow?.name || "aucun"
        }`,
        suggestedIndex >= 0 ? String(suggestedIndex + 1) : "1"
      );

      if (choice === null) return;

      const selectedIndex = Number(choice) - 1;
      selectedWorkflow = workflowTemplates[selectedIndex] || suggestedWorkflow;
    }

    const defaultSignatureDate = new Date().toISOString().slice(0, 10);
    const signedDate = window.prompt(
      "Date de signature du projet (AAAA-MM-JJ) ?",
      defaultSignatureDate
    );

    if (signedDate === null) return;

    const saleAmountInput = window.prompt(
      "Montant du projet signé en euros HT ?",
      "0"
    );

    if (saleAmountInput === null) return;

    const saleAmount = Number(String(saleAmountInput).replace(/\s/g, "").replace(",", "."));

    if (!Number.isFinite(saleAmount) || saleAmount < 0) {
      setMessage("Le montant signé est invalide.");
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
        signed_date: signedDate || defaultSignatureDate,
        sale_amount: saleAmount,
        estimated_hours: 0,
        progress_percent: 0,
        project_color: request.project_color || "#2563eb",
        workflow_template_id: selectedWorkflow?.id || null,
        workflow_status: "validated",
      })
      .select()
      .single();

    if (projectError) {
      setMessage(projectError.message);
      return;
    }

    await generateWorkflowTasks(
      project,
      selectedWorkflow?.id || null,
      request.requested_delivery_date || new Date().toISOString().slice(0, 10)
    );

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

  function projectTypeName(project) {
    const type = projectTypes.find((item) => item.id === project?.project_type_id);
    return type?.name || "-";
  }

  function averageHourlyRate() {
    const rates = projectEvents
      .map((event) => Number(event.employees?.hourly_rate || 0))
      .filter((rate) => rate > 0);

    if (rates.length === 0) return 0;

    return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  }

  function estimatedMaterialCost(project) {
    return Number(project?.estimated_material_cost || project?.estimated_material_budget || 0);
  }

  function estimatedLaborHours(project) {
    return Number(project?.estimated_labor_hours || project?.estimated_hours || 0);
  }

  function estimatedOtherCost(project) {
    return Number(project?.estimated_other_cost || 0);
  }

  function estimatedLaborCost(project) {
    return estimatedLaborHours(project) * averageHourlyRate();
  }

  function estimatedTotalCost(project) {
    return estimatedMaterialCost(project) + estimatedLaborCost(project) + estimatedOtherCost(project);
  }

  function estimatedMargin(project) {
    return Number(project?.sale_amount || 0) - estimatedTotalCost(project);
  }

  function estimatedMarginRate(project) {
    const saleAmount = Number(project?.sale_amount || 0);

    if (saleAmount <= 0) return 0;

    return (estimatedMargin(project) / saleAmount) * 100;
  }

  function projectAnnexCosts(project) {
    return annexCosts.filter((entry) => entry.project_id === project?.id);
  }

  function projectAnnexTotal(project) {
    return projectAnnexCosts(project).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  }

  async function changeProjectType(project) {
    if (!hasRight("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    if (projectTypes.length === 0) {
      setMessage("Aucun type de projet disponible.");
      return;
    }

    const list = projectTypes
      .map((type, index) => `${index + 1}. ${type.name}`)
      .join("\\n");

    const choice = window.prompt(`Choisis le type de projet :\\n${list}`, "1");
    if (choice === null) return;

    const selectedType = projectTypes[Number(choice) - 1];

    if (!selectedType) {
      setMessage("Type invalide.");
      return;
    }

    await updateProject(project, { project_type_id: selectedType.id });
  }

  async function addAnnexCost(project) {
    if (!hasRight("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    if (!annexForm.label) {
      setMessage("Libellé de dépense obligatoire.");
      return;
    }

    const quantity = Number(annexForm.quantity || 1);
    const unitCost = Number(annexForm.unit_cost || 0);
    const amount = quantity * unitCost;

    const { error } = await supabase.from("project_cost_entries").insert({
      project_id: project.id,
      label: annexForm.label,
      category: annexForm.category || "Divers",
      quantity,
      unit_cost: unitCost,
      amount,
      source: "annex",
      notes: annexForm.notes || null,
      created_by: user?.id || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setAnnexForm({
      label: "",
      category: "Divers",
      quantity: 1,
      unit_cost: 0,
      notes: "",
    });

    setMessage("Dépense annexe ajoutée au projet.");
    await loadData();
  }

  async function deleteAnnexCost(entry) {
    if (!hasRight("can_delete")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(`Supprimer la dépense "${entry.label}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("project_cost_entries")
      .delete()
      .eq("id", entry.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Dépense supprimée.");
    await loadData();
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
    setStockModalCategoryId("all");
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

  function stockCategoryName(item) {
    const category = stockCategories.find((entry) => entry.id === item.category_id);
    return category?.name || "Sans sous-catégorie";
  }

  function priceUnitLabel(value) {
    const labels = {
      unit: "unité",
      kg: "kg",
      tonne: "tonne",
      liter: "litre",
      meter: "mètre",
      m2: "m²",
      m3: "m³",
    };

    return labels[value] || value || "unité";
  }

  function normalizedStockUnitCost(item) {
    const price = Number(item?.unit_price || 0);

    if (item?.price_unit === "tonne") return price / 1000;

    return price;
  }

  function stockMovementCost(movement) {
    return Number(movement.quantity || 0) * normalizedStockUnitCost(movement.stock_items);
  }

  function selectedStockCostPreview() {
    return Number(stockQuantity || 0) * normalizedStockUnitCost(stockSelectedItem);
  }

  const projectStockTotal = projectStock
    .filter((movement) => movement.movement_type === "out")
    .reduce((sum, movement) => sum + stockMovementCost(movement), 0);

  const modalFilteredStockItems = stockItems.filter((item) => {
    const query = stockSearch.toLowerCase();
    const categoryName = stockCategoryName(item).toLowerCase();

    const matchesSearch =
      (item.reference || "").toLowerCase().includes(query) ||
      (item.name || "").toLowerCase().includes(query) ||
      categoryName.includes(query);

    const matchesCategory =
      stockModalCategoryId === "all" ||
      (stockModalCategoryId === "none" && !item.category_id) ||
      item.category_id === stockModalCategoryId;

    return matchesSearch && matchesCategory;
  });

  const filteredCrmContactsForRequest = crmContacts.filter((contact) => {
    const query = clientSearch.toLowerCase().trim();
    if (!query) return false;

    return [contact.company_name, contact.contact_name, contact.city, contact.email, contact.phone]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  }).slice(0, 8);

  const selectedCrmContact = crmContacts.find((contact) => contact.id === form.crm_contact_id);

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
              <div className="project-client-search">
                <label>Client CRM ou saisie libre</label>
                <input
                  value={form.client_name}
                  onChange={(e) => {
                    setForm({ ...form, client_name: e.target.value, crm_contact_id: "" });
                    setClientSearch(e.target.value);
                  }}
                  placeholder="Recherche client CRM ou nouveau client"
                />

                {selectedCrmContact && (
                  <small className="project-selected-client">
                    Client CRM lié : {selectedCrmContact.company_name}
                    {selectedCrmContact.city ? ` · ${selectedCrmContact.city}` : ""}
                  </small>
                )}

                {clientSearch && !form.crm_contact_id && filteredCrmContactsForRequest.length > 0 && (
                  <div className="project-client-results">
                    {filteredCrmContactsForRequest.map((contact) => (
                      <button
                        type="button"
                        key={contact.id}
                        onClick={() => {
                          setForm({
                            ...form,
                            crm_contact_id: contact.id,
                            client_name: contact.company_name,
                          });
                          setClientSearch("");
                        }}
                      >
                        <strong>{contact.company_name}</strong>
                        <small>{contact.contact_name || "-"} · {contact.city || "-"}</small>
                      </button>
                    ))}
                  </div>
                )}
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
                  <th>Workflow proposé</th>
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

                    <td>{findSuggestedWorkflow(request)?.name || "-"}</td>

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

          <div className="card project-finance-pilot-card">
            <div className="project-finance-pilot-head">
              <div>
                <p className="eyebrow">Pilotage financier</p>
                <h3>Prévisionnel & marge</h3>
              </div>

              <div className="inline-actions">
                <button className="btn small" onClick={() => changeProjectType(selectedProject)}>
                  Type projet
                </button>
                <button className="btn small" onClick={() => promptNumber(selectedProject, "sale_amount", "Montant vendu ?")}>
                  Vente
                </button>
                <button className="btn small" onClick={() => promptNumber(selectedProject, "estimated_material_cost", "Coût matière estimé ?")}>
                  Matière
                </button>
                <button className="btn small" onClick={() => promptNumber(selectedProject, "estimated_labor_hours", "Heures prévues ?")}>
                  Heures
                </button>
                <button className="btn small" onClick={() => promptNumber(selectedProject, "estimated_other_cost", "Autres coûts estimés ?")}>
                  Autres coûts
                </button>
              </div>
            </div>

            <div className="project-finance-kpis">
              <div>
                <span>Type</span>
                <strong>{projectTypeName(selectedProject)}</strong>
              </div>

              <div>
                <span>Vente</span>
                <strong>{formatMoney(selectedProject.sale_amount)}</strong>
              </div>

              <div>
                <span>Coût estimé</span>
                <strong>{formatMoney(estimatedTotalCost(selectedProject))}</strong>
              </div>

              <div>
                <span>Marge estimée</span>
                <strong>{formatMoney(estimatedMargin(selectedProject))}</strong>
              </div>

              <div className={estimatedMarginRate(selectedProject) >= 35 ? "good" : "warning"}>
                <span>Taux marge</span>
                <strong>{estimatedMarginRate(selectedProject).toFixed(1)} %</strong>
              </div>
            </div>

            <div className="project-finance-detail-line">
              <span>Matière : <strong>{formatMoney(estimatedMaterialCost(selectedProject))}</strong></span>
              <span>Heures prévues : <strong>{estimatedLaborHours(selectedProject).toFixed(2)} h</strong></span>
              <span>Taux moyen : <strong>{formatMoney(averageHourlyRate())}/h</strong></span>
              <span>MO estimée : <strong>{formatMoney(estimatedLaborCost(selectedProject))}</strong></span>
              <span>Autres coûts : <strong>{formatMoney(estimatedOtherCost(selectedProject))}</strong></span>
              <span>Annexes réelles : <strong>{formatMoney(projectAnnexTotal(selectedProject))}</strong></span>
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
                  <h3>Matériaux consommés sur le projet</h3>
                  <p>Tu déstockes ici directement depuis la fiche projet. Le coût matière se calcule avec les prix du stock.</p>
                </div>

                <div className="stock-project-total">
                  <span>Total matière</span>
                  <strong>{formatMoney(projectStockTotal)}</strong>
                </div>

                <button className="btn primary" onClick={openStockModal}>
                  + Déstocker un matériau
                </button>
              </div>

              {projectStock.length === 0 ? (
                <p>Aucun mouvement de stock lié à ce projet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Sous-catégorie</th>
                      <th>Article</th>
                      <th>Quantité</th>
                      <th>Prix unitaire</th>
                      <th>Coût</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {projectStock.map((movement) => (
                      <tr key={movement.id}>
                        <td>{formatDateTime(movement.created_at)}</td>
                        <td>{stockCategoryName(movement.stock_items || {})}</td>
                        <td>
                          <strong>{movement.stock_items?.reference || "-"}</strong>
                          <br />
                          <small>{movement.stock_items?.name || "-"}</small>
                        </td>
                        <td>
                          {movement.quantity} {movement.stock_items?.unit || ""}
                        </td>
                        <td>
                          {formatMoney(normalizedStockUnitCost(movement.stock_items))}
                          <br />
                          <small>
                            Prix saisi : {formatMoney(movement.stock_items?.unit_price)} / {priceUnitLabel(movement.stock_items?.price_unit)}
                          </small>
                        </td>
                        <td>{formatMoney(stockMovementCost(movement))}</td>
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
            <div className="project-detail-grid">
              <div className="card">
                <h3>Prévisionnel projet</h3>

                <div className="financial-summary-grid">
                  <div>
                    <span>Type de projet</span>
                    <strong>{projectTypeName(selectedProject)}</strong>
                  </div>

                  <div>
                    <span>Montant vendu</span>
                    <strong>{formatMoney(selectedProject.sale_amount)}</strong>
                  </div>

                  <div>
                    <span>Coût estimé</span>
                    <strong>{formatMoney(estimatedTotalCost(selectedProject))}</strong>
                  </div>

                  <div>
                    <span>Marge estimée</span>
                    <strong>{formatMoney(estimatedMargin(selectedProject))}</strong>
                  </div>

                  <div>
                    <span>Taux marge estimé</span>
                    <strong>{estimatedMarginRate(selectedProject).toFixed(1)} %</strong>
                  </div>
                </div>

                <div className="financial-breakdown">
                  <p><strong>Matière estimée :</strong> {formatMoney(estimatedMaterialCost(selectedProject))}</p>
                  <p><strong>Heures prévues :</strong> {estimatedLaborHours(selectedProject).toFixed(2)} h</p>
                  <p><strong>Taux horaire moyen :</strong> {formatMoney(averageHourlyRate())}/h</p>
                  <p><strong>Main-d'œuvre estimée :</strong> {formatMoney(estimatedLaborCost(selectedProject))}</p>
                  <p><strong>Autres coûts estimés :</strong> {formatMoney(estimatedOtherCost(selectedProject))}</p>
                  <p><strong>Dépenses annexes réelles :</strong> {formatMoney(projectAnnexTotal(selectedProject))}</p>
                </div>

                <div className="inline-actions">
                  <button className="btn small" onClick={() => changeProjectType(selectedProject)}>Type projet</button>
                  <button className="btn small" onClick={() => promptNumber(selectedProject, "sale_amount", "Montant vendu ?")}>Vente</button>
                  <button className="btn small" onClick={() => promptNumber(selectedProject, "estimated_material_cost", "Coût matière estimé ?")}>Matière estimée</button>
                  <button className="btn small" onClick={() => promptNumber(selectedProject, "estimated_labor_hours", "Heures prévues ?")}>Heures prévues</button>
                  <button className="btn small" onClick={() => promptNumber(selectedProject, "estimated_other_cost", "Autres coûts estimés ?")}>Autres coûts</button>
                </div>
              </div>

              <div className="card">
                <h3>Dépenses annexes</h3>
                <p>Palette, petit matériel, ferraillage, achat spécifique, sous-traitance ponctuelle.</p>

                <div className="annex-cost-form">
                  <input
                    value={annexForm.label}
                    onChange={(e) => setAnnexForm({ ...annexForm, label: e.target.value })}
                    placeholder="Libellé"
                  />

                  <input
                    value={annexForm.category}
                    onChange={(e) => setAnnexForm({ ...annexForm, category: e.target.value })}
                    placeholder="Catégorie"
                  />

                  <input
                    type="number"
                    step="0.01"
                    value={annexForm.quantity}
                    onChange={(e) => setAnnexForm({ ...annexForm, quantity: e.target.value })}
                    placeholder="Qté"
                  />

                  <input
                    type="number"
                    step="0.01"
                    value={annexForm.unit_cost}
                    onChange={(e) => setAnnexForm({ ...annexForm, unit_cost: e.target.value })}
                    placeholder="PU"
                  />

                  <input
                    value={annexForm.notes}
                    onChange={(e) => setAnnexForm({ ...annexForm, notes: e.target.value })}
                    placeholder="Notes"
                  />

                  <button className="btn primary" onClick={() => addAnnexCost(selectedProject)}>
                    Ajouter
                  </button>
                </div>

                {projectAnnexCosts(selectedProject).length === 0 ? (
                  <p>Aucune dépense annexe.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Catégorie</th>
                        <th>Libellé</th>
                        <th>Montant</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {projectAnnexCosts(selectedProject).map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.cost_date || "-"}</td>
                          <td>{entry.category || "-"}</td>
                          <td>
                            <strong>{entry.label}</strong>
                            <br />
                            <small>
                              {Number(entry.quantity || 0).toLocaleString("fr-FR")} × {formatMoney(entry.unit_cost)}
                              {entry.notes ? ` · ${entry.notes}` : ""}
                            </small>
                          </td>
                          <td>{formatMoney(entry.amount)}</td>
                          <td>
                            <button className="btn small danger-soft" onClick={() => deleteAnnexCost(entry)}>
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
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

            <div className="project-stock-modal-filters">
              <input
                placeholder="Rechercher une référence, désignation ou sous-catégorie..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
              />

              <select
                value={stockModalCategoryId}
                onChange={(e) => setStockModalCategoryId(e.target.value)}
              >
                <option value="all">Toutes les sous-catégories</option>
                <option value="none">Sans sous-catégorie</option>
                {stockCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

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
                    <small>{stockCategoryName(item)}</small>
                  </span>

                  <span>
                    {item.current_quantity || 0} {item.unit || ""}
                    <small>
                      {formatMoney(normalizedStockUnitCost(item))} / {item.unit || "unité"}
                    </small>
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

              <div className="stock-project-preview">
                <span>Coût estimé</span>
                <strong>{formatMoney(selectedStockCostPreview())}</strong>
              </div>

              <button className="btn primary" onClick={() => addSelectedStockToProject(selectedProject)}>
                Déstocker sur ce projet
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
