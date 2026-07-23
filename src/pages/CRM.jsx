import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";
import { canAccess } from "../services/permissions.js";
import { emitEvent } from "../services/events.js";
import AlloCallHistory from "../components/AlloCallHistory.jsx";
import CrmEmailPanel from "../components/CrmEmailPanel.jsx";
import { openAlloCall } from "../services/allo.js";

const INTERACTION_TYPES = ["note", "appel", "email", "rdv", "devis", "relance"];

const COMMERCIAL_PIPELINE = [
  { name: "Suspect ciblé", color: "#64748b", probability: 5, icon: "🎯" },
  { name: "Prospect contacté — sans réponse", color: "#0ea5e9", probability: 10, icon: "📞" },
  { name: "Prospect contacté — réponse reçue", color: "#0284c7", probability: 20, icon: "✅" },
  { name: "À recontacter", color: "#f59e0b", probability: 25, icon: "🔄" },
  { name: "RDV 1 planifié", color: "#eab308", probability: 35, icon: "📅" },
  { name: "RDV 1 réalisé", color: "#d97706", probability: 45, icon: "🤝" },
  { name: "RDV 2 planifié", color: "#f97316", probability: 55, icon: "📅" },
  { name: "RDV 2 réalisé", color: "#ea580c", probability: 65, icon: "🤝" },
  { name: "Devis à préparer", color: "#8b5cf6", probability: 70, icon: "📝" },
  { name: "Devis envoyé", color: "#7c3aed", probability: 75, icon: "📄" },
  { name: "Devis en discussion", color: "#db2777", probability: 85, icon: "💬" },
  { name: "Devis validé", color: "#16a34a", probability: 100, icon: "✅" },
];

