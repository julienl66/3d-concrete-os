import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";
import { canAccess } from "../services/permissions.js";
import { emitEvent } from "../services/events.js";

const FILTERS = [
  { value: "all", label: "Toutes" },
  { value: "crm", label: "CRM" },
  { value: "project", label: "Projets" },
  { value: "planning", label: "Planning" },
  { value: "stock", label: "Stock" },
  { value: "workflow", label: "Workflow" },
  { value: "pointage", label: "Pointage" },
];

function iconForEvent(event) {
  const type = String(event.event_type || "").toLowerCase();
  const entity = String(event.entity_type || "").toLowerCase();

  if (type.includes("crm") || entity.includes("crm")) return "🤝";
  if (type.includes("project") || entity.includes("project")) return "📁";
  if (type.includes("planning") || entity.includes("planning")) return "📅";
  if (type.includes("task")) return "✅";
  if (type.includes("stock")) return "📦";
  if (type.includes("clock") || type.includes("pointage")) return "⏱️";
  if (type.includes("document")) return "📄";
  if (type.includes("quote") || type.includes("devis")) return "🧾";

  return "⚡";
}

function categoryForEvent(event) {
  const type = String(event.event_type || "").toLowerCase();
  const entity = String(event.entity_type || "").toLowerCase();

  if (type.includes("crm") || entity.includes("crm")) return "crm";
  if (type.includes("project") || entity.includes("project")) return "project";
  if (type.includes("planning") || entity.includes("planning")) return "planning";
  if (type.includes("stock") || entity.includes("stock")) return "stock";
  if (type.includes("workflow") || entity.includes("workflow")) return "workflow";
  if (type.includes("clock") || type.includes("pointage") || entity.includes("pointage")) return "pointage";

  return "all";
}

export default function ActivityCenter({ user, permissions }) {
  const [events, setEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [manualForm, setManualForm] = useState({
    title: "",
    description: "",
    entity_type: "manual",
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
        .limit(250),
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

  const filteredEvents = useMemo(() => {
    const query = search.toLowerCase().trim();

    return events.filter((event) => {
      const eventCategory = categoryForEvent(event);

      const matchesFilter = filter === "all" || eventCategory === filter;

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
  }, [events, employees, filter, search]);

  const todayCount = events.filter((event) => {
    if (!event.created_at) return false;
    return String(event.created_at).slice(0, 10) === new Date().toISOString().slice(0, 10);
  }).length;

  const crmCount = events.filter((event) => categoryForEvent(event) === "crm").length;
  const planningCount = events.filter((event) => categoryForEvent(event) === "planning").length;
  const projectCount = events.filter((event) => categoryForEvent(event) === "project").length;

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
      event_type: "MANUAL_ACTIVITY",
      entity_type: manualForm.entity_type || "manual",
      title: manualForm.title,
      description: manualForm.description || null,
      payload: {},
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
    });

    setMessage("Activité ajoutée.");
    await loadActivityCenter();
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Event Engine</p>
          <h2>Activity Center</h2>
          <p>Flux central des événements ERP : CRM, projets, planning, tâches, stock et workflows.</p>
        </div>

        <button className="btn secondary" onClick={loadActivityCenter}>
          Actualiser
        </button>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="activity-hero">
        <div>
          <span>Activités aujourd'hui</span>
          <strong>{todayCount}</strong>
          <p>Événements automatiquement enregistrés par l'ERP.</p>
        </div>

        <div className="activity-hero-stats">
          <div><span>CRM</span><strong>{crmCount}</strong></div>
          <div><span>Projets</span><strong>{projectCount}</strong></div>
          <div><span>Planning</span><strong>{planningCount}</strong></div>
        </div>
      </div>

      {can("can_create") && (
        <div className="card">
          <h3>Ajouter une activité manuelle</h3>

          <form className="activity-manual-form" onSubmit={createManualEvent}>
            <div>
              <label>Titre</label>
              <input
                value={manualForm.title}
                onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                placeholder="Ex : Point client, décision interne..."
              />
            </div>

            <div>
              <label>Catégorie</label>
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
            <h3>Flux d'activité</h3>
            <p>Recherche globale dans les événements et activités.</p>
          </div>

          <input
            className="activity-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher : Duclair, devis, stock..."
          />
        </div>

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

        <div className="activity-timeline">
          {filteredEvents.length === 0 ? (
            <p>Aucune activité.</p>
          ) : (
            filteredEvents.map((event) => (
              <article className="activity-item" key={event.id}>
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
                      <summary>Détails techniques</summary>
                      <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                    </details>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
