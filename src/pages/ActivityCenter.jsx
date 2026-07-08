import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";
import { canAccess } from "../services/permissions.js";
import { emitEvent } from "../services/events.js";

const FILTERS = [
  { value: "action", label: "À traiter" },
  { value: "today", label: "Aujourd'hui" },
  { value: "crm", label: "CRM utile" },
  { value: "project", label: "Projets" },
  { value: "planning", label: "Planning" },
  { value: "all", label: "Historique" },
];

const HIDDEN_DEFAULT_EVENTS = [
  "CRM_CONTACT_CREATED",
];

function categoryForEvent(event) {
  const type = String(event.event_type || "").toLowerCase();
  const entity = String(event.entity_type || "").toLowerCase();

  if (type.includes("crm") || entity.includes("crm")) return "crm";
  if (type.includes("project") || entity.includes("project")) return "project";
  if (type.includes("planning") || entity.includes("planning")) return "planning";
  if (type.includes("stock") || entity.includes("stock")) return "stock";
  if (type.includes("workflow") || entity.includes("workflow")) return "workflow";
  if (type.includes("clock") || type.includes("pointage") || entity.includes("pointage")) return "pointage";

  return "other";
}

function iconForEvent(event) {
  const type = String(event.event_type || "").toLowerCase();
  const category = categoryForEvent(event);

  if (type.includes("request")) return "📝";
  if (type.includes("updated")) return "✏️";
  if (type.includes("completed") || type.includes("done")) return "✅";
  if (type.includes("created")) return "➕";
  if (category === "crm") return "🤝";
  if (category === "project") return "📁";
  if (category === "planning") return "📅";
  if (category === "stock") return "📦";
  if (category === "workflow") return "🔄";

  return "⚡";
}

function importanceForEvent(event) {
  const type = String(event.event_type || "").toUpperCase();
  const payload = event.payload || {};

  if (type.includes("STOCK_LOW") || type.includes("OVERDUE") || payload.priority === "urgent") return "urgent";
  if (type.includes("REQUEST") || type.includes("TASK_CREATED") || type.includes("PLANNING_TASK_CREATED")) return "action";
  if (type.includes("CREATED") || type.includes("UPDATED")) return "info";

  return "history";
}

