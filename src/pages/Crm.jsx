import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";
import { canAccess } from "../services/permissions.js";

const INTERACTION_TYPES = ["note", "appel", "email", "rdv", "devis", "relance"];

export default function CRM({ user, permissions }) {
  const [stages, setStages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [draggedContactId, setDraggedContactId] = useState(null);
  const [message, setMessage] = useState("");
  const [viewMode, setViewMode] = useState("board");
  const [search, setSearch] = useState("");

  const [contactForm, setContactForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    city: "",
    contact_type: "prospect",
    assigned_to: "",
    notes: "",
  });

  const [interactionForm, setInteractionForm] = useState({
    interaction_type: "note",
    subject: "",
    notes: "",
    next_action: "",
    next_action_date: "",
  });

  const [stageForm, setStageForm] = useState({
    name: "",
    color: "#2563eb",
  });

  useEffect(() => {
    loadData();
  }, []);

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

  function contactInteractions(contactId) {
    return interactions.filter((interaction) => interaction.contact_id === contactId);
  }

  function contactProjects(contactId) {
    return projects.filter((project) => project.crm_contact_id === contactId);
  }

  function contactQuotes(contactId) {
    return quotes.filter((quote) => quote.crm_contact_id === contactId);
  }

  const filteredContacts = useMemo(() => {
    const query = search.toLowerCase();

    return contacts.filter((contact) => {
      return (
        (contact.company_name || "").toLowerCase().includes(query) ||
        (contact.contact_name || "").toLowerCase().includes(query) ||
        (contact.city || "").toLowerCase().includes(query) ||
        (contact.email || "").toLowerCase().includes(query)
      );
    });
  }, [contacts, search]);

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

    const { error } = await supabase.from("crm_contacts").insert({
      company_name: contactForm.company_name,
      contact_name: contactForm.contact_name || null,
      email: contactForm.email || null,
      phone: contactForm.phone || null,
      city: contactForm.city || null,
      contact_type: contactForm.contact_type || "prospect",
      assigned_to: contactForm.assigned_to || null,
      notes: contactForm.notes || null,
      stage_id: firstStage?.id || null,
      status: "active",
      created_by: user?.id || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setContactForm({
      company_name: "",
      contact_name: "",
      email: "",
      phone: "",
      city: "",
      contact_type: "prospect",
      assigned_to: "",
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

    const { error } = await supabase
      .from("crm_contacts")
      .update({ stage_id: stageId })
      .eq("id", contactId);

    if (error) {
      setMessage(error.message);
      return;
    }

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

    const { error } = await supabase
      .from("crm_contacts")
      .update({
        company_name: company || "Sans nom",
        contact_name: name || null,
        email: email || null,
        phone: phone || null,
        city: city || null,
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

    const { error } = await supabase.from("crm_interactions").insert({
      contact_id: selectedContact.id,
      interaction_type: interactionForm.interaction_type || "note",
      subject: interactionForm.subject || null,
      notes: interactionForm.notes || null,
      next_action: interactionForm.next_action || null,
      next_action_date: interactionForm.next_action_date || null,
      created_by: user?.id || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

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

  function contactCard(contact) {
    return (
      <div
        className="crm-card"
        draggable
        onDragStart={() => setDraggedContactId(contact.id)}
        onDragEnd={() => setDraggedContactId(null)}
        onClick={() => setSelectedContact(contact)}
      >
        <strong>{contact.company_name}</strong>
        <small>{contact.contact_name || "-"} · {contact.city || "-"}</small>
        <small>{employeeName(contact.assigned_to)}</small>

        <div className="crm-card-actions">
          <button className="btn small" onClick={(e) => { e.stopPropagation(); editContact(contact); }}>
            Modifier
          </button>
          <button className="btn small danger-soft" onClick={(e) => { e.stopPropagation(); deleteContact(contact); }}>
            Supprimer
          </button>
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

      <div className="crm-alerts-grid">
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
          <h3>À faire aujourd'hui</h3>
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

          <button className="btn primary">Ajouter</button>
        </form>
      </div>

      {viewMode === "board" && (
        <>
          <div className="card">
            <input
              placeholder="Rechercher un client, une ville, un contact..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="crm-board">
            {stages.map((stage) => {
              const stageContacts = filteredContacts.filter((contact) => contact.stage_id === stage.id);

              return (
                <div
                  className="crm-column"
                  key={stage.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => draggedContactId && updateContactStage(draggedContactId, stage.id)}
                >
                  <div className="crm-column-head" style={{ borderTopColor: stage.color || "#2563eb" }}>
                    <strong>{stage.name}</strong>
                    <span>{stageContacts.length}</span>
                  </div>

                  <div className="crm-column-body">
                    {stageContacts.map(contactCard)}
                  </div>
                </div>
              );
            })}

            <div
              className="crm-column"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => draggedContactId && updateContactStage(draggedContactId, null)}
            >
              <div className="crm-column-head" style={{ borderTopColor: "#64748b" }}>
                <strong>Sans étape</strong>
                <span>{filteredContacts.filter((contact) => !contact.stage_id).length}</span>
              </div>
              <div className="crm-column-body">
                {filteredContacts.filter((contact) => !contact.stage_id).map(contactCard)}
              </div>
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

      {selectedContact && (
        <div className="card">
          <div className="page-head">
            <div>
              <h3>{selectedContact.company_name}</h3>
              <p>{selectedContact.contact_name || "-"} · {selectedContact.email || "-"} · {selectedContact.phone || "-"}</p>
            </div>
            <button className="btn small" onClick={() => setSelectedContact(null)}>Fermer</button>
          </div>

          <div className="crm-linked-grid">
            <div>
              <strong>Projets liés</strong>
              {contactProjects(selectedContact.id).length === 0 ? (
                <p>Aucun projet lié.</p>
              ) : (
                contactProjects(selectedContact.id).map((project) => (
                  <small key={project.id}>{project.project_code || ""} {project.name}</small>
                ))
              )}
            </div>

            <div>
              <strong>Chiffrages liés</strong>
              {contactQuotes(selectedContact.id).length === 0 ? (
                <p>Aucun chiffrage lié.</p>
              ) : (
                contactQuotes(selectedContact.id).map((quote) => (
                  <small key={quote.id}>{quote.project_name}</small>
                ))
              )}
            </div>
          </div>

          <form className="crm-interaction-form" onSubmit={createInteraction}>
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
              <label>Date relance</label>
              <input type="date" value={interactionForm.next_action_date} onChange={(e) => setInteractionForm({ ...interactionForm, next_action_date: e.target.value })} />
            </div>

            <button className="btn primary">Ajouter interaction</button>
          </form>

          <div className="crm-history">
            {contactInteractions(selectedContact.id).map((interaction) => (
              <div key={interaction.id}>
                <strong>{interaction.interaction_type} · {interaction.subject || "-"}</strong>
                <small>
                  {interaction.next_action ? `Action : ${interaction.next_action}` : ""}
                  {interaction.next_action_date ? ` · ${interaction.next_action_date}` : ""}
                  {interaction.done ? " · traité" : ""}
                </small>
                {interaction.notes && <p>{interaction.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