export default function CRM({ user, permissions }) {
  const [stages, setStages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [opportunityForm, setOpportunityForm] = useState(null);
  const [draggedContactId, setDraggedContactId] = useState(null);
  const [message, setMessage] = useState("");
  const [viewMode, setViewMode] = useState("temperature");
  const [temperatureFilter, setTemperatureFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [crmFilters, setCrmFilters] = useState({
    assigned_to: "all",
    priority: "all",
    forecast_month: "all",
    stage_id: "all",
    min_probability: "",
  });
  const [activeCall, setActiveCall] = useState(null);
  const [manualProjectColumn, setManualProjectColumn] = useState(null);
  const [manualProjectId, setManualProjectId] = useState("");

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
    probability_percent: "",
    expected_signature_month: "",
    product_family: "",
    sector: "",
    lead_source: "",
    competitor: "",
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
      competitor: selectedContact.competitor || "",
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
    ]);

    const error =
      stagesResponse.error ||
      contactsResponse.error ||
      employeesResponse.error ||
      interactionsResponse.error ||
      projectsResponse.error ||
      quotesResponse.error;

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

  function pipelineDefinitionForStage(stage) {
    const byOrder = COMMERCIAL_PIPELINE[Number(stage?.stage_order || 0) - 1];
    return byOrder || COMMERCIAL_PIPELINE.find((item) => item.name === stage?.name) || null;
  }

  function pipelineIsConfigured() {
    const ordered = [...stages]
      .filter((stage) => !String(stage.name || "").toLowerCase().includes("perdu"))
      .sort((a, b) => Number(a.stage_order || 0) - Number(b.stage_order || 0));
    return ordered.length === COMMERCIAL_PIPELINE.length && ordered.every((stage, index) => stage.name === COMMERCIAL_PIPELINE[index].name);
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
    return contact.status === "active" && !isWonStage(contact.stage_id) && !isLostStage(contact.stage_id);
  }

  function contactProjects(contactId) {
    return projects.filter((project) => project.crm_contact_id === contactId);
  }

  function linkedProject(contact) {
    if (!contact) return null;
    return projects.find((project) => project.id === contact.project_id)
      || projects.find((project) => project.crm_contact_id === contact.id)
      || null;
  }

  function opportunityLifecycle(contact) {
    const project = linkedProject(contact);
    if (project?.status === "ready") return "production_completed";
    if (project?.status === "in_production") return "in_production";
    if (project && ["validated", "planned"].includes(project.status)) return "validated";
    if (isWonStage(contact.stage_id)) return "validated";
    return "opportunity";
  }

  function contactQuotes(contactId) {
    return quotes.filter((quote) => quote.crm_contact_id === contactId);
  }

  function opportunityScore(contact) {
    const probability = Number(contact.probability_percent || contact.probability || 0);
    const amount = Number(contact.estimated_amount || 0);
    const inactivity = daysSinceLastActivity(contact.id);
    const contactItems = contactInteractions(contact.id);
    const hasMeeting = contactItems.some((item) => item.interaction_type === "rdv");
    const hasQuote = contactItems.some((item) => item.interaction_type === "devis");
    const hasRecentActivity = inactivity <= 7;
    const hasOverdueAction = contactItems.some((item) => !item.done && item.next_action_date && item.next_action_date < todayValue());

    let score = probability;
    if (amount >= 50000) score += 8;
    if (amount >= 100000) score += 5;
    if (hasMeeting) score += 8;
    if (hasQuote) score += 10;
    if (hasRecentActivity) score += 7;
    if (inactivity >= 21) score -= 18;
    if (inactivity >= 45) score -= 15;
    if (hasOverdueAction) score -= 5;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function opportunityTemperature(contact) {
    const score = opportunityScore(contact);
    if (score >= 70) return "hot";
    if (score >= 40) return "warm";
    return "cold";
  }

  function temperatureMeta(value) {
    return {
      hot: { label: "Chaud", icon: "🔥", hint: "À traiter en priorité" },
      warm: { label: "Tiède", icon: "🟠", hint: "À faire avancer" },
      cold: { label: "Froid", icon: "🔵", hint: "À réactiver" },
    }[value] || { label: "Non classé", icon: "⚪", hint: "" };
  }

  function nextActionForContact(contactId) {
    return contactInteractions(contactId)
      .filter((item) => !item.done && item.next_action_date)
      .sort((a, b) => String(a.next_action_date).localeCompare(String(b.next_action_date)))[0] || null;
  }

  function firstCommercialStage() {
    return [...stages]
      .filter((stage) => !String(stage.name || "").toLowerCase().includes("perdu"))
      .sort((a, b) => Number(a.stage_order || 0) - Number(b.stage_order || 0))[0] || null;
  }

  function hasExplicitPipelineEntry(contact) {
    if (!contact) return false;
    if (linkedProject(contact) || isWonStage(contact.stage_id) || isLostStage(contact.stage_id)) return true;
    if (contact.status !== "active" || !contact.stage_id) return false;

    const firstStage = firstCommercialStage();
    const currentStage = stages.find((stage) => stage.id === contact.stage_id);
    if (currentStage && firstStage && Number(currentStage.stage_order || 0) > Number(firstStage.stage_order || 0)) return true;

    return contactInteractions(contact.id).some((item) => {
      const type = String(item.interaction_type || "").toLowerCase();
      const subject = String(item.subject || "").toLowerCase();
      return ["appel", "email", "rdv", "devis", "relance"].includes(type)
        || subject.includes("prospect ciblé")
        || subject.includes("opportunité créée")
        || subject.includes("qualifiée par probabilité");
    });
  }

  function isPipelineContact(contact) {
    return contact?.status === "active" && hasExplicitPipelineEntry(contact);
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

      const matchesTemperature =
        temperatureFilter === "all" || opportunityTemperature(contact) === temperatureFilter;

      return (
        matchesSearch &&
        matchesAssigned &&
        matchesPriority &&
        matchesForecast &&
        matchesStage &&
        matchesProbability &&
        matchesTemperature
      );
    });
  }, [contacts, search, crmFilters, stages, interactions, temperatureFilter]);

  const prospectPool = useMemo(() => {
    const query = search.toLowerCase().trim();
    return contacts
      .filter((contact) => !linkedProject(contact) && !isWonStage(contact.stage_id) && !isLostStage(contact.stage_id))
      .filter((contact) => !isPipelineContact(contact))
      .filter((contact) => {
        if (!query) return true;
        return [contact.company_name, contact.contact_name, contact.city, contact.email, contact.phone, contact.sector]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => String(a.company_name || "").localeCompare(String(b.company_name || ""), "fr"));
  }, [contacts, search, stages, interactions, projects]);

  // Contacts historiques placés automatiquement dans le pipeline avant la création du vivier.
  // On conserve les contacts liés à un projet ainsi que les dossiers gagnés/perdus.
  const contactsToMoveToPool = contacts.filter((contact) => {
    return (
      contact.status === "active" &&
      !linkedProject(contact) &&
      !isWonStage(contact.stage_id) &&
      !isLostStage(contact.stage_id) &&
      !hasExplicitPipelineEntry(contact)
    );
  });

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

  const openOpportunities = contacts.filter((contact) => isPipelineContact(contact) && isOpenOpportunity(contact));
  const pipelineContacts = filteredContacts.filter(isPipelineContact);
  const filteredOpenOpportunities = pipelineContacts.filter(isOpenOpportunity);

  const crmPipelineRaw = filteredOpenOpportunities.reduce(
    (sum, contact) => sum + Number(contact.estimated_amount || 0),
    0
  );

  const crmPipelineWeighted = filteredOpenOpportunities.reduce(
    (sum, contact) => sum + weightedPipe(contact),
    0
  );

  const lifecycleContacts = pipelineContacts.filter((contact) => !isLostStage(contact.stage_id));

  const temperatureGroups = {
    hot: lifecycleContacts
      .filter((contact) => opportunityLifecycle(contact) === "opportunity" && opportunityTemperature(contact) === "hot")
      .sort((a, b) => opportunityScore(b) - opportunityScore(a)),
    warm: lifecycleContacts
      .filter((contact) => opportunityLifecycle(contact) === "opportunity" && opportunityTemperature(contact) === "warm")
      .sort((a, b) => opportunityScore(b) - opportunityScore(a)),
    cold: lifecycleContacts
      .filter((contact) => opportunityLifecycle(contact) === "opportunity" && opportunityTemperature(contact) === "cold")
      .sort((a, b) => daysSinceLastActivity(b.id) - daysSinceLastActivity(a.id)),
    validated: lifecycleContacts
      .filter((contact) => opportunityLifecycle(contact) === "validated")
      .sort((a, b) => String(linkedProject(b)?.signed_date || b.updated_at || "").localeCompare(String(linkedProject(a)?.signed_date || a.updated_at || ""))),
    in_production: lifecycleContacts
      .filter((contact) => opportunityLifecycle(contact) === "in_production")
      .sort((a, b) => String(linkedProject(b)?.production_start_date || b.updated_at || "").localeCompare(String(linkedProject(a)?.production_start_date || a.updated_at || ""))),
    production_completed: lifecycleContacts
      .filter((contact) => opportunityLifecycle(contact) === "production_completed")
      .sort((a, b) => String(linkedProject(b)?.production_end_date || b.updated_at || "").localeCompare(String(linkedProject(a)?.production_end_date || a.updated_at || ""))),
    lost: filteredContacts
      .filter((contact) => contact.status === "active" && isLostStage(contact.stage_id))
      .sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""))),
  };

  // Le tableau « Opportunités chaudes » est une retranscription stricte de la colonne Pipe Chaud.
  // Une seule source de données évite les écarts de filtre, de tri ou de quantité entre les deux vues.
  const hotOpportunities = temperatureGroups.hot;

  function temperatureAmount(key) {
    return temperatureGroups[key].reduce((sum, contact) => sum + Number(contact.estimated_amount || 0), 0);
  }

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
          // Un import alimente la base de prospection. Une opportunité n'est créée
          // qu'après ciblage volontaire depuis le vivier.
          stage_id: null,
          assigned_to: employee?.id || null,
          status: "contact_only",
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

    setMessage(`${contactsToInsert.length} prospect(s) importé(s) dans le vivier.`);
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

  async function createProjectFromOpportunity(contact, options = {}) {
    if (!contact) return null;

    if (!can("can_create")) {
      setMessage("Action non autorisée.");
      return null;
    }

    const existingProject = linkedProject(contact);
    if (existingProject) return existingProject;

    if (!options.skipConfirm) {
      const ok = window.confirm(`Créer un projet depuis l'opportunité "${contact.company_name}" ?`);
      if (!ok) return null;
    }

    const signedDate = options.signedDate || null;
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
        signed_date: signedDate,
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
      return null;
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
        signed_date: signedDate,
        estimated_amount: Number(contact.estimated_amount || 0),
      },
      user,
    });

    setSelectedContact({ ...contact, project_id: project.id, dossier_code: dossierCode });
    await loadData();
    return project;
  }

  async function ensureLostStage() {
    const existing = stages.find((stage) => String(stage.name || "").toLowerCase().includes("perdu"));
    if (existing) return existing;

    const nextOrder = Math.max(0, ...stages.map((stage) => Number(stage.stage_order || 0))) + 1;
    const { data, error } = await supabase
      .from("crm_pipeline_stages")
      .insert({
        name: "Perdu",
        color: "#dc2626",
        stage_order: nextOrder,
        default_probability_percent: 0,
        active: true,
      })
      .select()
      .single();

    if (error) throw error;
    setStages((current) => [...current, data]);
    return data;
  }

  async function exitOpportunity(contact) {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const reason = window.prompt(
      `Motif de perte pour « ${contact.company_name} » (facultatif) :`,
      ""
    );
    if (reason === null) return;

    const lostDate = todayValue();

    try {
      const lostStage = await ensureLostStage();
      const previousNotes = String(contact.notes || "").trim();
      const lossLine = `[PERDU ${lostDate}] ${reason?.trim() || "Motif non renseigné"}`;

      const { error } = await supabase
        .from("crm_contacts")
        .update({
          stage_id: lostStage.id,
          probability_percent: 0,
          notes: previousNotes ? `${previousNotes}\n${lossLine}` : lossLine,
        })
        .eq("id", contact.id);

      if (error) throw error;

      const { error: interactionError } = await supabase.from("crm_interactions").insert({
        contact_id: contact.id,
        interaction_type: "note",
        subject: "Opportunité classée perdue",
        notes: reason?.trim() || "Motif non renseigné",
        priority: "normal",
        created_by: user?.id || null,
      });

      if (interactionError) {
        setMessage(`Opportunité classée perdue, mais historique non créé : ${interactionError.message}`);
      } else {
        setMessage("Opportunité classée dans les dossiers perdus.");
      }

      if (selectedContact?.id === contact.id) setSelectedContact(null);
      await loadData();
    } catch (error) {
      setMessage(error.message || "Impossible de classer l'opportunité en perdu.");
    }
  }

  async function deleteOpportunityDirectly(contact) {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(
      `Retirer uniquement l’opportunité « ${contact.company_name} » du pipeline ? Le contact et son historique resteront dans le CRM.`
    );
    if (!ok) return;

    const { error } = await supabase
      .from("crm_contacts")
      .update({ status: "contact_only" })
      .eq("id", contact.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    const { error: interactionError } = await supabase.from("crm_interactions").insert({
      contact_id: contact.id,
      interaction_type: "note",
      subject: "Opportunité retirée du pipeline",
      notes: "Le contact est conservé dans le CRM avec son historique.",
      priority: "normal",
      created_by: user?.id || null,
    });

    if (interactionError) {
      setMessage(`Opportunité retirée, mais historique non créé : ${interactionError.message}`);
    } else {
      setMessage("Opportunité retirée du pipeline. Le contact reste dans le CRM.");
    }

    await loadData();
  }

  async function validateOpportunity(contact) {
    if (!can("can_edit") || !can("can_create")) {
      setMessage("Action non autorisée.");
      return;
    }

    const signedDate = window.prompt(
      "Date de signature du devis (AAAA-MM-JJ) ?",
      todayValue()
    );
    if (signedDate === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(signedDate)) {
      setMessage("La date de signature doit être au format AAAA-MM-JJ.");
      return;
    }

    const validatedStage = stages.find((stage) => {
      const name = pipelineDefinitionForStage(stage)?.name || stage.name;
      return name === "Devis validé";
    });

    if (!validatedStage) {
      setMessage("L'étape « Devis validé » est introuvable. Réinstalle le pipeline en 12 étapes.");
      return;
    }

    const { error: stageError } = await supabase
      .from("crm_contacts")
      .update({ stage_id: validatedStage.id, probability_percent: 100 })
      .eq("id", contact.id);

    if (stageError) {
      setMessage(stageError.message);
      return;
    }

    const project = await createProjectFromOpportunity(
      { ...contact, stage_id: validatedStage.id, probability_percent: 100 },
      { skipConfirm: true, signedDate }
    );

    if (!project) return;
    setMessage("Opportunité validée et projet créé avec la date de signature.");
    await loadData();
  }


  function projectDisplayName(project) {
    if (!project) return "Projet";
    return `${project.project_code ? `${project.project_code} - ` : ""}${project.name || project.client_name || "Projet sans nom"}`;
  }

  function manualProjectOptions(targetStatus) {
    return projects
      .filter((project) => {
        // Les menus sont une retranscription directe de l'onglet Projets.
        // La présence d'un contact CRM ou d'un lien existant ne doit jamais
        // masquer un projet dans la liste de sélection manuelle.
        if (targetStatus === "validated") {
          return ["validated", "planned"].includes(project.status);
        }

        if (targetStatus === "in_production") {
          return ["validated", "planned", "in_production"].includes(project.status);
        }

        return false;
      })
      .sort((a, b) => projectDisplayName(a).localeCompare(projectDisplayName(b), "fr"));
  }

  async function addExistingProjectToLifecycle(targetStatus) {
    if (!manualProjectId) {
      setMessage("Sélectionne un projet à ajouter.");
      return;
    }

    if (!can("can_edit") || !can("can_create")) {
      setMessage("Action non autorisée.");
      return;
    }

    const project = projects.find((item) => item.id === manualProjectId);
    if (!project) {
      setMessage("Projet introuvable.");
      return;
    }

    const validatedStage = stages.find((stage) => {
      const name = String(stage.name || "").toLowerCase();
      return name.includes("devis valid") || name.includes("sign") || name.includes("gagn");
    });

    if (!validatedStage) {
      setMessage("L'étape « Devis validé » est introuvable. Réinstalle le pipeline en 12 étapes.");
      return;
    }

    let contact = contacts.find((item) => item.id === project.crm_contact_id)
      || contacts.find((item) => item.project_id === project.id)
      || null;

    if (!contact) {
      const { data, error } = await supabase
        .from("crm_contacts")
        .insert({
          company_name: project.client_name || project.name || "Client à compléter",
          contact_name: null,
          contact_type: "client",
          status: "active",
          stage_id: validatedStage.id,
          probability_percent: 100,
          estimated_amount: Number(project.sale_amount || 0),
          expected_signature_month: project.signed_date ? String(project.signed_date).slice(0, 7) : null,
          project_id: project.id,
          dossier_code: project.dossier_code || null,
          notes: `Fiche CRM créée automatiquement depuis le projet ${project.name || "sans nom"}.`,
        })
        .select()
        .single();

      if (error) {
        setMessage(error.message);
        return;
      }
      contact = data;
    } else {
      const { error } = await supabase
        .from("crm_contacts")
        .update({
          project_id: project.id,
          status: "active",
          stage_id: validatedStage.id,
          probability_percent: 100,
          dossier_code: contact.dossier_code || project.dossier_code || null,
        })
        .eq("id", contact.id);

      if (error) {
        setMessage(error.message);
        return;
      }
    }

    const updatePayload = {
      crm_contact_id: contact.id,
      status: targetStatus === "in_production" ? "in_production" : "validated",
    };

    if (targetStatus === "in_production" && !project.production_start_date) {
      updatePayload.production_start_date = todayValue();
    }

    const { error: projectError } = await supabase
      .from("projects")
      .update(updatePayload)
      .eq("id", project.id);

    if (projectError) {
      setMessage(projectError.message);
      return;
    }

    await emitEvent({
      event_type: "PROJECT_MANUALLY_LINKED_TO_CRM",
      entity_type: "project",
      entity_id: project.id,
      title: `Projet ajouté manuellement au CRM : ${project.name}`,
      description: targetStatus === "in_production" ? "Ajouté dans En production" : "Ajouté dans Validé",
      payload: { project_id: project.id, crm_contact_id: contact.id, target_status: targetStatus },
      user,
    });

    setManualProjectColumn(null);
    setManualProjectId("");
    setMessage(`Le projet « ${project.name} » a été ajouté dans ${targetStatus === "in_production" ? "En production" : "Validé"}.`);
    await loadData();
  }

  async function launchOpportunityProduction(contact) {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const project = linkedProject(contact);
    if (!project) {
      setMessage("Aucun projet ERP n'est lié à cette opportunité.");
      return;
    }

    const ok = window.confirm(`Lancer la production du projet "${project.name}" ?`);
    if (!ok) return;

    const productionStartDate = window.prompt(
      "Date de lancement en production (AAAA-MM-JJ) ?",
      todayValue()
    );
    if (productionStartDate === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(productionStartDate)) {
      setMessage("La date de production doit être au format AAAA-MM-JJ.");
      return;
    }

    const { error } = await supabase
      .from("projects")
      .update({ status: "in_production", production_start_date: productionStartDate })
      .eq("id", project.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await emitEvent({
      event_type: "PROJECT_PRODUCTION_STARTED",
      entity_type: "project",
      entity_id: project.id,
      title: `Production lancée : ${project.name}`,
      description: contact.company_name,
      payload: { production_start_date: productionStartDate, crm_contact_id: contact.id },
      user,
    });

    setMessage("Le projet est passé en production.");
    await loadData();
  }

  async function completeOpportunityProduction(contact) {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const project = linkedProject(contact);
    if (!project) {
      setMessage("Aucun projet ERP n'est lié à cette opportunité.");
      return;
    }

    const ok = window.confirm(`Terminer la production du projet "${project.name}" ?`);
    if (!ok) return;

    const productionEndDate = window.prompt(
      "Date de fin de production (AAAA-MM-JJ) ?",
      todayValue()
    );
    if (productionEndDate === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(productionEndDate)) {
      setMessage("La date de fin de production doit être au format AAAA-MM-JJ.");
      return;
    }

    const { error } = await supabase
      .from("projects")
      .update({ status: "ready", production_end_date: productionEndDate })
      .eq("id", project.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await emitEvent({
      event_type: "PROJECT_PRODUCTION_COMPLETED",
      entity_type: "project",
      entity_id: project.id,
      title: `Production terminée : ${project.name}`,
      description: contact.company_name,
      payload: { production_end_date: productionEndDate, crm_contact_id: contact.id },
      user,
    });

    setMessage("La production est terminée. Le projet est maintenant prêt.");
    await loadData();
  }

  async function saveOpportunity(e) {
    e.preventDefault();

    if (!selectedContact || !opportunityForm) return;

    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const selectedProbability = opportunityForm.probability_percent ? Number(opportunityForm.probability_percent) : null;
    const firstStage = firstCommercialStage();
    const activatesFromPool = !isPipelineContact(selectedContact) && Number(selectedProbability || 0) > 0;

    const payload = {
      company_name: opportunityForm.company_name || "Sans nom",
      contact_name: opportunityForm.contact_name || null,
      email: opportunityForm.email || null,
      phone: opportunityForm.phone || null,
      city: opportunityForm.city || null,
      contact_type: opportunityForm.contact_type || "prospect",
      assigned_to: opportunityForm.assigned_to || null,
      stage_id: opportunityForm.stage_id || (activatesFromPool ? firstStage?.id : null),
      status: activatesFromPool ? "active" : selectedContact.status,
      estimated_amount: Number(opportunityForm.estimated_amount || 0),
      margin_percent: opportunityForm.margin_percent ? Number(opportunityForm.margin_percent) : null,
      probability_percent: selectedProbability,
      expected_signature_month: opportunityForm.expected_signature_month || null,
      product_family: opportunityForm.product_family || null,
      sector: opportunityForm.sector || null,
      lead_source: opportunityForm.lead_source || null,
      competitor: opportunityForm.competitor || null,
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

    if (activatesFromPool) {
      await supabase.from("crm_interactions").insert({
        contact_id: selectedContact.id,
        interaction_type: "note",
        subject: "Opportunité qualifiée par probabilité",
        notes: `Le prospect a été ajouté au pipeline avec une probabilité de ${selectedProbability} %.`,
        priority: "normal",
        created_by: user?.id || null,
      });
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
      competitor: contactForm.competitor || null,
      priority: contactForm.priority || "normal",
      project_id: contactForm.project_id || null,
      quote_id: contactForm.quote_id || null,
      notes: contactForm.notes || null,
      stage_id: null,
      status: "contact_only",
      created_by: user?.id || null,
    })
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    await emitEvent({
      event_type: "CRM_CONTACT_CREATED",
      entity_type: "crm",
      entity_id: createdContact?.id || null,
      title: `Nouveau prospect ajouté au vivier : ${contactForm.company_name}`,
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
      probability_percent: "",
      expected_signature_month: "",
      product_family: "",
      sector: "",
      lead_source: "",
      competitor: "",
      priority: "normal",
      project_id: "",
      quote_id: "",
      notes: "",
    });

    setMessage("Prospect ajouté au vivier CRM.");
    await loadData();
  }

  async function createOpportunityFromProspect(contact) {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const firstStage = [...stages].sort((a, b) => Number(a.stage_order || 0) - Number(b.stage_order || 0))[0];
    if (!firstStage) {
      setMessage("Aucune étape commerciale n'est configurée.");
      return;
    }

    const { error } = await supabase
      .from("crm_contacts")
      .update({
        status: "active",
        stage_id: firstStage.id,
        probability_percent: Number(firstStage.default_probability_percent ?? 5),
      })
      .eq("id", contact.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await supabase.from("crm_interactions").insert({
      contact_id: contact.id,
      interaction_type: "note",
      subject: "Prospect ciblé — opportunité créée",
      notes: "Le prospect a été sélectionné depuis le vivier et intégré au pipeline commercial.",
      priority: "normal",
      created_by: user?.id || null,
    });

    setMessage("Opportunité créée. Le prospect apparaît maintenant dans le pipeline.");
    await loadData();
  }

  async function initializeProspectPool() {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    if (contactsToMoveToPool.length === 0) {
      setMessage("Tous les contacts non liés à un projet sont déjà dans le vivier.");
      return;
    }

    const ok = window.confirm(
      `Replacer ${contactsToMoveToPool.length} contact(s) actuellement présents dans le pipeline dans le vivier ? Les fiches, coordonnées et historiques seront intégralement conservés. Les projets validés, en production ou terminés ne seront pas modifiés.`
    );
    if (!ok) return;

    const ids = contactsToMoveToPool.map((contact) => contact.id);
    const { error } = await supabase
      .from("crm_contacts")
      .update({ status: "contact_only", stage_id: null })
      .in("id", ids);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(`${ids.length} contact(s) retiré(s) du pipeline et replacé(s) dans le vivier.`);
    await loadData();
  }

  async function updateContactStage(contactId, stageId) {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const contact = contacts.find((item) => item.id === contactId);
    const targetStage = stages.find((stage) => stage.id === stageId);
    const definition = pipelineDefinitionForStage(targetStage);
    const targetName = definition?.name || targetStage?.name || "Sans étape";

    let interactionPayload = null;

    if (["RDV 1 réalisé", "RDV 2 réalisé"].includes(targetName)) {
      const notes = window.prompt(`Compte rendu du ${targetName} ?`, "");
      if (notes === null) return;
      interactionPayload = {
        contact_id: contactId,
        interaction_type: "rdv",
        subject: targetName,
        notes: notes || null,
        created_by: user?.id || null,
      };
    }

    if (targetName === "Devis envoyé") {
      const amount = window.prompt("Montant du devis HT ?", String(contact?.estimated_amount || ""));
      if (amount === null) return;
      const followUpDate = window.prompt("Date de relance ? Format AAAA-MM-JJ", "");
      if (followUpDate === null) return;
      interactionPayload = {
        contact_id: contactId,
        interaction_type: "devis",
        subject: "Devis envoyé",
        next_action: followUpDate ? "Relancer sur le devis" : null,
        next_action_date: followUpDate || null,
        created_by: user?.id || null,
      };
      contact.estimated_amount = Number(amount || 0);
    }

    const patch = { stage_id: stageId };
    if (definition?.probability !== undefined) patch.probability_percent = definition.probability;
    else if (targetStage?.default_probability_percent != null) patch.probability_percent = Number(targetStage.default_probability_percent);
    if (targetName === "Devis envoyé" && contact) patch.estimated_amount = Number(contact.estimated_amount || 0);

    const { error } = await supabase.from("crm_contacts").update(patch).eq("id", contactId);
    if (error) {
      setMessage(error.message);
      return;
    }

    if (interactionPayload) {
      const { error: interactionError } = await supabase.from("crm_interactions").insert(interactionPayload);
      if (interactionError) {
        setMessage(`Étape mise à jour, mais activité non créée : ${interactionError.message}`);
      }
    }

    await emitEvent({
      event_type: "CRM_STAGE_CHANGED",
      entity_type: "crm",
      entity_id: contactId,
      title: `${contact?.company_name || "Opportunité"} déplacé en ${targetName}`,
      description: contact?.contact_name || null,
      payload: {
        contact_id: contactId,
        stage_id: stageId,
        stage_name: targetName,
        estimated_amount: patch.estimated_amount ?? contact?.estimated_amount ?? 0,
        probability_percent: patch.probability_percent ?? contact?.probability_percent ?? null,
      },
      user,
    });

    setMessage(`Étape mise à jour : ${targetName}.`);
    await loadData();

    if (targetName === "Devis validé" && contact && !contact.project_id) {
      const createProject = window.confirm("Devis validé. Créer maintenant le projet ERP lié ?");
      if (createProject) await createProjectFromOpportunity({ ...contact, ...patch });
    }
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

    const interactionCreatesOpportunity = !isPipelineContact(selectedContact)
      && ["appel", "email", "rdv", "devis", "relance"].includes(String(interactionForm.interaction_type || "").toLowerCase());

    if (interactionCreatesOpportunity) {
      const firstStage = firstCommercialStage();
      if (firstStage) {
        const defaultProbability = Number(firstStage.default_probability_percent ?? 5);
        await supabase
          .from("crm_contacts")
          .update({
            status: "active",
            stage_id: firstStage.id,
            probability_percent: Number(selectedContact.probability_percent || defaultProbability),
          })
          .eq("id", selectedContact.id);
      }
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

    setMessage(interactionCreatesOpportunity
      ? "Interaction ajoutée. Le prospect entre maintenant dans le pipeline."
      : "Interaction ajoutée.");
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

  async function configureCommercialPipeline() {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(
      "Installer les 12 étapes exactes du processus commercial ? Les opportunités conservent leur étape actuelle par position. Les étapes supplémentaires seront archivées."
    );
    if (!ok) return;

    const orderedStages = [...stages].sort((a, b) => Number(a.stage_order || 0) - Number(b.stage_order || 0));
    const keptIds = [];

    for (let index = 0; index < COMMERCIAL_PIPELINE.length; index += 1) {
      const definition = COMMERCIAL_PIPELINE[index];
      const existing = orderedStages[index];

      if (existing) {
        const { error } = await supabase
          .from("crm_pipeline_stages")
          .update({
            name: definition.name,
            color: definition.color,
            stage_order: index + 1,
            active: true,
            default_probability_percent: definition.probability,
          })
          .eq("id", existing.id);

        if (error) {
          setMessage(error.message);
          return;
        }
        keptIds.push(existing.id);
      } else {
        const { data, error } = await supabase
          .from("crm_pipeline_stages")
          .insert({
            name: definition.name,
            color: definition.color,
            stage_order: index + 1,
            active: true,
            default_probability_percent: definition.probability,
          })
          .select()
          .single();

        if (error) {
          setMessage(error.message);
          return;
        }
        keptIds.push(data.id);
      }
    }

    const extraStages = orderedStages.slice(COMMERCIAL_PIPELINE.length);
    if (extraStages.length > 0) {
      const firstStageId = keptIds[0];
      for (const extra of extraStages) {
        await supabase.from("crm_contacts").update({ stage_id: firstStageId }).eq("stage_id", extra.id);
        await supabase.from("crm_pipeline_stages").update({ active: false }).eq("id", extra.id);
      }
    }

    setMessage("Pipeline commercial installé avec les 12 étapes demandées.");
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

  function contactCard(contact) {
    const nextAction = nextActionForContact(contact.id);
    const inactivity = daysSinceLastActivity(contact.id);
    const temperature = opportunityTemperature(contact);

    return (
      <article
        className="crm-card crm-pipeline-card"
        draggable
        onDragStart={() => setDraggedContactId(contact.id)}
        onDragEnd={() => setDraggedContactId(null)}
        onDoubleClick={() => setSelectedContact(contact)}
      >
        <div className="crm-card-title-row">
          <strong>{contact.company_name}</strong>
          <span className={`crm-temperature-badge ${temperature}`} title={`Score ${opportunityScore(contact)}/100`}>
            {temperatureMeta(temperature).icon} {temperatureMeta(temperature).label}
          </span>
        </div>

        <div className="crm-pipeline-card-amount">
          <strong>{formatMoney(contact.estimated_amount || 0)}</strong>
          <span>{Number(contact.probability_percent || contact.probability || 0)} %</span>
        </div>

        <div className="crm-pipeline-card-meta">
          <span>👤 {employeeName(contact.assigned_to)}</span>
          <span className={inactivity >= 21 ? "late" : ""}>☎ {inactivity === 999 ? "aucune activité" : `il y a ${inactivity} j`}</span>
        </div>

        <div className={`crm-pipeline-next ${nextAction?.next_action_date && nextAction.next_action_date < todayValue() ? "late" : ""}`}>
          <span>📅</span>
          <div>
            <strong>{nextAction?.next_action || nextAction?.subject || "Relance à définir"}</strong>
            <small>{nextAction?.next_action_date || contact.expected_signature_month || "Aucune date"}</small>
          </div>
        </div>

        <div className="crm-card-actions crm-pipeline-card-actions">
          <button className="btn small" onClick={() => openPhone(contact)}>Appeler</button>
          <button className="btn small" onClick={() => openEmail(contact)}>Email</button>
          <button className="btn small primary" onClick={() => setSelectedContact(contact)}>Ouvrir</button>
        </div>
      </article>
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

          <button className={viewMode === "pool" ? "btn primary" : "btn small"} onClick={() => setViewMode("pool")}>
            Vivier prospects
          </button>
          <button className={viewMode === "temperature" ? "btn primary" : "btn small"} onClick={() => setViewMode("temperature")}>
            Chaud / Tiède / Froid
          </button>
          <button className={viewMode === "board" ? "btn primary" : "btn small"} onClick={() => setViewMode("board")}>
            Pipeline
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

      {viewMode !== "pool" && (<>
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
              setTemperatureFilter("all");
            }}
          >
            Réinitialiser
          </button>
        </div>

        <div className="crm-temperature-filters" aria-label="Filtrer par température">
          {[
            ["all", "Toutes", filteredOpenOpportunities.length],
            ["hot", "🔥 Chaudes", temperatureGroups.hot.length],
            ["warm", "🟠 Tièdes", temperatureGroups.warm.length],
            ["cold", "🔵 Froides", temperatureGroups.cold.length],
          ].map(([value, label, count]) => (
            <button
              type="button"
              key={value}
              className={`crm-temperature-filter ${value} ${temperatureFilter === value ? "active" : ""}`}
              onClick={() => setTemperatureFilter(value)}
            >
              <span>{label}</span>
              <strong>{count}</strong>
            </button>
          ))}
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

      <div className="crm-focus-grid crm-focus-grid-single">
        <div className="card">
          <h3>🔥 Opportunités chaudes</h3>
          {hotOpportunities.length === 0 ? (
            <p>Aucune opportunité chaude dans ce filtre.</p>
          ) : (
            hotOpportunities.map((contact) => (
              <div className="crm-focus-row crm-focus-row-with-actions" key={contact.id}>
                <button className="crm-focus-main" onClick={() => setSelectedContact(contact)}>
                  <div>
                    <strong>{contact.company_name}</strong>
                    <small>{stageName(contact.stage_id)} · {employeeName(contact.assigned_to)}</small>
                  </div>
                  <span>{formatMoney(weightedPipe(contact))}</span>
                </button>
                <div className="crm-focus-actions">
                  <button className="btn small primary" onClick={() => validateOpportunity(contact)}>Valider</button>
                  <button className="btn small danger-outline" onClick={() => exitOpportunity(contact)}>Classer perdu</button>
                  <button className="btn small danger-soft" onClick={() => deleteOpportunityDirectly(contact)}>Retirer du pipeline</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      </>)}

      {viewMode === "pool" && (
        <div className="card crm-pool-card">
          <div className="page-head">
            <div>
              <p className="eyebrow">Base de prospection</p>
              <h3>Vivier de prospects</h3>
              <p>Tous les prospects sont conservés ici. Seuls ceux ciblés volontairement sont ajoutés au pipeline commercial.</p>
            </div>
            {contactsToMoveToPool.length > 0 && (
              <button className="btn warning" onClick={initializeProspectPool}>
                Replacer le pipeline actuel dans le vivier ({contactsToMoveToPool.length})
              </button>
            )}
          </div>

          <div className="crm-pool-toolbar">
            <input
              placeholder="Rechercher dans le vivier : société, ville, contact..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <strong>{prospectPool.length} prospect(s)</strong>
          </div>

          <div className="crm-pool-list">
            {prospectPool.length === 0 ? (
              <div className="crm-temperature-empty">Aucun prospect dans le vivier.</div>
            ) : prospectPool.map((contact) => (
              <article className="crm-pool-row" key={contact.id}>
                <button className="crm-pool-main" onClick={() => setSelectedContact(contact)}>
                  <div>
                    <strong>{contact.company_name}</strong>
                    <small>{contact.contact_name || "Contact non renseigné"}{contact.city ? ` · ${contact.city}` : ""}</small>
                  </div>
                  <span>{contact.contact_type || "prospect"}</span>
                </button>
                <div className="crm-pool-actions">
                  <button className="btn small" onClick={() => setSelectedContact(contact)}>Ouvrir</button>
                  <button className="btn small primary" onClick={() => createOpportunityFromProspect(contact)}>
                    Cibler / créer une opportunité
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3>Ajouter un prospect au vivier</h3>

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
            <label>Concurrent</label>
            <input value={contactForm.competitor} onChange={(e) => setContactForm({ ...contactForm, competitor: e.target.value })} />
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

      {viewMode === "temperature" && (
        <div className="crm-temperature-board">
          {["hot", "warm", "cold", "validated", "in_production", "production_completed", "lost"].map((key) => {
            const meta = key === "validated"
              ? { label: "Validé", icon: "✅", hint: "Devis signé, en attente de production" }
              : key === "in_production"
                ? { label: "En production", icon: "🏭", hint: "Fabrication actuellement lancée" }
                : key === "production_completed"
                  ? { label: "Production terminée", icon: "✅", hint: "Fabrication achevée, projet prêt" }
                  : key === "lost"
                    ? { label: "Perdus", icon: "❌", hint: "Opportunités sorties du pipeline actif" }
                    : temperatureMeta(key);
            const items = temperatureGroups[key];

            return (
              <section className={`crm-temperature-column ${key}`} key={key}>
                <header>
                  <div>
                    <span className="crm-temperature-icon">{meta.icon}</span>
                    <div>
                      <h3>{["validated", "in_production", "production_completed", "lost"].includes(key) ? meta.label : `Pipe ${meta.label}`}</h3>
                      <p>{meta.hint}</p>
                    </div>
                  </div>
                  <div className="crm-temperature-column-kpis">
                    <strong>{items.length}</strong>
                    <span>{formatMoney(temperatureAmount(key))}</span>
                  </div>
                </header>

                {["validated", "in_production"].includes(key) && (
                  <div className="crm-manual-project-link">
                    {manualProjectColumn === key ? (
                      <>
                        <select value={manualProjectId} onChange={(e) => setManualProjectId(e.target.value)}>
                          <option value="">Sélectionner un projet existant</option>
                          {manualProjectOptions(key).map((project) => (
                            <option key={project.id} value={project.id}>{projectDisplayName(project)}</option>
                          ))}
                        </select>
                        <div>
                          <button className="btn small primary" onClick={() => addExistingProjectToLifecycle(key)}>Ajouter</button>
                          <button className="btn small" onClick={() => { setManualProjectColumn(null); setManualProjectId(""); }}>Annuler</button>
                        </div>
                      </>
                    ) : (
                      <button className="btn small crm-add-existing-project" onClick={() => { setManualProjectColumn(key); setManualProjectId(""); }}>+ Ajouter un projet existant</button>
                    )}
                  </div>
                )}

                <div className="crm-temperature-list">
                  {items.length === 0 ? (
                    <div className="crm-temperature-empty">Aucune opportunité dans cette catégorie.</div>
                  ) : (
                    items.map((contact) => {
                      const nextAction = nextActionForContact(contact.id);
                      const inactivity = daysSinceLastActivity(contact.id);
                      return (
                        <article className="crm-temperature-card" key={contact.id} onClick={() => setSelectedContact(contact)}>
                          <div className="crm-temperature-card-head">
                            <div>
                              <strong>{contact.company_name}</strong>
                              <small>{stageName(contact.stage_id)} · {employeeName(contact.assigned_to)}</small>
                            </div>
                            <span className={`crm-score-badge ${key}`}>
                              {key === "validated" ? "✓" : key === "in_production" ? "🏭" : key === "production_completed" ? "✅" : key === "lost" ? "✕" : opportunityScore(contact)}
                            </span>
                          </div>

                          <div className="crm-temperature-money">
                            <strong>{formatMoney(contact.estimated_amount || 0)}</strong>
                            <span>
                              {key === "validated"
                                ? `Signé le ${linkedProject(contact)?.signed_date || "date non définie"}`
                                : key === "in_production"
                                  ? `Démarré le ${linkedProject(contact)?.production_start_date || "date non définie"}`
                                  : `${Number(contact.probability_percent || contact.probability || 0)} % · pondéré ${formatMoney(weightedPipe(contact))}`}
                            </span>
                          </div>

                          <div className="crm-temperature-meta">
                            <span>📅 {contact.expected_signature_month || "Signature non définie"}</span>
                            <span className={inactivity >= 21 ? "late" : ""}>☎ {inactivity === 999 ? "Aucune activité" : `il y a ${inactivity} j`}</span>
                          </div>

                          <div className={`crm-next-action ${nextAction && nextAction.next_action_date < todayValue() ? "late" : ""}`}>
                            <span>{nextAction ? "Prochaine action" : "Action à définir"}</span>
                            <strong>{nextAction?.next_action || nextAction?.subject || "Planifier une relance"}</strong>
                            {nextAction?.next_action_date && <small>{nextAction.next_action_date}</small>}
                          </div>

                          <div className="crm-temperature-actions">
                            {key === "validated" ? (
                              <button className="btn small primary" onClick={(e) => { e.stopPropagation(); launchOpportunityProduction(contact); }}>Lancer la production</button>
                            ) : key === "in_production" ? (
                              <button className="btn small primary" onClick={(e) => { e.stopPropagation(); completeOpportunityProduction(contact); }}>Terminer la production</button>
                            ) : key === "production_completed" ? (
                              <span className="crm-production-state completed">Projet prêt</span>
                            ) : key === "lost" ? (
                              <button className="btn small danger-soft" onClick={(e) => { e.stopPropagation(); deleteOpportunityDirectly(contact); }}>Retirer du pipeline</button>
                            ) : (
                              <>
                                <button className="btn small" onClick={(e) => { e.stopPropagation(); openPhone(contact); }}>Appeler</button>
                                <button className="btn small" onClick={(e) => { e.stopPropagation(); openEmail(contact); }}>Email</button>
                                <button className="btn small primary" onClick={(e) => { e.stopPropagation(); validateOpportunity(contact); }}>Valider</button>
                                <button className="btn small danger-outline" onClick={(e) => { e.stopPropagation(); exitOpportunity(contact); }}>Classer perdu</button>
                                <button className="btn small danger-soft" onClick={(e) => { e.stopPropagation(); deleteOpportunityDirectly(contact); }}>Retirer du pipeline</button>
                              </>
                            )}
                            <button className="btn small" onClick={(e) => { e.stopPropagation(); setSelectedContact(contact); }}>Ouvrir</button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {viewMode === "board" && (
        <>
          {!pipelineIsConfigured() && (
            <div className="crm-pipeline-setup-banner">
              <div>
                <strong>Le pipeline ne correspond pas encore au processus commercial défini.</strong>
                <span>Installe les 12 étapes : du suspect ciblé jusqu'au devis validé.</span>
              </div>
              <button className="btn primary" onClick={configureCommercialPipeline}>Installer les 12 étapes</button>
            </div>
          )}
          <div className="crm-board-summary">
            <span>{pipelineContacts.length} opportunité(s) affichée(s)</span>
            <strong>{formatMoney(crmPipelineWeighted)} pondéré</strong>
          </div>

          <div className="crm-board">
            {stages.map((stage) => {
              const stageContacts = pipelineContacts.filter((contact) => contact.stage_id === stage.id);
              const metrics = stageMetrics(stageContacts);

              return (
                <div
                  className="crm-column crm-smart-column"
                  key={stage.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => draggedContactId && updateContactStage(draggedContactId, stage.id)}
                >
                  <div className="crm-column-head crm-smart-column-head crm-pipeline-column-head" style={{ borderTopColor: stage.color || "#2563eb" }}>
                    <div className="crm-pipeline-stage-title">
                      <span className="crm-pipeline-stage-icon">{pipelineDefinitionForStage(stage)?.icon || "•"}</span>
                      <div>
                        <strong>{stage.name}</strong>
                        <small>{stageContacts.length} dossier(s)</small>
                      </div>
                    </div>
                    <div className="crm-pipeline-stage-money">
                      <strong>{formatMoney(metrics.raw)}</strong>
                      <small>{formatMoney(metrics.weighted)} pondéré</small>
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
                const noStageContacts = pipelineContacts.filter((contact) => !contact.stage_id);
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
          <div className="crm-settings-pipeline-head">
            <div>
              <h3>Étapes du pipeline</h3>
              <p>Processus commercial officiel en 12 étapes.</p>
            </div>
            <button className="btn primary" onClick={configureCommercialPipeline}>Installer / réinitialiser les 12 étapes</button>
          </div>

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

                  <div>
                    <label>Concurrent</label>
                    <input value={opportunityForm.competitor} onChange={(e) => updateOpportunityForm("competitor", e.target.value)} />
                  </div>
                </div>
              </section>

              <section>
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
                    <div className="crm-timeline-item" key={interaction.id}>
                      <span>{interaction.interaction_type}</span>
                      <strong>{interaction.subject || interaction.next_action || "-"}</strong>
                      <small>
                        {interaction.next_action ? `Action : ${interaction.next_action}` : ""}
                        {interaction.next_action_date ? ` · ${interaction.next_action_date}` : ""}
                        {interaction.meeting_time ? ` · ${interaction.meeting_time}` : ""}
                        {interaction.meeting_location ? ` · ${interaction.meeting_location}` : ""}
                        {interaction.done ? " · traité" : ""}
                      </small>
                      {interaction.call_duration_seconds ? (
                        <small>Durée appel : {Math.floor(interaction.call_duration_seconds / 60)} min {interaction.call_duration_seconds % 60} s · statut : {interaction.call_status || "-"}</small>
                      ) : null}
                      {interaction.notes && <p>{interaction.notes}</p>}
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