export default function ActivityCenter({ user, permissions }) {
  const [events, setEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("action");
  const [search, setSearch] = useState("");
  const [showNoise, setShowNoise] = useState(false);
  const [manualForm, setManualForm] = useState({
    title: "",
    description: "",
    entity_type: "manual",
    importance: "action",
  });

  useEffect(() => {
    loadActivityCenter();

    const timer = setInterval(loadActivityCenter, 30000);
    return () => clearInterval(timer);
  }, []);

  function can(action) {
    return canAccess(user, permissions, "activity", action);
  }

  async function loadActivityCenter() {
    const [eventsResponse, employeesResponse] = await Promise.all([
      supabase
        .from("erp_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("employees")
        .select("id, name")
        .eq("active", true),
    ]);

    const error = eventsResponse.error || employeesResponse.error;

    if (error) {
      setMessage(error.message);
      return;
    }

    setEvents(eventsResponse.data || []);
    setEmployees(employeesResponse.data || []);
  }

  function employeeName(id) {
    return employees.find((employee) => employee.id === id)?.name || "Système";
  }

  function formatDate(value) {
    if (!value) return "-";

    return new Date(value).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const cleanEvents = useMemo(() => {
    return events.filter((event) => {
      if (showNoise) return true;
      return !HIDDEN_DEFAULT_EVENTS.includes(event.event_type);
    });
  }, [events, showNoise]);

  const actionEvents = cleanEvents.filter((event) =>
    ["urgent", "action"].includes(importanceForEvent(event))
  );

  const todayEvents = cleanEvents.filter((event) =>
    String(event.created_at || "").slice(0, 10) === new Date().toISOString().slice(0, 10)
  );

  const projectEvents = cleanEvents.filter((event) => categoryForEvent(event) === "project");
  const planningEvents = cleanEvents.filter((event) => categoryForEvent(event) === "planning");
  const crmUsefulEvents = cleanEvents.filter((event) =>
    categoryForEvent(event) === "crm" && event.event_type !== "CRM_CONTACT_CREATED"
  );

  const urgentCount = cleanEvents.filter((event) => importanceForEvent(event) === "urgent").length;
  const actionCount = actionEvents.length;
  const todayCount = todayEvents.length;

  const filteredEvents = useMemo(() => {
    const query = search.toLowerCase().trim();

    return cleanEvents.filter((event) => {
      const eventCategory = categoryForEvent(event);
      const eventImportance = importanceForEvent(event);

      let matchesFilter = true;

      if (filter === "action") matchesFilter = ["urgent", "action"].includes(eventImportance);
      if (filter === "today") matchesFilter = String(event.created_at || "").slice(0, 10) === new Date().toISOString().slice(0, 10);
      if (filter === "crm") matchesFilter = eventCategory === "crm" && event.event_type !== "CRM_CONTACT_CREATED";
      if (filter === "project") matchesFilter = eventCategory === "project";
      if (filter === "planning") matchesFilter = eventCategory === "planning";
      if (filter === "all") matchesFilter = true;

      const payloadText = event.payload ? JSON.stringify(event.payload).toLowerCase() : "";
      const matchesSearch =
        !query ||
        [
          event.event_type,
          event.entity_type,
          event.title,
          event.description,
          payloadText,
          employeeName(event.created_by),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      return matchesFilter && matchesSearch;
    });
  }, [cleanEvents, employees, filter, search]);

  async function createManualEvent(e) {
    e.preventDefault();

    if (!can("can_create")) {
      setMessage("Action non autorisée.");
      return;
    }

    if (!manualForm.title) {
      setMessage("Titre obligatoire.");
      return;
    }

    const { error } = await emitEvent({
      event_type: manualForm.importance === "action" ? "MANUAL_ACTION" : "MANUAL_ACTIVITY",
      entity_type: manualForm.entity_type || "manual",
      title: manualForm.title,
      description: manualForm.description || null,
      payload: { importance: manualForm.importance },
      user,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setManualForm({
      title: "",
      description: "",
      entity_type: "manual",
      importance: "action",
    });

    setMessage("Activité ajoutée.");
    await loadActivityCenter();
  }

  async function archiveEvent(event) {
    if (!can("can_archive") && !can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const { error } = await supabase
      .from("erp_events")
      .update({
        event_type: `${event.event_type}_ARCHIVED`,
        payload: {
          ...(event.payload || {}),
          archived: true,
          archived_at: new Date().toISOString(),
          archived_by: user?.id || null,
        },
      })
      .eq("id", event.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setEvents((current) => current.filter((item) => item.id !== event.id));
    setMessage("Activité masquée.");
  }

  function eventClass(event) {
    return `activity-item ${importanceForEvent(event)}`;
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Centre de commandement</p>
          <h2>Activity Center</h2>
          <p>Actions utiles et événements réellement exploitables. Les simples imports CRM sont masqués par défaut.</p>
        </div>

        <button className="btn secondary" onClick={loadActivityCenter}>
          Actualiser
        </button>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="activity-command-grid">
        <div className="activity-command-card urgent">
          <span>Urgent</span>
          <strong>{urgentCount}</strong>
          <p>À traiter immédiatement.</p>
        </div>

        <div className="activity-command-card action">
          <span>À traiter</span>
          <strong>{actionCount}</strong>
          <p>Demandes, tâches, planning.</p>
        </div>

        <div className="activity-command-card today">
          <span>Aujourd'hui</span>
          <strong>{todayCount}</strong>
          <p>Activité du jour.</p>
        </div>

        <div className="activity-command-card">
          <span>Projets</span>
          <strong>{projectEvents.length}</strong>
          <p>Créations et demandes.</p>
        </div>
      </div>

      {can("can_create") && (
        <div className="card">
          <h3>Ajouter une action manuelle</h3>

          <form className="activity-manual-form" onSubmit={createManualEvent}>
            <div>
              <label>Titre</label>
              <input
                value={manualForm.title}
                onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                placeholder="Ex : Relancer mairie, valider BAT..."
              />
            </div>

            <div>
              <label>Type</label>
              <select
                value={manualForm.entity_type}
                onChange={(e) => setManualForm({ ...manualForm, entity_type: e.target.value })}
              >
                <option value="manual">Manuel</option>
                <option value="crm">CRM</option>
                <option value="project">Projet</option>
                <option value="planning">Planning</option>
                <option value="stock">Stock</option>
                <option value="workflow">Workflow</option>
              </select>
            </div>

            <div>
              <label>Importance</label>
              <select
                value={manualForm.importance}
                onChange={(e) => setManualForm({ ...manualForm, importance: e.target.value })}
              >
                <option value="action">À traiter</option>
                <option value="info">Information</option>
              </select>
            </div>

            <div>
              <label>Description</label>
              <input
                value={manualForm.description}
                onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
              />
            </div>

            <button className="btn primary">Ajouter</button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="page-head">
          <div>
            <h3>Flux utile</h3>
            <p>Par défaut, seuls les événements utiles sont affichés.</p>
          </div>

          <input
            className="activity-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher : Duclair, devis, planning..."
          />
        </div>

        <div className="activity-toolbar">
          <div className="planning-filters">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                className={filter === item.value ? "active" : ""}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="activity-noise-toggle">
            <input
              type="checkbox"
              checked={showNoise}
              onChange={(e) => setShowNoise(e.target.checked)}
            />
            Afficher les événements de masse
          </label>
        </div>

        <div className="activity-timeline">
          {filteredEvents.length === 0 ? (
            <p>Aucune activité utile dans ce filtre.</p>
          ) : (
            filteredEvents.map((event) => (
              <article className={eventClass(event)} key={event.id}>
                <div className="activity-icon">{iconForEvent(event)}</div>

                <div>
                  <div className="activity-item-head">
                    <strong>{event.title}</strong>
                    <span>{formatDate(event.created_at)}</span>
                  </div>

                  <small>
                    {employeeName(event.created_by)} · {event.event_type}
                    {event.entity_type ? ` · ${event.entity_type}` : ""}
                  </small>

                  {event.description && <p>{event.description}</p>}

                  {event.payload && Object.keys(event.payload || {}).length > 0 && (
                    <details>
                      <summary>Détails</summary>
                      <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                    </details>
                  )}
                </div>

                <div className="activity-actions">
                  <button className="btn small" onClick={() => archiveEvent(event)}>
                    Masquer
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
