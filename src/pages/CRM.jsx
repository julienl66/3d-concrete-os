import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";
import { canAccess } from "../services/permissions.js";
import { emitEvent } from "../services/events.js";
import AlloCallHistory from "../components/AlloCallHistory.jsx";
import CrmEmailPanel from "../components/CrmEmailPanel.jsx";
import { openAlloCall } from "../services/allo.js";

const INTERACTION_TYPES = ["note", "appel", "email", "rdv", "devis", "relance"];

export default function CRM({ user, permissions }) {
  const [stages, setStages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [projectDocuments, setProjectDocuments] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [opportunityForm, setOpportunityForm] = useState(null);
  const [draggedContactId, setDraggedContactId] = useState(null);
  const [message, setMessage] = useState("");
  const [viewMode, setViewMode] = useState("board");
  const [search, setSearch] = useState("");
  const [crmFilters, setCrmFilters] = useState({
    assigned_to: "all",
    priority: "all",
    forecast_month: "all",
    stage_id: "all",
    min_probability: "",
  });
  const [activeCall, setActiveCall] = useState(null);

  const [contactForm, setContactForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    city: "",
    contact_type: "prospect",
    assigned_to: "",
    estimated_amount: "",
    margin_percent: "",
    probability_percent: "30",
    expected_signature_month: new Date().toISOString().slice(0, 7),
    product_family: "",
    sector: "",
    lead_source: "",
    priority: "normal",
    project_id: "",
    quote_id: "",
    notes: "",
  });

  const [interactionForm, setInteractionForm] = useState({
    interaction_type: "note",
    subject: "",
    notes: "",
    next_action: "",
    next_action_date: "",
    meeting_time: "",
    meeting_location: "",
    priority: "normal",
  });

  const [stageForm, setStageForm] = useState({
    name: "",
    color: "#2563eb",
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedContact) {
      setOpportunityForm(null);
      return;
    }

    setOpportunityForm({
      company_name: selectedContact.company_name || "",
      contact_name: selectedContact.contact_name || "",
      email: selectedContact.email || "",
      phone: selectedContact.phone || "",
      city: selectedContact.city || "",
      contact_type: selectedContact.contact_type || "prospect",
      assigned_to: selectedContact.assigned_to || "",
      stage_id: selectedContact.stage_id || "",
      estimated_amount: selectedContact.estimated_amount || "",
      margin_percent: selectedContact.margin_percent || "",
      probability_percent: selectedContact.probability_percent || selectedContact.probability || "",
      expected_signature_month: selectedContact.expected_signature_month || "",
      product_family: selectedContact.product_family || "",
      sector: selectedContact.sector || "",
      lead_source: selectedContact.lead_source || "",
      priority: selectedContact.priority || "normal",
      project_id: selectedContact.project_id || "",
      quote_id: selectedContact.quote_id || "",
      dossier_code: selectedContact.dossier_code || "",
      notes: selectedContact.notes || "",
    });
  }, [selectedContact]);

  async function loadData() {
    const [
      stagesResponse,
      contactsResponse,
      employeesResponse,
      interactionsResponse,
      projectsResponse,
      quotesResponse,
      documentsResponse,
    ] = await Promise.all([
      supabase
        .from("crm_pipeline_stages")
        .select("*")
        .eq("active", true)
        .order("stage_order"),
      supabase
        .from("crm_contacts")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("employees")
        .select("*")
        .eq("active", true)
        .order("name"),
      supabase
        .from("crm_interactions")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("projects")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("quote_estimations")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("project_documents")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    const error =
      stagesResponse.error ||
      contactsResponse.error ||
      employeesResponse.error ||
      interactionsResponse.error ||
      projectsResponse.error ||
      quotesResponse.error ||
      documentsResponse.error;

    if (error) {
      setMessage(error.message);
      return;
    }

    setStages(stagesResponse.data || []);
    setContacts(contactsResponse.data || []);
    setEmployees(employeesResponse.data || []);
    setInteractions(interactionsResponse.data || []);
    setProjects(projectsResponse.data || []);
    setQuotes(quotesResponse.data || []);
    setProjectDocuments(documentsResponse.data || []);
  }

  function can(action) {
    return canAccess(user, permissions, "crm", action);
  }

  function todayValue() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString("fr-FR", {
      maximumFractionDigits: 0,
    })} €`;
  }

  function employeeName(id) {
    return employees.find((employee) => employee.id === id)?.name || "-";
  }

  function stageName(stageId) {
    return stages.find((stage) => stage.id === stageId)?.name || "Sans étape";
  }

  function contactInteractions(contactId) {
    return interactions.filter((interaction) => interaction.contact_id === contactId);
  }

  function lastActivityDate(contactId) {
    const items = contactInteractions(contactId);

    if (items.length === 0) return null;

    return items
      .map((item) => item.created_at || item.interaction_date || item.next_action_date)
      .filter(Boolean)
      .sort()
      .at(-1);
  }

  function daysSinceLastActivity(contactId) {
    const date = lastActivityDate(contactId);

    if (!date) return 999;

    return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  }

  function isWonStage(stageId) {
    return stageName(stageId).toLowerCase().includes("gagn") || stageName(stageId).toLowerCase().includes("sign");
  }

  function isLostStage(stageId) {
    return stageName(stageId).toLowerCase().includes("perdu");
  }

  function isOpenOpportunity(contact) {
    return !isWonStage(contact.stage_id) && !isLostStage(contact.stage_id);
  }

  function contactProjects(contactId) {
    return projects.filter((project) => project.crm_contact_id === contactId);
  }

  function contactQuotes(contactId) {
    return quotes.filter((quote) => quote.crm_contact_id === contactId);
  }

  const filteredContacts = useMemo(() => {
    const query = search.toLowerCase().trim();

    return contacts.filter((contact) => {
      const matchesSearch =
        !query ||
        [
          contact.company_name,
          contact.contact_name,
          contact.city,
          contact.email,
          contact.phone,
          contact.product_family,
          contact.sector,
          contact.lead_source,
          contact.dossier_code,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      const matchesAssigned =
        crmFilters.assigned_to === "all" ||
        (crmFilters.assigned_to === "none" && !contact.assigned_to) ||
        contact.assigned_to === crmFilters.assigned_to;

      const matchesPriority =
        crmFilters.priority === "all" || contact.priority === crmFilters.priority;

      const matchesForecast =
        crmFilters.forecast_month === "all" ||
        contact.expected_signature_month === crmFilters.forecast_month;

      const matchesStage =
        crmFilters.stage_id === "all" ||
        (crmFilters.stage_id === "none" && !contact.stage_id) ||
        contact.stage_id === crmFilters.stage_id;

      const probability = Number(contact.probability_percent || contact.probability || 0);
      const matchesProbability =
        !crmFilters.min_probability || probability >= Number(crmFilters.min_probability || 0);

      return (
        matchesSearch &&
        matchesAssigned &&
        matchesPriority &&
        matchesForecast &&
        matchesStage &&
        matchesProbability
      );
    });
  }, [contacts, search, crmFilters, stages]);

  const alerts = useMemo(() => {
    return interactions
      .filter((interaction) => {
        if (interaction.done) return false;
        if (!interaction.next_action_date) return false;
        return interaction.next_action_date <= todayValue();
      })
      .sort((a, b) => String(a.next_action_date).localeCompare(String(b.next_action_date)));
  }, [interactions]);

  const overdueAlerts = alerts.filter((alert) => alert.next_action_date < todayValue());
  const todayAlerts = alerts.filter((alert) => alert.next_action_date === todayValue());

  const todayMeetings = interactions
    .filter((interaction) => {
      if (interaction.done) return false;
      if (interaction.interaction_type !== "rdv") return false;
      const date = interaction.next_action_date || interaction.interaction_date;
      return date === todayValue();
    })
    .sort((a, b) => String(a.meeting_time || "").localeCompare(String(b.meeting_time || "")));

  const quoteActions = alerts.filter((alert) => {
    const type = String(alert.interaction_type || "").toLowerCase();
    const subject = String(alert.subject || "").toLowerCase();
    const action = String(alert.next_action || "").toLowerCase();
    return type === "devis" || subject.includes("devis") || action.includes("devis");
  });

  const openOpportunities = contacts.filter(isOpenOpportunity);
  const filteredOpenOpportunities = filteredContacts.filter(isOpenOpportunity);

  const crmPipelineRaw = filteredOpenOpportunities.reduce(
    (sum, contact) => sum + Number(contact.estimated_amount || 0),
    0
  );

  const crmPipelineWeighted = filteredOpenOpportunities.reduce(
    (sum, contact) => sum + weightedPipe(contact),
    0
  );

  const hotOpportunities = filteredOpenOpportunities
    .filter((contact) => Number(contact.probability_percent || contact.probability || 0) >= 70)
    .sort((a, b) => weightedPipe(b) - weightedPipe(a))
    .slice(0, 6);

  const staleOpportunities = filteredOpenOpportunities
    .filter((contact) => daysSinceLastActivity(contact.id) >= 21)
    .sort((a, b) => daysSinceLastActivity(b.id) - daysSinceLastActivity(a.id))
    .slice(0, 6);

  const forecastMonths = Array.from(
    new Set(
      contacts
        .map((contact) => contact.expected_signature_month)
        .filter(Boolean)
    )
  ).sort();

  const analytics = useMemo(() => {
    const contacted = interactions.filter((i) => ["appel", "email", "rdv", "devis", "relance"].includes(i.interaction_type)).length;
    const meetings = interactions.filter((i) => i.interaction_type === "rdv").length;
    const quotesSent = interactions.filter((i) => i.interaction_type === "devis").length;
    const won = contacts.filter((c) => stageName(c.stage_id).toLowerCase().includes("gagn")).length;
    const lost = contacts.filter((c) => stageName(c.stage_id).toLowerCase().includes("perdu")).length;

    return [
      { label: "Contacts", value: contacts.length },
      { label: "Contactés", value: contacted },
      { label: "RDV", value: meetings },
      { label: "Devis", value: quotesSent },
      { label: "Gagnés", value: won },
      { label: "Perdus", value: lost },
    ];
  }, [contacts, interactions, stages]);

  const maxAnalytics = Math.max(...analytics.map((item) => item.value), 1);

  function normalizeCsvHeader(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replaceAll(" ", "_")
      .replaceAll("-", "_");
  }

  function splitCsvLine(line, separator) {
    const cells = [];
    let current = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const nextChar = line[index + 1];

      if (char === '"' && quoted && nextChar === '"') {
        current += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        quoted = !quoted;
        continue;
      }

      if (char === separator && !quoted) {
        cells.push(current.trim());
        current = "";
        continue;
      }

      current += char;
    }

    cells.push(current.trim());
    return cells;
  }

  function parseCsv(text) {
    const cleanText = String(text || "").replace(/^\uFEFF/, "");
    const lines = cleanText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) return [];

    const firstLine = lines[0];
    const separator = firstLine.includes(";") ? ";" : ",";
    const headers = splitCsvLine(firstLine, separator).map(normalizeCsvHeader);

    return lines.slice(1).map((line) => {
      const values = splitCsvLine(line, separator);
      const row = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });

      return row;
    });
  }

  function valueFromRow(row, possibleKeys) {
    const key = possibleKeys.find((item) => row[item] !== undefined);
    return key ? row[key] : "";
  }

  function downloadCsvTemplate() {
    const rows = [
      [
        "company_name",
        "contact_name",
        "email",
        "phone",
        "city",
        "contact_type",
        "stage",
        "assigned_to",
        "notes",
        "next_action",
        "next_action_date",
        "meeting_time",
        "meeting_location",
        "priority",
      ],
      [
        "Mairie de Dole",
        "Jean Dupont",
        "contact@dole.fr",
        "0102030405",
        "Dole",
        "prospect",
        "Contacté",
        "Julien",
        "Intéressé par un lettrage",
        "Relancer pour RDV",
        "2026-07-15",
        "14:30",
        "Mairie",
        "high",
      ],
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "modele_import_crm.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  async function importCsvFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!can("can_create")) {
      setMessage("Action non autorisée.");
      return;
    }

    const text = await file.text();
    const rows = parseCsv(text);

    if (rows.length === 0) {
      setMessage("CSV vide ou format invalide.");
      return;
    }

    const firstStage = stages[0];

    const contactsToInsert = rows
      .map((row) => {
        const companyName = valueFromRow(row, [
          "company_name",
          "societe",
          "entreprise",
          "client",
          "nom_client",
          "company",
        ]);

        if (!companyName) return null;

        const stageLabel = valueFromRow(row, ["stage", "etape", "statut"]);
        const stage = stages.find(
          (item) => item.name.toLowerCase() === String(stageLabel || "").toLowerCase()
        );

        const assignedLabel = valueFromRow(row, [
          "assigned_to",
          "commercial",
          "responsable",
          "affecte_a",
        ]);

        const employee = employees.find(
          (item) => item.name.toLowerCase() === String(assignedLabel || "").toLowerCase()
        );

        return {
          company_name: companyName,
          contact_name: valueFromRow(row, ["contact_name", "contact", "nom_contact"]) || null,
          email: valueFromRow(row, ["email", "mail", "courriel"]) || null,
          phone: valueFromRow(row, ["phone", "telephone", "tel", "mobile"]) || null,
          city: valueFromRow(row, ["city", "ville", "commune"]) || null,
          contact_type: valueFromRow(row, ["contact_type", "type"]) || "prospect",
          notes: valueFromRow(row, ["notes", "note", "commentaire", "commentaires"]) || null,
          stage_id: stage?.id || firstStage?.id || null,
          assigned_to: employee?.id || null,
          status: "active",
          created_by: user?.id || null,
        };
      })
      .filter(Boolean);

    if (contactsToInsert.length === 0) {
      setMessage("Aucun contact importable. Vérifie la colonne company_name / client / société.");
      return;
    }

    const { data: insertedContacts, error } = await supabase
      .from("crm_contacts")
      .insert(contactsToInsert)
      .select();

    if (error) {
      setMessage(error.message);
      return;
    }

    const actionsToInsert = [];

    rows.forEach((row, index) => {
      const nextAction = valueFromRow(row, ["next_action", "action", "relance", "a_faire"]);
      const nextDate = valueFromRow(row, [
        "next_action_date",
        "meeting_time",
        "meeting_location",
        "priority",
        "date_relance",
        "date_action",
        "rappel",
      ]);

      const contact = insertedContacts?.[index];

      if (contact && (nextAction || nextDate)) {
        actionsToInsert.push({
          contact_id: contact.id,
          interaction_type: "relance",
          subject: "Import CSV",
          next_action: nextAction || "Relance",
          next_action_date: nextDate || null,
          meeting_time: valueFromRow(row, ["meeting_time", "heure_rdv", "heure"]) || null,
          meeting_location: valueFromRow(row, ["meeting_location", "lieu_rdv", "lieu"]) || null,
          priority: valueFromRow(row, ["priority", "priorite"]) || "normal",
          created_by: user?.id || null,
        });
      }
    });

    if (actionsToInsert.length > 0) {
      const { error: actionError } = await supabase
        .from("crm_interactions")
        .insert(actionsToInsert);

      if (actionError) {
        setMessage(`Contacts importés, mais erreur relances : ${actionError.message}`);
        await loadData();
        return;
      }
    }

    setMessage(`${contactsToInsert.length} contact(s) importé(s).`);
    await loadData();
  }

  function generateDossierCode() {
    const year = new Date().getFullYear();
    const number = String(Math.floor(Date.now() % 100000)).padStart(5, "0");
    return `DOS-${year}-${number}`;
  }

  function generateProjectCodeFromOpportunity(contact) {
    const city = String(contact.city || contact.company_name || "PROJET")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 4)
      .toUpperCase();

    return `${city || "PROJ"}-${new Date().getFullYear()}-${String(Math.floor(Date.now() % 10000)).padStart(4, "0")}`;
  }

  async function createProjectFromOpportunity(contact) {
    if (!contact) return;

    if (!can("can_create")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(`Créer un projet depuis l'opportunité "${contact.company_name}" ?`);
    if (!ok) return;

    const dossierCode = contact.dossier_code || generateDossierCode();

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        project_code: generateProjectCodeFromOpportunity(contact),
        dossier_code: dossierCode,
        name: contact.product_family
          ? `${contact.product_family} - ${contact.company_name}`
          : `Projet - ${contact.company_name}`,
        client_name: contact.company_name,
        crm_contact_id: contact.id,
        description: contact.notes || null,
        active: true,
        status: "validated",
        estimated_hours: 0,
        progress_percent: 0,
        project_color: "#2563eb",
        sale_amount: Number(contact.estimated_amount || 0),
        expected_signature_month: contact.expected_signature_month || null,
      })
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    await supabase
      .from("crm_contacts")
      .update({
        project_id: project.id,
        dossier_code: dossierCode,
      })
      .eq("id", contact.id);

    await emitEvent({
      event_type: "PROJECT_CREATED_FROM_CRM",
      entity_type: "project",
      entity_id: project.id,
      title: `Projet créé depuis CRM : ${project.name}`,
      description: contact.company_name,
      payload: {
        crm_contact_id: contact.id,
        project_id: project.id,
        project_code: project.project_code,
        dossier_code: dossierCode,
        estimated_amount: Number(contact.estimated_amount || 0),
      },
      user,
    });

    setSelectedContact({
      ...contact,
      project_id: project.id,
      dossier_code: dossierCode,
    });

    setMessage(`Projet créé : ${project.project_code || ""} ${project.name}`);
    await loadData();
  }

  async function saveOpportunity(e) {
    e.preventDefault();

    if (!selectedContact || !opportunityForm) return;

    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const payload = {
      company_name: opportunityForm.company_name || "Sans nom",
      contact_name: opportunityForm.contact_name || null,
      email: opportunityForm.email || null,
      phone: opportunityForm.phone || null,
      city: opportunityForm.city || null,
      contact_type: opportunityForm.contact_type || "prospect",
      assigned_to: opportunityForm.assigned_to || null,
      stage_id: opportunityForm.stage_id || null,
      estimated_amount: Number(opportunityForm.estimated_amount || 0),
      margin_percent: opportunityForm.margin_percent ? Number(opportunityForm.margin_percent) : null,
      probability_percent: opportunityForm.probability_percent ? Number(opportunityForm.probability_percent) : null,
      expected_signature_month: opportunityForm.expected_signature_month || null,
      product_family: opportunityForm.product_family || null,
      sector: opportunityForm.sector || null,
      lead_source: opportunityForm.lead_source || null,
      priority: opportunityForm.priority || "normal",
      project_id: opportunityForm.project_id || null,
      quote_id: opportunityForm.quote_id || null,
      dossier_code: opportunityForm.dossier_code || null,
      notes: opportunityForm.notes || null,
    };

    const { data, error } = await supabase
      .from("crm_contacts")
      .update(payload)
      .eq("id", selectedContact.id)
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    await emitEvent({
      event_type: "CRM_OPPORTUNITY_UPDATED",
      entity_type: "crm",
      entity_id: selectedContact.id,
      title: `Opportunité mise à jour : ${payload.company_name}`,
      description: payload.notes || null,
      payload: {
        estimated_amount: payload.estimated_amount,
        probability_percent: payload.probability_percent,
        expected_signature_month: payload.expected_signature_month,
        product_family: payload.product_family,
        sector: payload.sector,
        priority: payload.priority,
      },
      user,
    });

    setSelectedContact(data);
    setMessage("Opportunité mise à jour.");
    await loadData();
  }

  function updateOpportunityForm(key, value) {
    setOpportunityForm((current) => ({
      ...(current || {}),
      [key]: value,
    }));
  }

  function opportunityScore(contact) {
    if (!contact) return 0;

    let score = 0;

    if (Number(contact.estimated_amount || 0) > 0) score += 15;
    if (Number(contact.probability_percent || contact.probability || 0) >= 50) score += 15;
    if (contact.expected_signature_month) score += 10;
    if (contact.assigned_to) score += 10;
    if (contact.product_family) score += 10;
    if (contact.sector) score += 10;
    if ((contactInteractions(contact.id) || []).some((item) => item.interaction_type === "rdv")) score += 15;
    if ((contactInteractions(contact.id) || []).some((item) => item.interaction_type === "devis")) score += 15;

    return Math.min(100, score);
  }

  async function createContact(e) {
    e.preventDefault();

    if (!can("can_create")) {
      setMessage("Action non autorisée.");
      return;
    }

    if (!contactForm.company_name) {
      setMessage("Nom société / client obligatoire.");
      return;
    }

    const firstStage = stages[0];

    const { data: createdContact, error } = await supabase.from("crm_contacts").insert({
      company_name: contactForm.company_name,
      contact_name: contactForm.contact_name || null,
      email: contactForm.email || null,
      phone: contactForm.phone || null,
      city: contactForm.city || null,
      contact_type: contactForm.contact_type || "prospect",
      assigned_to: contactForm.assigned_to || null,
      estimated_amount: Number(contactForm.estimated_amount || 0),
      margin_percent: contactForm.margin_percent ? Number(contactForm.margin_percent) : null,
      probability_percent: contactForm.probability_percent ? Number(contactForm.probability_percent) : null,
      expected_signature_month: contactForm.expected_signature_month || null,
      product_family: contactForm.product_family || null,
      sector: contactForm.sector || null,
      lead_source: contactForm.lead_source || null,
      priority: contactForm.priority || "normal",
      project_id: contactForm.project_id || null,
      quote_id: contactForm.quote_id || null,
      notes: contactForm.notes || null,
      stage_id: firstStage?.id || null,
      status: "active",
      created_by: user?.id || null,
    })
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    await emitEvent({
      event_type: "CRM_OPPORTUNITY_CREATED",
      entity_type: "crm",
      entity_id: createdContact?.id || null,
      title: `Nouvelle opportunité CRM : ${contactForm.company_name}`,
      description: contactForm.city || null,
      payload: {
        company_name: contactForm.company_name,
        contact_name: contactForm.contact_name || null,
        estimated_amount: Number(contactForm.estimated_amount || 0),
        probability_percent: Number(contactForm.probability_percent || 0),
        expected_signature_month: contactForm.expected_signature_month || null,
      },
      user,
    });

    setContactForm({
      company_name: "",
      contact_name: "",
      email: "",
      phone: "",
      city: "",
      contact_type: "prospect",
      assigned_to: "",
      estimated_amount: "",
      margin_percent: "",
      probability_percent: "30",
      expected_signature_month: new Date().toISOString().slice(0, 7),
      product_family: "",
      sector: "",
      lead_source: "",
        priority: "normal",
      project_id: "",
      quote_id: "",
      notes: "",
    });

    setMessage("Contact CRM ajouté.");
    await loadData();
  }

  async function updateContactStage(contactId, stageId) {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const targetStage = stages.find((stage) => stage.id === stageId);

    const patch = {
      stage_id: stageId,
    };

    if (targetStage?.default_probability_percent !== undefined && targetStage?.default_probability_percent !== null) {
      patch.probability_percent = Number(targetStage.default_probability_percent);
    }

    const { error } = await supabase
      .from("crm_contacts")
      .update(patch)
      .eq("id", contactId);

    if (error) {
      setMessage(error.message);
      return;
    }

    const contact = contacts.find((item) => item.id === contactId);
    const stage = stages.find((item) => item.id === stageId);

    await emitEvent({
      event_type: "CRM_STAGE_CHANGED",
      entity_type: "crm",
      entity_id: contactId,
      title: `${contact?.company_name || "Opportunité"} déplacé en ${stage?.name || "Sans étape"}`,
      description: contact?.contact_name || null,
      payload: {
        contact_id: contactId,
        stage_id: stageId,
        stage_name: stage?.name || null,
        estimated_amount: contact?.estimated_amount || 0,
        probability_percent: targetStage?.default_probability_percent ?? contact?.probability_percent ?? null,
      },
      user,
    });

    await loadData();
  }

  async function editContact(contact) {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const company = window.prompt("Société / client ?", contact.company_name || "");
    if (company === null) return;

    const name = window.prompt("Nom du contact ?", contact.contact_name || "");
    if (name === null) return;

    const email = window.prompt("Email ?", contact.email || "");
    if (email === null) return;

    const phone = window.prompt("Téléphone ?", contact.phone || "");
    if (phone === null) return;

    const city = window.prompt("Ville ?", contact.city || "");
    if (city === null) return;

    const amount = window.prompt("Montant estimé HT ?", contact.estimated_amount || "");
    if (amount === null) return;

    const probability = window.prompt("Probabilité de signature % ?", contact.probability_percent || contact.probability || "");
    if (probability === null) return;

    const forecastMonth = window.prompt("Mois prévisionnel de signature ? Format AAAA-MM", contact.expected_signature_month || "");
    if (forecastMonth === null) return;

    const productFamily = window.prompt("Famille produit ?", contact.product_family || "");
    if (productFamily === null) return;

    const sector = window.prompt("Secteur ?", contact.sector || "");
    if (sector === null) return;

    const priority = window.prompt("Priorité : low / normal / high / critical", contact.priority || "normal");
    if (priority === null) return;

    const { error } = await supabase
      .from("crm_contacts")
      .update({
        company_name: company || "Sans nom",
        contact_name: name || null,
        email: email || null,
        phone: phone || null,
        city: city || null,
        estimated_amount: Number(amount || 0),
        probability_percent: probability ? Number(probability) : null,
        expected_signature_month: forecastMonth || null,
        product_family: productFamily || null,
        sector: sector || null,
        priority: priority || "normal",
      })
      .eq("id", contact.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Contact modifié.");
    await loadData();
  }

  async function deleteContact(contact) {
    if (!can("can_delete")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(`Supprimer le contact CRM "${contact.company_name}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("crm_contacts")
      .delete()
      .eq("id", contact.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (selectedContact?.id === contact.id) {
      setSelectedContact(null);
    }

    setMessage("Contact supprimé.");
    await loadData();
  }

  async function createInteraction(e) {
    e.preventDefault();

    if (!selectedContact) {
      setMessage("Sélectionne un contact.");
      return;
    }

    if (!can("can_create")) {
      setMessage("Action non autorisée.");
      return;
    }

    if (!interactionForm.subject && !interactionForm.next_action) {
      setMessage("Sujet ou action suivante obligatoire.");
      return;
    }

    const { data: createdInteraction, error } = await supabase.from("crm_interactions").insert({
      contact_id: selectedContact.id,
      interaction_type: interactionForm.interaction_type || "note",
      subject: interactionForm.subject || null,
      notes: interactionForm.notes || null,
      next_action: interactionForm.next_action || null,
      next_action_date: interactionForm.next_action_date || null,
      meeting_time: interactionForm.meeting_time || null,
      meeting_location: interactionForm.meeting_location || null,
      priority: interactionForm.priority || "normal",
      created_by: user?.id || null,
    })
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    await emitEvent({
      event_type: "CRM_INTERACTION_CREATED",
      entity_type: "crm",
      entity_id: selectedContact.id,
      title: `${interactionForm.interaction_type || "activité"} CRM : ${interactionForm.subject || interactionForm.next_action || selectedContact.company_name}`,
      description: interactionForm.notes || null,
      payload: {
        contact_id: selectedContact.id,
        interaction_id: createdInteraction?.id || null,
        interaction_type: interactionForm.interaction_type || "note",
        next_action: interactionForm.next_action || null,
        next_action_date: interactionForm.next_action_date || null,
        meeting_time: interactionForm.meeting_time || null,
        meeting_location: interactionForm.meeting_location || null,
        priority: interactionForm.priority || "normal",
      },
      user,
    });

    setInteractionForm({
      interaction_type: "note",
      subject: "",
      notes: "",
      next_action: "",
      next_action_date: "",
    });

    setMessage("Interaction ajoutée.");
    await loadData();
  }

  async function markAlertDone(interaction) {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const { error } = await supabase
      .from("crm_interactions")
      .update({
        done: true,
        done_at: new Date().toISOString(),
      })
      .eq("id", interaction.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Alerte traitée.");
    await loadData();
  }

  async function createStage(e) {
    e.preventDefault();

    if (!can("can_create")) {
      setMessage("Action non autorisée.");
      return;
    }

    if (!stageForm.name) {
      setMessage("Nom d'étape obligatoire.");
      return;
    }

    const nextOrder = Math.max(...stages.map((stage) => Number(stage.stage_order || 0)), 0) + 1;

    const { error } = await supabase.from("crm_pipeline_stages").insert({
      name: stageForm.name,
      color: stageForm.color || "#2563eb",
      stage_order: nextOrder,
      active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setStageForm({ name: "", color: "#2563eb" });
    setMessage("Étape CRM ajoutée.");
    await loadData();
  }

  async function editStage(stage) {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const name = window.prompt("Nom étape ?", stage.name);
    if (name === null) return;

    const order = window.prompt("Ordre ?", String(stage.stage_order || 1));
    if (order === null) return;

    const color = window.prompt("Couleur HEX ?", stage.color || "#2563eb");
    if (color === null) return;

    const { error } = await supabase
      .from("crm_pipeline_stages")
      .update({
        name,
        stage_order: Number(order) || 1,
        color: color || "#2563eb",
      })
      .eq("id", stage.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Étape modifiée.");
    await loadData();
  }

  async function deleteStage(stage) {
    if (!can("can_delete")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(`Archiver l'étape "${stage.name}" ?`);
    if (!ok) return;

    await supabase
      .from("crm_contacts")
      .update({ stage_id: null })
      .eq("stage_id", stage.id);

    const { error } = await supabase
      .from("crm_pipeline_stages")
      .update({ active: false })
      .eq("id", stage.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Étape archivée.");
    await loadData();
  }

  function cleanPhone(phone) {
    return String(phone || "").replace(/[^\d+]/g, "");
  }

  function openPhone(contact) {
    if (!contact?.phone) {
      setMessage("Aucun numéro de téléphone sur ce contact.");
      return;
    }

    try {
      openAlloCall(contact.phone);
      setMessage(`Ouverture d'Allo pour appeler ${contact.company_name}.`);
    } catch (error) {
      setMessage(error?.message || "Impossible d'ouvrir Allo.");
    }
  }

  function openEmail(contact) {
    if (!contact?.email) {
      setMessage("Aucun email sur ce contact.");
      return;
    }

    // Le clic ouvre d'abord la fiche complète. L'envoi reste une action explicite
    // depuis le panneau Emails afin d'éviter l'ouverture automatique du composeur.
    setSelectedContact(contact);
  }

  async function saveCallInteraction(status = "called") {
    if (!activeCall?.contact) return;

    const endedAt = new Date().toISOString();
    const startedAt = activeCall.startedAt || endedAt;
    const durationSeconds = Math.max(
      0,
      Math.round((new Date(endedAt) - new Date(startedAt)) / 1000)
    );

    const notes = window.prompt("Notes d'appel ?", "");
    if (notes === null) return;

    const nextAction = window.prompt("Action suivante / relance ?", "");
    if (nextAction === null) return;

    const nextDate = window.prompt("Date de relance ? Format AAAA-MM-JJ. Laisse vide si aucune.", "");
    if (nextDate === null) return;

    const { error } = await supabase.from("crm_interactions").insert({
      contact_id: activeCall.contact.id,
      interaction_type: "appel",
      subject: `Appel ${status}`,
      notes: notes || null,
      next_action: nextAction || null,
      next_action_date: nextDate || null,
      call_started_at: startedAt,
      call_ended_at: endedAt,
      call_duration_seconds: durationSeconds,
      call_status: status,
      created_by: user?.id || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await emitEvent({
      event_type: "CRM_CALL_LOGGED",
      entity_type: "crm",
      entity_id: activeCall.contact.id,
      title: `Appel CRM : ${activeCall.contact.company_name}`,
      description: notes || null,
      payload: {
        contact_id: activeCall.contact.id,
        phone: activeCall.phone,
        call_status: status,
        duration_seconds: durationSeconds,
        next_action: nextAction || null,
        next_action_date: nextDate || null,
      },
      user,
    });

    setActiveCall(null);
    setMessage("Appel enregistré dans le CRM.");
    await loadData();
  }

  async function quickLogEmail(contact) {
    if (!contact) return;

    const subject = window.prompt("Sujet de l'email ?", "Email envoyé");
    if (subject === null) return;

    const nextAction = window.prompt("Action suivante / relance ?", "");
    if (nextAction === null) return;

    const nextDate = window.prompt("Date de relance ? Format AAAA-MM-JJ. Laisse vide si aucune.", "");
    if (nextDate === null) return;

    const { error } = await supabase.from("crm_interactions").insert({
      contact_id: contact.id,
      interaction_type: "email",
      subject: subject || "Email envoyé",
      next_action: nextAction || null,
      next_action_date: nextDate || null,
      created_by: user?.id || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await emitEvent({
      event_type: "CRM_EMAIL_LOGGED",
      entity_type: "crm",
      entity_id: contact.id,
      title: `Email CRM : ${contact.company_name}`,
      description: subject || null,
      payload: {
        contact_id: contact.id,
        next_action: nextAction || null,
        next_action_date: nextDate || null,
      },
      user,
    });

    setMessage("Email enregistré dans le CRM.");
    await loadData();
  }

  function openMaps(contact) {
    const query = encodeURIComponent(`${contact.company_name || ""} ${contact.city || ""}`.trim());
    if (!query) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
  }

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
  }

  function weightedPipe(contact) {
    return Number(contact.estimated_amount || 0) * (Number(contact.probability_percent || contact.probability || 0) / 100);
  }

  function priorityLabel(value) {
    const labels = {
      low: "Basse",
      normal: "Normale",
      high: "Haute",
      critical: "Critique",
    };

    return labels[value] || value || "Normale";
  }

  function interactionMeta(type) {
    const meta = {
      appel: { icon: "📞", label: "Appel", className: "call" },
      email: { icon: "✉️", label: "Email", className: "email" },
      rdv: { icon: "📅", label: "Rendez-vous", className: "meeting" },
      devis: { icon: "💰", label: "Devis", className: "quote" },
      relance: { icon: "⏰", label: "Relance", className: "followup" },
      note: { icon: "📝", label: "Note", className: "note" },
    };

    return meta[type] || { icon: "•", label: type || "Activité", className: "default" };
  }

  function formatActivityDate(value) {
    if (!value) return "Date non renseignée";

    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function stageMetrics(stageContacts) {
    const raw = stageContacts.reduce(
      (sum, contact) => sum + Number(contact.estimated_amount || 0),
      0
    );

    const weighted = stageContacts.reduce(
      (sum, contact) => sum + weightedPipe(contact),
      0
    );

    const avgProbability =
      stageContacts.length > 0
        ? stageContacts.reduce(
            (sum, contact) => sum + Number(contact.probability_percent || contact.probability || 0),
            0
          ) / stageContacts.length
        : 0;

    const nextMonth = new Date().toISOString().slice(0, 7);
    const currentMonthForecast = stageContacts
      .filter((contact) => contact.expected_signature_month === nextMonth)
      .reduce((sum, contact) => sum + weightedPipe(contact), 0);

    return {
      raw,
      weighted,
      avgProbability,
      currentMonthForecast,
    };
  }


  function qualificationMeta(contact) {
    const probability = Number(contact?.probability_percent || contact?.probability || 0);
    const score = opportunityScore(contact);

    if (probability >= 70 || score >= 80) {
      return { label: "Chaud", icon: "🔥", className: "hot" };
    }

    if (probability >= 40 || score >= 50) {
      return { label: "Tiède", icon: "🟠", className: "warm" };
    }

    return { label: "Froid", icon: "🔵", className: "cold" };
  }

  function clientCategory(contact) {
    const source = `${contact?.sector || ""} ${contact?.contact_type || ""} ${contact?.company_name || ""}`.toLowerCase();
    const categories = [
      ["communauté", "Communauté de communes"],
      ["commune", "Commune"],
      ["mairie", "Commune"],
      ["ville", "Commune"],
      ["office de tourisme", "Office de tourisme"],
      ["architect", "Architecte"],
      ["promoteur", "Promoteur"],
      ["industrie", "Industrie"],
      ["association", "Association"],
      ["particulier", "Particulier"],
      ["département", "Département"],
      ["region", "Région"],
      ["région", "Région"],
    ];
    return categories.find(([needle]) => source.includes(needle))?.[1] || contact?.sector || "Entreprise / autre";
  }

  function relativeActivityLabel(contactId) {
    const days = daysSinceLastActivity(contactId);
    if (days === 999) return "Aucune activité";
    if (days <= 0) return "Aujourd’hui";
    if (days === 1) return "Hier";
    return `Il y a ${days} jours`;
  }

  function projectStatusLabel(status) {
    const labels = {
      validated: "Validé",
      production: "En production",
      ready: "Prêt",
      installed: "Posé",
      archived: "Archivé",
      pending: "À valider",
    };
    return labels[status] || status || "Non renseigné";
  }

  function projectDocumentsForContact(contactId) {
    const ids = new Set(contactProjects(contactId).map((project) => project.id));
    return projectDocuments.filter((document) => ids.has(document.project_id));
  }

  function processSteps(contact) {
    const hasMeeting = contactInteractions(contact.id).some((item) => item.interaction_type === "rdv");
    const hasQuote = contactQuotes(contact.id).length > 0 || contactInteractions(contact.id).some((item) => item.interaction_type === "devis");
    const hasProject = contactProjects(contact.id).length > 0 || Boolean(contact.project_id);
    return [
      { label: "Lead", done: true },
      { label: "Qualifié", done: Number(contact.probability_percent || contact.probability || 0) >= 30 },
      { label: "RDV", done: hasMeeting },
      { label: "Devis", done: hasQuote },
      { label: "Projet", done: hasProject },
      { label: "Signé", done: isWonStage(contact.stage_id) || contactProjects(contact.id).some((project) => project.signed_date) },
    ];
  }

  function contactCard(contact) {
    const probability = Number(contact.probability_percent || contact.probability || 0);
    const qualification = qualificationMeta(contact);

    return (
      <div
        className="crm-card crm-card-v2 crm-card-360"
        draggable
        onDragStart={() => setDraggedContactId(contact.id)}
        onDragEnd={() => setDraggedContactId(null)}
        onClick={() => setSelectedContact(contact)}
      >
        <div className="crm-card-v2-head">
          <div>
            <strong>{contact.company_name}</strong>
            <small>{contact.city || "Ville non renseignée"}</small>
          </div>
          <span className={`crm-qualification-badge ${qualification.className}`}>
            {qualification.icon} {qualification.label}
          </span>
        </div>

        <div className="crm-card-v2-contact">
          <span>👤</span>
          <div>
            <strong>{contact.contact_name || "Contact non renseigné"}</strong>
            <small>{employeeName(contact.assigned_to)} · {clientCategory(contact)}</small>
          </div>
        </div>

        <div className="crm-card-v2-kpis">
          <div><small>Montant</small><strong>{formatMoney(contact.estimated_amount || 0)}</strong></div>
          <div><small>Probabilité</small><strong>{probability} %</strong></div>
          <div><small>Pondéré</small><strong>{formatMoney(weightedPipe(contact))}</strong></div>
        </div>

        <div className="crm-card-v2-meta">
          <span>📅 {contact.expected_signature_month || "Non planifiée"}</span>
          <span>🕒 {relativeActivityLabel(contact.id)}</span>
        </div>

        <div className="crm-card-v2-footer">
          <span>{contact.product_family || "Famille non renseignée"}</span>
          <span className={`crm-priority-badge ${contact.priority || "normal"}`}>{priorityLabel(contact.priority)}</span>
        </div>

        <div className="crm-card-actions">
          <button className="btn small" onClick={(e) => { e.stopPropagation(); openPhone(contact); }}>Appeler</button>
          <button className="btn small" onClick={(e) => { e.stopPropagation(); openEmail(contact); }}>Email</button>
          <button className="btn small" onClick={(e) => { e.stopPropagation(); editContact(contact); }}>Modifier</button>
          <button className="btn small danger-soft" onClick={(e) => { e.stopPropagation(); deleteContact(contact); }}>Supprimer</button>
        </div>
      </div>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Commercial</p>
          <h2>CRM</h2>
          <p>Pipeline commercial, relances et performance commerciale.</p>
        </div>

        <div className="inline-actions crm-top-actions">
          <label className="btn small crm-import-button">
            Import CSV
            <input type="file" accept=".csv,text/csv" onChange={importCsvFile} />
          </label>

          <button className="btn small" onClick={downloadCsvTemplate}>
            Modèle CSV
          </button>

          <button className={viewMode === "board" ? "btn primary" : "btn small"} onClick={() => setViewMode("board")}>
            Board
          </button>
          <button className={viewMode === "analytics" ? "btn primary" : "btn small"} onClick={() => setViewMode("analytics")}>
            Analyse
          </button>
          <button className={viewMode === "settings" ? "btn primary" : "btn small"} onClick={() => setViewMode("settings")}>
            Étapes
          </button>
        </div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="crm-alerts-grid crm-alerts-grid-extended">
        <div className="card crm-alert-card overdue">
          <h3>Alertes en retard</h3>
          {overdueAlerts.length === 0 ? (
            <p>Aucune relance en retard.</p>
          ) : (
            overdueAlerts.map((alert) => (
              <div className="crm-alert-row" key={alert.id}>
                <div>
                  <strong>{alert.next_action || alert.subject || "Relance"}</strong>
                  <small>{alert.next_action_date} · {contacts.find((c) => c.id === alert.contact_id)?.company_name || "-"}</small>
                </div>
                <button className="btn small" onClick={() => markAlertDone(alert)}>Traité</button>
              </div>
            ))
          )}
        </div>

        <div className="card crm-alert-card today">
          <h3>Relances du jour</h3>
          {todayAlerts.length === 0 ? (
            <p>Aucune relance aujourd'hui.</p>
          ) : (
            todayAlerts.map((alert) => (
              <div className="crm-alert-row" key={alert.id}>
                <div>
                  <strong>{alert.next_action || alert.subject || "Action"}</strong>
                  <small>{alert.next_action_date} · {contacts.find((c) => c.id === alert.contact_id)?.company_name || "-"}</small>
                </div>
                <button className="btn small" onClick={() => markAlertDone(alert)}>Traité</button>
              </div>
            ))
          )}
        </div>

        <div className="card crm-alert-card meetings">
          <h3>RDV commerciaux du jour</h3>
          {todayMeetings.length === 0 ? (
            <p>Aucun RDV commercial aujourd'hui.</p>
          ) : (
            todayMeetings.map((meeting) => (
              <div className="crm-alert-row" key={meeting.id}>
                <div>
                  <strong>{meeting.meeting_time ? `${meeting.meeting_time} · ` : ""}{meeting.subject || meeting.next_action || "RDV commercial"}</strong>
                  <small>
                    {contacts.find((c) => c.id === meeting.contact_id)?.company_name || "-"}
                    {meeting.meeting_location ? ` · ${meeting.meeting_location}` : ""}
                  </small>
                </div>
                <button className="btn small" onClick={() => markAlertDone(meeting)}>Traité</button>
              </div>
            ))
          )}
        </div>

        <div className="card crm-alert-card quotes">
          <h3>Devis à suivre</h3>
          {quoteActions.length === 0 ? (
            <p>Aucun devis à traiter aujourd'hui ou en retard.</p>
          ) : (
            quoteActions.map((alert) => (
              <div className="crm-alert-row" key={alert.id}>
                <div>
                  <strong>{alert.next_action || alert.subject || "Suivi devis"}</strong>
                  <small>{alert.next_action_date} · {contacts.find((c) => c.id === alert.contact_id)?.company_name || "-"}</small>
                </div>
                <button className="btn small" onClick={() => markAlertDone(alert)}>Traité</button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="crm-command-center">
        <div className="crm-command-card dark">
          <span>Pipe filtré</span>
          <strong>{formatMoney(crmPipelineRaw)}</strong>
          <small>{filteredOpenOpportunities.length} opportunité(s) ouvertes</small>
        </div>

        <div className="crm-command-card">
          <span>Pipe pondéré</span>
          <strong>{formatMoney(crmPipelineWeighted)}</strong>
          <small>Montant × probabilité</small>
        </div>

        <div className="crm-command-card warning">
          <span>À relancer</span>
          <strong>{alerts.length}</strong>
          <small>{overdueAlerts.length} en retard</small>
        </div>

        <div className="crm-command-card hot">
          <span>Opportunités chaudes</span>
          <strong>{hotOpportunities.length}</strong>
          <small>Probabilité ≥ 70 %</small>
        </div>
      </div>

      <div className="card crm-filter-card">
        <div className="page-head">
          <div>
            <h3>Pilotage commercial</h3>
            <p>Filtre le pipe par commercial, étape, priorité, mois prévisionnel et probabilité.</p>
          </div>

          <button
            className="btn small"
            onClick={() => {
              setSearch("");
              setCrmFilters({
                assigned_to: "all",
                priority: "all",
                forecast_month: "all",
                stage_id: "all",
                min_probability: "",
              });
            }}
          >
            Réinitialiser
          </button>
        </div>

        <div className="crm-filter-grid">
          <div>
            <label>Recherche globale</label>
            <input
              placeholder="Client, ville, produit, dossier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div>
            <label>Commercial</label>
            <select
              value={crmFilters.assigned_to}
              onChange={(e) => setCrmFilters({ ...crmFilters, assigned_to: e.target.value })}
            >
              <option value="all">Tous</option>
              <option value="none">Non affecté</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Étape</label>
            <select
              value={crmFilters.stage_id}
              onChange={(e) => setCrmFilters({ ...crmFilters, stage_id: e.target.value })}
            >
              <option value="all">Toutes</option>
              <option value="none">Sans étape</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>{stage.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Priorité</label>
            <select
              value={crmFilters.priority}
              onChange={(e) => setCrmFilters({ ...crmFilters, priority: e.target.value })}
            >
              <option value="all">Toutes</option>
              <option value="low">Basse</option>
              <option value="normal">Normale</option>
              <option value="high">Haute</option>
              <option value="critical">Critique</option>
            </select>
          </div>

          <div>
            <label>Mois prévisionnel</label>
            <select
              value={crmFilters.forecast_month}
              onChange={(e) => setCrmFilters({ ...crmFilters, forecast_month: e.target.value })}
            >
              <option value="all">Tous</option>
              {forecastMonths.map((month) => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Probabilité mini</label>
            <input
              type="number"
              min="0"
              max="100"
              value={crmFilters.min_probability}
              onChange={(e) => setCrmFilters({ ...crmFilters, min_probability: e.target.value })}
              placeholder="Ex : 70"
            />
          </div>
        </div>
      </div>

      <div className="crm-focus-grid">
        <div className="card">
          <h3>🔥 Opportunités chaudes</h3>
          {hotOpportunities.length === 0 ? (
            <p>Aucune opportunité chaude dans ce filtre.</p>
          ) : (
            hotOpportunities.map((contact) => (
              <button className="crm-focus-row" key={contact.id} onClick={() => setSelectedContact(contact)}>
                <div>
                  <strong>{contact.company_name}</strong>
                  <small>{stageName(contact.stage_id)} · {employeeName(contact.assigned_to)}</small>
                </div>
                <span>{formatMoney(weightedPipe(contact))}</span>
              </button>
            ))
          )}
        </div>

        <div className="card">
          <h3>⚠ Dossiers sans activité</h3>
          {staleOpportunities.length === 0 ? (
            <p>Aucun dossier bloqué à plus de 21 jours.</p>
          ) : (
            staleOpportunities.map((contact) => (
              <button className="crm-focus-row" key={contact.id} onClick={() => setSelectedContact(contact)}>
                <div>
                  <strong>{contact.company_name}</strong>
                  <small>{daysSinceLastActivity(contact.id)} jours sans activité · {employeeName(contact.assigned_to)}</small>
                </div>
                <span>{formatMoney(contact.estimated_amount || 0)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <h3>Ajouter un contact / client</h3>

        <form className="crm-contact-form" onSubmit={createContact}>
          <div>
            <label>Société / client</label>
            <input value={contactForm.company_name} onChange={(e) => setContactForm({ ...contactForm, company_name: e.target.value })} />
          </div>

          <div>
            <label>Contact</label>
            <input value={contactForm.contact_name} onChange={(e) => setContactForm({ ...contactForm, contact_name: e.target.value })} />
          </div>

          <div>
            <label>Email</label>
            <input value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
          </div>

          <div>
            <label>Téléphone</label>
            <input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
          </div>

          <div>
            <label>Ville</label>
            <input value={contactForm.city} onChange={(e) => setContactForm({ ...contactForm, city: e.target.value })} />
          </div>

          <div>
            <label>Commercial</label>
            <select value={contactForm.assigned_to} onChange={(e) => setContactForm({ ...contactForm, assigned_to: e.target.value })}>
              <option value="">Non affecté</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Montant estimé HT</label>
            <input type="number" value={contactForm.estimated_amount} onChange={(e) => setContactForm({ ...contactForm, estimated_amount: e.target.value })} />
          </div>

          <div>
            <label>Probabilité %</label>
            <input type="number" min="0" max="100" value={contactForm.probability_percent} onChange={(e) => setContactForm({ ...contactForm, probability_percent: e.target.value })} />
          </div>

          <div>
            <label>Mois signature prévu</label>
            <input type="month" value={contactForm.expected_signature_month} onChange={(e) => setContactForm({ ...contactForm, expected_signature_month: e.target.value })} />
          </div>

          <div>
            <label>Marge estimée %</label>
            <input type="number" value={contactForm.margin_percent} onChange={(e) => setContactForm({ ...contactForm, margin_percent: e.target.value })} />
          </div>

          <div>
            <label>Famille produit</label>
            <input value={contactForm.product_family} onChange={(e) => setContactForm({ ...contactForm, product_family: e.target.value })} placeholder="Lettrage, banc, maritime..." />
          </div>

          <div>
            <label>Secteur</label>
            <input value={contactForm.sector} onChange={(e) => setContactForm({ ...contactForm, sector: e.target.value })} placeholder="Collectivité, industrie..." />
          </div>

          <div>
            <label>Source lead</label>
            <input value={contactForm.lead_source} onChange={(e) => setContactForm({ ...contactForm, lead_source: e.target.value })} />
          </div>

          <div>
            <label>Priorité</label>
            <select value={contactForm.priority} onChange={(e) => setContactForm({ ...contactForm, priority: e.target.value })}>
              <option value="low">Basse</option>
              <option value="normal">Normale</option>
              <option value="high">Haute</option>
              <option value="critical">Critique</option>
            </select>
          </div>

          <div>
            <label>Projet lié</label>
            <select value={contactForm.project_id} onChange={(e) => setContactForm({ ...contactForm, project_id: e.target.value })}>
              <option value="">Aucun</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.project_code ? `${project.project_code} - ` : ""}{project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Chiffrage lié</label>
            <select value={contactForm.quote_id} onChange={(e) => setContactForm({ ...contactForm, quote_id: e.target.value })}>
              <option value="">Aucun</option>
              {quotes.map((quote) => (
                <option key={quote.id} value={quote.id}>
                  {quote.title || quote.name || quote.reference || "Chiffrage"}
                </option>
              ))}
            </select>
          </div>

          <button className="btn primary">Ajouter</button>
        </form>
      </div>

      {viewMode === "board" && (
        <>
          <div className="crm-board-summary">
            <span>{filteredContacts.length} opportunité(s) affichée(s)</span>
            <strong>{formatMoney(crmPipelineWeighted)} pondéré</strong>
          </div>

          <div className="crm-board">
            {stages.map((stage) => {
              const stageContacts = filteredContacts.filter((contact) => contact.stage_id === stage.id);
              const metrics = stageMetrics(stageContacts);

              return (
                <div
                  className="crm-column crm-smart-column"
                  key={stage.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => draggedContactId && updateContactStage(draggedContactId, stage.id)}
                >
                  <div className="crm-column-head crm-smart-column-head" style={{ borderTopColor: stage.color || "#2563eb" }}>
                    <div>
                      <strong>{stage.name}</strong>
                      <span>{stageContacts.length} opportunité(s)</span>
                    </div>

                    <div className="crm-column-kpis">
                      <div>
                        <small>Pipe brut</small>
                        <b>{formatMoney(metrics.raw)}</b>
                      </div>
                      <div>
                        <small>Pondéré</small>
                        <b>{formatMoney(metrics.weighted)}</b>
                      </div>
                      <div>
                        <small>Proba moy.</small>
                        <b>{Math.round(metrics.avgProbability)} %</b>
                      </div>
                      <div>
                        <small>Ce mois</small>
                        <b>{formatMoney(metrics.currentMonthForecast)}</b>
                      </div>
                    </div>
                  </div>

                  <div className="crm-column-body">
                    {stageContacts.map(contactCard)}
                  </div>
                </div>
              );
            })}

            <div
              className="crm-column crm-smart-column"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => draggedContactId && updateContactStage(draggedContactId, null)}
            >
              {(() => {
                const noStageContacts = filteredContacts.filter((contact) => !contact.stage_id);
                const metrics = stageMetrics(noStageContacts);

                return (
                  <>
                    <div className="crm-column-head crm-smart-column-head" style={{ borderTopColor: "#64748b" }}>
                      <div>
                        <strong>Sans étape</strong>
                        <span>{noStageContacts.length} opportunité(s)</span>
                      </div>

                      <div className="crm-column-kpis">
                        <div><small>Pipe brut</small><b>{formatMoney(metrics.raw)}</b></div>
                        <div><small>Pondéré</small><b>{formatMoney(metrics.weighted)}</b></div>
                        <div><small>Proba moy.</small><b>{Math.round(metrics.avgProbability)} %</b></div>
                        <div><small>Ce mois</small><b>{formatMoney(metrics.currentMonthForecast)}</b></div>
                      </div>
                    </div>

                    <div className="crm-column-body">
                      {noStageContacts.map(contactCard)}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {viewMode === "analytics" && (
        <div className="card">
          <h3>Performance commerciale</h3>

          <div className="crm-analytics">
            {analytics.map((item) => (
              <div className="crm-bar-row" key={item.label}>
                <span>{item.label}</span>
                <div>
                  <i style={{ width: `${Math.max(6, (item.value / maxAnalytics) * 100)}%` }} />
                </div>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === "settings" && (
        <div className="card">
          <h3>Étapes du pipeline</h3>

          <form className="crm-stage-form" onSubmit={createStage}>
            <input
              placeholder="Ex : Relance R3"
              value={stageForm.name}
              onChange={(e) => setStageForm({ ...stageForm, name: e.target.value })}
            />
            <input
              type="color"
              value={stageForm.color}
              onChange={(e) => setStageForm({ ...stageForm, color: e.target.value })}
            />
            <button className="btn primary">Ajouter étape</button>
          </form>

          <div className="crm-stage-list">
            {stages.map((stage) => (
              <div key={stage.id}>
                <span style={{ background: stage.color || "#2563eb" }} />
                <strong>{stage.stage_order}. {stage.name}</strong>
                <button className="btn small" onClick={() => editStage(stage)}>Modifier</button>
                <button className="btn small danger-soft" onClick={() => deleteStage(stage)}>Archiver</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedContact && opportunityForm && (
        <div className="crm-drawer-backdrop" onClick={() => setSelectedContact(null)}>
          <aside className="crm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="crm-drawer-head">
              <div>
                <p className="eyebrow">Fiche client complète</p>
                <h3>{selectedContact.company_name}</h3>
                <p>{selectedContact.contact_name || "-"} · {selectedContact.email || "-"} · {selectedContact.phone || "-"}</p>
              </div>

              <button className="btn small" onClick={() => setSelectedContact(null)}>← Retour au CRM</button>
            </div>

            <div className="crm-360-identity">
              <div className="crm-360-tags">
                <span className={`crm-qualification-badge ${qualificationMeta(selectedContact).className}`}>
                  {qualificationMeta(selectedContact).icon} {qualificationMeta(selectedContact).label}
                </span>
                <span className="crm-category-badge">{clientCategory(selectedContact)}</span>
                <span className={`crm-priority-badge ${selectedContact.priority || "normal"}`}>{priorityLabel(selectedContact.priority)}</span>
              </div>
              <div className="crm-360-owner">
                <span>Commercial</span>
                <strong>{employeeName(selectedContact.assigned_to)}</strong>
              </div>
            </div>

            <div className="crm-process-track">
              {processSteps(selectedContact).map((step, index) => (
                <div className={step.done ? "done" : ""} key={step.label}>
                  <span>{step.done ? "✓" : index + 1}</span>
                  <strong>{step.label}</strong>
                </div>
              ))}
            </div>

            <div className="crm-drawer-score">
              <div>
                <span>Score opportunité</span>
                <strong>{opportunityScore(selectedContact)} / 100</strong>
                <small>
                  {opportunityScore(selectedContact) >= 80 && "Opportunité chaude"}
                  {opportunityScore(selectedContact) >= 50 && opportunityScore(selectedContact) < 80 && "Opportunité à structurer"}
                  {opportunityScore(selectedContact) < 50 && "Dossier à qualifier"}
                </small>
              </div>

              <div className="crm-drawer-score-bar">
                <b style={{ width: `${opportunityScore(selectedContact)}%` }} />
              </div>
            </div>

            <div className="crm-opportunity-summary">
              <div><span>Montant estimé</span><strong>{formatMoney(selectedContact.estimated_amount || 0)}</strong></div>
              <div><span>Probabilité</span><strong>{Number(selectedContact.probability_percent || selectedContact.probability || 0)} %</strong></div>
              <div><span>Pipe pondéré</span><strong>{formatMoney(weightedPipe(selectedContact))}</strong></div>
              <div><span>Signature prévue</span><strong>{selectedContact.expected_signature_month || "-"}</strong></div>
              <div><span>Famille</span><strong>{selectedContact.product_family || "-"}</strong></div>
              <div><span>Secteur</span><strong>{selectedContact.sector || "-"}</strong></div>
              <div><span>Dossier</span><strong>{selectedContact.dossier_code || "-"}</strong></div>
            </div>

            <div className="crm-contact-actions">
              <button className="btn primary" onClick={() => openPhone(selectedContact)}>
                Appeler
              </button>
              <button className="btn small" onClick={() => openEmail(selectedContact)}>
                Email
              </button>
              <button className="btn small" onClick={() => openMaps(selectedContact)}>
                Itinéraire
              </button>
              <button className="btn primary" onClick={() => createProjectFromOpportunity(selectedContact)}>
                Créer projet
              </button>
            </div>

            <form className="crm-drawer-form" onSubmit={saveOpportunity}>
              <section>
                <h4>Informations</h4>

                <div className="crm-drawer-grid">
                  <div>
                    <label>Client / société</label>
                    <input value={opportunityForm.company_name} onChange={(e) => updateOpportunityForm("company_name", e.target.value)} />
                  </div>

                  <div>
                    <label>Contact</label>
                    <input value={opportunityForm.contact_name} onChange={(e) => updateOpportunityForm("contact_name", e.target.value)} />
                  </div>

                  <div>
                    <label>Email</label>
                    <input value={opportunityForm.email} onChange={(e) => updateOpportunityForm("email", e.target.value)} />
                  </div>

                  <div>
                    <label>Téléphone</label>
                    <input value={opportunityForm.phone} onChange={(e) => updateOpportunityForm("phone", e.target.value)} />
                  </div>

                  <div>
                    <label>Ville</label>
                    <input value={opportunityForm.city} onChange={(e) => updateOpportunityForm("city", e.target.value)} />
                  </div>

                  <div>
                    <label>Étape</label>
                    <select value={opportunityForm.stage_id} onChange={(e) => updateOpportunityForm("stage_id", e.target.value)}>
                      <option value="">Aucune</option>
                      {stages.map((stage) => (
                        <option key={stage.id} value={stage.id}>{stage.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label>Commercial</label>
                    <select value={opportunityForm.assigned_to} onChange={(e) => updateOpportunityForm("assigned_to", e.target.value)}>
                      <option value="">Non affecté</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>{employee.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label>Priorité</label>
                    <select value={opportunityForm.priority} onChange={(e) => updateOpportunityForm("priority", e.target.value)}>
                      <option value="low">Basse</option>
                      <option value="normal">Normale</option>
                      <option value="high">Haute</option>
                      <option value="critical">Critique</option>
                    </select>
                  </div>
                </div>
              </section>

              <section>
                <h4>Financier & prévisionnel</h4>

                <div className="crm-drawer-grid">
                  <div>
                    <label>Montant estimé HT</label>
                    <input type="number" value={opportunityForm.estimated_amount} onChange={(e) => updateOpportunityForm("estimated_amount", e.target.value)} />
                  </div>

                  <div>
                    <label>Marge estimée %</label>
                    <input type="number" value={opportunityForm.margin_percent} onChange={(e) => updateOpportunityForm("margin_percent", e.target.value)} />
                  </div>

                  <div>
                    <label>Probabilité %</label>
                    <input type="number" min="0" max="100" value={opportunityForm.probability_percent} onChange={(e) => updateOpportunityForm("probability_percent", e.target.value)} />
                  </div>

                  <div>
                    <label>Mois signature prévisionnel</label>
                    <input type="month" value={opportunityForm.expected_signature_month} onChange={(e) => updateOpportunityForm("expected_signature_month", e.target.value)} />
                  </div>

                  <div>
                    <label>Famille produit</label>
                    <input value={opportunityForm.product_family} onChange={(e) => updateOpportunityForm("product_family", e.target.value)} />
                  </div>

                  <div>
                    <label>Secteur</label>
                    <input value={opportunityForm.sector} onChange={(e) => updateOpportunityForm("sector", e.target.value)} />
                  </div>

                  <div>
                    <label>Source lead</label>
                    <input value={opportunityForm.lead_source} onChange={(e) => updateOpportunityForm("lead_source", e.target.value)} />
                  </div>

                </div>
              </section>

              <section>
                <div className="crm-section-title">
                  <div>
                    <h4>Vue ERP 360°</h4>
                    <p>Projets, chiffrages et documents liés à ce client.</p>
                  </div>
                </div>

                <div className="crm-erp-overview">
                  <div className="crm-erp-panel">
                    <div className="crm-erp-panel-head"><strong>🏗 Projets</strong><span>{contactProjects(selectedContact.id).length}</span></div>
                    {contactProjects(selectedContact.id).length === 0 ? <p>Aucun projet lié.</p> : contactProjects(selectedContact.id).map((project) => (
                      <div className="crm-erp-row" key={project.id}>
                        <div>
                          <strong>{project.project_code || project.name}</strong>
                          <small>{project.name} · {projectStatusLabel(project.status)}</small>
                        </div>
                        <span>{formatMoney(project.sale_amount || 0)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="crm-erp-panel">
                    <div className="crm-erp-panel-head"><strong>📄 Chiffrages</strong><span>{contactQuotes(selectedContact.id).length}</span></div>
                    {contactQuotes(selectedContact.id).length === 0 ? <p>Aucun chiffrage lié.</p> : contactQuotes(selectedContact.id).map((quote) => (
                      <div className="crm-erp-row" key={quote.id}>
                        <div>
                          <strong>{quote.title || quote.name || quote.reference || "Chiffrage"}</strong>
                          <small>{quote.status || "Statut non renseigné"}</small>
                        </div>
                        <span>{formatMoney(quote.total_amount || quote.amount || quote.sale_amount || 0)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="crm-erp-panel">
                    <div className="crm-erp-panel-head"><strong>📎 Documents</strong><span>{projectDocumentsForContact(selectedContact.id).length}</span></div>
                    {projectDocumentsForContact(selectedContact.id).length === 0 ? <p>Aucun document projet.</p> : projectDocumentsForContact(selectedContact.id).slice(0, 8).map((document) => (
                      <a className="crm-document-row" key={document.id} href={document.file_url || document.public_url || "#"} target="_blank" rel="noreferrer">
                        <span>📄</span>
                        <div><strong>{document.name || document.file_name || document.title || "Document"}</strong><small>{document.category || "Projet"}</small></div>
                      </a>
                    ))}
                  </div>
                </div>

                <h4>Liaisons ERP</h4>

                <div className="crm-drawer-grid">
                  <div>
                    <label>Projet lié</label>
                    <select value={opportunityForm.project_id} onChange={(e) => updateOpportunityForm("project_id", e.target.value)}>
                      <option value="">Aucun</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.project_code ? `${project.project_code} - ` : ""}{project.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label>Chiffrage lié</label>
                    <select value={opportunityForm.quote_id} onChange={(e) => updateOpportunityForm("quote_id", e.target.value)}>
                      <option value="">Aucun</option>
                      {quotes.map((quote) => (
                        <option key={quote.id} value={quote.id}>
                          {quote.title || quote.name || quote.project_name || quote.reference || "Chiffrage"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label>Code dossier</label>
                    <input value={opportunityForm.dossier_code} onChange={(e) => updateOpportunityForm("dossier_code", e.target.value)} placeholder="DOS-2026-0001" />
                  </div>

                  <div className="crm-drawer-full">
                    <label>Notes internes</label>
                    <textarea value={opportunityForm.notes} onChange={(e) => updateOpportunityForm("notes", e.target.value)} />
                  </div>
                </div>
              </section>

              <div className="crm-drawer-save">
                <button className="btn primary">Enregistrer la fiche</button>
              </div>
            </form>

            <div className="crm-drawer-section">
              <h4>Ajouter une activité</h4>

              <form className="crm-interaction-form crm-interaction-form-extended" onSubmit={createInteraction}>
                <div>
                  <label>Type</label>
                  <select value={interactionForm.interaction_type} onChange={(e) => setInteractionForm({ ...interactionForm, interaction_type: e.target.value })}>
                    {INTERACTION_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Sujet</label>
                  <input value={interactionForm.subject} onChange={(e) => setInteractionForm({ ...interactionForm, subject: e.target.value })} />
                </div>

                <div>
                  <label>Action suivante</label>
                  <input value={interactionForm.next_action} onChange={(e) => setInteractionForm({ ...interactionForm, next_action: e.target.value })} />
                </div>

                <div>
                  <label>Date relance / RDV</label>
                  <input type="date" value={interactionForm.next_action_date} onChange={(e) => setInteractionForm({ ...interactionForm, next_action_date: e.target.value })} />
                </div>

                <div>
                  <label>Heure RDV</label>
                  <input type="time" value={interactionForm.meeting_time} onChange={(e) => setInteractionForm({ ...interactionForm, meeting_time: e.target.value })} />
                </div>

                <div>
                  <label>Lieu RDV</label>
                  <input value={interactionForm.meeting_location} onChange={(e) => setInteractionForm({ ...interactionForm, meeting_location: e.target.value })} />
                </div>

                <button className="btn primary">Ajouter activité</button>
              </form>
            </div>

            <div className="crm-drawer-section">
              <CrmEmailPanel
                contact={selectedContact}
                user={user}
                onActivityCreated={loadData}
              />
            </div>

            <div className="crm-drawer-section">
              <h4>Historique Allo</h4>

              <AlloCallHistory contact={selectedContact} />
            </div>

            <div className="crm-drawer-section">
              <h4>Timeline commerciale</h4>

              <div className="crm-timeline">
                {contactInteractions(selectedContact.id).length === 0 ? (
                  <p>Aucune activité enregistrée.</p>
                ) : (
                  contactInteractions(selectedContact.id).map((interaction) => (
                    <div className={`crm-timeline-item crm-timeline-${interactionMeta(interaction.interaction_type).className}`} key={interaction.id}>
                      <div className="crm-timeline-icon" aria-hidden="true">
                        {interactionMeta(interaction.interaction_type).icon}
                      </div>
                      <div className="crm-timeline-content">
                        <div className="crm-timeline-headline">
                          <span>{interactionMeta(interaction.interaction_type).label}</span>
                          <time>{formatActivityDate(interaction.created_at || interaction.interaction_date)}</time>
                        </div>
                        <strong>{interaction.subject || interaction.next_action || "Activité sans titre"}</strong>
                        {(interaction.next_action || interaction.next_action_date || interaction.meeting_time || interaction.meeting_location) && (
                          <small>
                            {interaction.next_action ? `Action : ${interaction.next_action}` : ""}
                            {interaction.next_action_date ? ` · échéance ${interaction.next_action_date}` : ""}
                            {interaction.meeting_time ? ` · ${interaction.meeting_time}` : ""}
                            {interaction.meeting_location ? ` · ${interaction.meeting_location}` : ""}
                          </small>
                        )}
                        {interaction.call_duration_seconds ? (
                          <small>Durée : {Math.floor(interaction.call_duration_seconds / 60)} min {interaction.call_duration_seconds % 60} s · statut : {interaction.call_status || "-"}</small>
                        ) : null}
                        {interaction.notes && <p>{interaction.notes}</p>}
                        {interaction.done && <span className="crm-timeline-done">Traité</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

    </section>
  );
}