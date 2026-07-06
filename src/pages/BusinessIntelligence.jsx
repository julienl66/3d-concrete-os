import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";
import { canAccess } from "../services/permissions.js";

const PERIODS = [
  { value: "month", label: "Mois" },
  { value: "quarter", label: "Trimestre" },
  { value: "year", label: "Année" },
];

const KPI_SOURCES = [
  { value: "projects_revenue", label: "CA signé projets" },
  { value: "crm_pipeline", label: "Pipeline CRM" },
  { value: "active_projects", label: "Projets actifs" },
  { value: "quotes_count", label: "Nombre de chiffrages" },
  { value: "crm_contacts", label: "Contacts CRM" },
  { value: "stock_value", label: "Valeur stock" },
  { value: "worked_hours", label: "Heures pointées" },
  { value: "average_margin", label: "Marge moyenne prévisionnelle" },
];

const DEFAULT_WIDGETS = [
  { title: "CA signé", source_key: "projects_revenue", widget_type: "kpi", color: "#16a34a", position_order: 1, active: true },
  { title: "Pipeline CRM", source_key: "crm_pipeline", widget_type: "kpi", color: "#2563eb", position_order: 2, active: true },
  { title: "Projets actifs", source_key: "active_projects", widget_type: "kpi", color: "#f59e0b", position_order: 3, active: true },
  { title: "Chiffrages", source_key: "quotes_count", widget_type: "kpi", color: "#7c3aed", position_order: 4, active: true },
  { title: "Contacts CRM", source_key: "crm_contacts", widget_type: "kpi", color: "#0f766e", position_order: 5, active: true },
  { title: "Valeur stock", source_key: "stock_value", widget_type: "kpi", color: "#475569", position_order: 6, active: true },
];

export default function BusinessIntelligence({ user, permissions }) {
  const [projects, setProjects] = useState([]);
  const [crmContacts, setCrmContacts] = useState([]);
  const [crmStages, setCrmStages] = useState([]);
  const [crmInteractions, setCrmInteractions] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [punchEvents, setPunchEvents] = useState([]);
  const [revenueEntries, setRevenueEntries] = useState([]);
  const [costEntries, setCostEntries] = useState([]);
  const [widgets, setWidgets] = useState([]);
  const [settings, setSettings] = useState({});
  const [message, setMessage] = useState("");
  const [period, setPeriod] = useState("year");
  const [view, setView] = useState("direction");
  const [editMode, setEditMode] = useState(false);

  const [widgetForm, setWidgetForm] = useState({
    title: "",
    source_key: "projects_revenue",
    widget_type: "kpi",
    color: "#2563eb",
  });

  useEffect(() => {
    loadData();
  }, []);

  function can(action) {
    return canAccess(user, permissions, "bi", action);
  }

  async function loadData() {
    const [
      projectsResponse,
      crmContactsResponse,
      crmStagesResponse,
      crmInteractionsResponse,
      quotesResponse,
      stockResponse,
      punchResponse,
      revenueResponse,
      costResponse,
      widgetsResponse,
      settingsResponse,
    ] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("crm_contacts").select("*").order("created_at", { ascending: false }),
      supabase.from("crm_pipeline_stages").select("*").eq("active", true).order("stage_order"),
      supabase.from("crm_interactions").select("*").order("created_at", { ascending: false }),
      supabase.from("quote_estimations").select("*").order("created_at", { ascending: false }),
      supabase.from("stock_items").select("*").eq("active", true),
      supabase.from("punch_events").select("*").order("event_time", { ascending: true }),
      supabase.from("revenue_entries").select("*").order("entry_date", { ascending: false }),
      supabase.from("project_cost_entries").select("*").order("cost_date", { ascending: false }),
      supabase.from("bi_widgets").select("*").eq("active", true).order("position_order"),
      supabase.from("bi_settings").select("*"),
    ]);

    const error =
      projectsResponse.error ||
      crmContactsResponse.error ||
      crmStagesResponse.error ||
      crmInteractionsResponse.error ||
      quotesResponse.error ||
      stockResponse.error ||
      punchResponse.error ||
      revenueResponse.error ||
      costResponse.error;

    if (error) {
      setMessage(error.message);
      return;
    }

    setProjects(projectsResponse.data || []);
    setCrmContacts(crmContactsResponse.data || []);
    setCrmStages(crmStagesResponse.data || []);
    setCrmInteractions(crmInteractionsResponse.data || []);
    setQuotes(quotesResponse.data || []);
    setStockItems(stockResponse.data || []);
    setPunchEvents(punchResponse.data || []);
    setRevenueEntries(revenueResponse.data || []);
    setCostEntries(costResponse.data || []);

    if (widgetsResponse.error) {
      setWidgets(DEFAULT_WIDGETS);
    } else if ((widgetsResponse.data || []).length === 0) {
      setWidgets(DEFAULT_WIDGETS);
    } else {
      setWidgets(widgetsResponse.data || []);
    }

    if (!settingsResponse.error) {
      const nextSettings = {};
      (settingsResponse.data || []).forEach((setting) => {
        nextSettings[setting.setting_key] = setting.setting_value;
      });
      setSettings(nextSettings);
    }
  }

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  }

  function startDateForPeriod() {
    const date = new Date();

    if (period === "month") {
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      return date;
    }

    if (period === "quarter") {
      const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
      date.setMonth(quarterStartMonth, 1);
      date.setHours(0, 0, 0, 0);
      return date;
    }

    date.setMonth(0, 1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  const periodStart = startDateForPeriod();

  function isInPeriod(dateValue) {
    if (!dateValue) return false;
    return new Date(dateValue) >= periodStart;
  }

  function normalizedStockCost(item) {
    const price = Number(item.unit_price || 0);
    if (item.price_unit === "tonne") return price / 1000;
    return price;
  }

  function buildPunchSegments(sourceEvents) {
    const byEmployee = {};
    sourceEvents.forEach((event) => {
      if (!byEmployee[event.employee_id]) byEmployee[event.employee_id] = [];
      byEmployee[event.employee_id].push(event);
    });

    const segments = [];

    Object.values(byEmployee).forEach((employeeEvents) => {
      let start = null;

      employeeEvents.forEach((event) => {
        if (event.event_type === "ARRIVAL" || event.event_type === "RESUME") {
          start = event;
        }

        if ((event.event_type === "PAUSE" || event.event_type === "DEPART") && start) {
          const ms = new Date(event.event_time) - new Date(start.event_time);
          if (ms > 0) segments.push({ start, end: event, ms });
          start = null;
        }
      });
    });

    return segments;
  }

  const periodProjects = projects.filter((project) =>
    isInPeriod(project.signed_date || project.created_at)
  );

  const activeProjects = projects.filter((project) => project.active);
  const signedRevenue = periodProjects.reduce((sum, project) => sum + Number(project.sale_amount || 0), 0);
  const manualRevenue = revenueEntries
    .filter((entry) => isInPeriod(entry.entry_date || entry.created_at))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const totalRevenue = signedRevenue + manualRevenue;

  const crmPipeline = crmContacts.reduce((sum, contact) => {
    const stage = crmStages.find((item) => item.id === contact.stage_id);
    const name = String(stage?.name || "").toLowerCase();

    if (name.includes("gagn") || name.includes("perdu")) return sum;

    return sum + Number(contact.estimated_amount || 0);
  }, 0);

  const quotePipeline = quotes
    .filter((quote) => quote.status !== "converted")
    .reduce((sum, quote) => sum + Number(quote.sale_amount || quote.total_cost || 0), 0);

  const stockValue = stockItems.reduce(
    (sum, item) => sum + Number(item.current_quantity || 0) * normalizedStockCost(item),
    0
  );

  const punchSegments = buildPunchSegments(punchEvents.filter((event) => isInPeriod(event.event_time)));
  const workedHours = punchSegments.reduce((sum, segment) => sum + segment.ms, 0) / 1000 / 60 / 60;

  const totalCosts = costEntries
    .filter((entry) => isInPeriod(entry.cost_date || entry.created_at))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const averageMargin =
    totalRevenue > 0 ? Math.max(0, ((totalRevenue - totalCosts) / totalRevenue) * 100) : 0;

  function valueForSource(sourceKey) {
    const values = {
      projects_revenue: totalRevenue,
      crm_pipeline: crmPipeline + quotePipeline,
      active_projects: activeProjects.length,
      quotes_count: quotes.length,
      crm_contacts: crmContacts.length,
      stock_value: stockValue,
      worked_hours: workedHours,
      average_margin: averageMargin,
    };

    return values[sourceKey] || 0;
  }

  function displayValue(sourceKey, value) {
    if (["projects_revenue", "crm_pipeline", "stock_value"].includes(sourceKey)) {
      return formatMoney(value);
    }

    if (sourceKey === "worked_hours") {
      return `${formatNumber(value)} h`;
    }

    if (sourceKey === "average_margin") {
      return `${formatNumber(value)} %`;
    }

    return formatNumber(value);
  }

  function settingNumber(key, fallback) {
    const value = Number(settings[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  const goal = settingNumber("annual_revenue_goal", 2000000);
  const pipelineGoal = settingNumber("pipeline_goal", 5000000);
  const rdvGoal = settingNumber("monthly_rdv_goal", 10);
  const quoteGoal = settingNumber("monthly_quote_goal", 8);
  const marginGoal = settingNumber("target_margin_rate", 35);
  const productionHoursGoal = settingNumber("monthly_production_hours_goal", 300);

  const goalProgress = Math.min(100, goal > 0 ? (totalRevenue / goal) * 100 : 0);

  const periodInteractions = crmInteractions.filter((interaction) =>
    isInPeriod(interaction.interaction_date || interaction.created_at || interaction.next_action_date)
  );

  const rdvCount = periodInteractions.filter((interaction) => interaction.interaction_type === "rdv").length;
  const devisCount = periodInteractions.filter((interaction) => interaction.interaction_type === "devis").length;
  const signedStages = crmStages.filter((stage) => String(stage.name || "").toLowerCase().includes("gagn"));
  const signedContacts = crmContacts.filter((contact) =>
    signedStages.some((stage) => stage.id === contact.stage_id)
  ).length;
  const overdueRelances = crmInteractions.filter((interaction) => {
    if (interaction.done) return false;
    if (!interaction.next_action_date) return false;
    return new Date(interaction.next_action_date) < new Date(new Date().toISOString().slice(0, 10));
  }).length;

  const commercialScore = Math.max(0, Math.min(100,
    (crmPipeline + quotePipeline) / pipelineGoal * 35 +
    rdvCount / rdvGoal * 20 +
    devisCount / quoteGoal * 20 +
    signedContacts * 5 -
    overdueRelances * 3
  ));

  const productionScore = Math.max(0, Math.min(100,
    workedHours / productionHoursGoal * 55 +
    activeProjects.length * 3
  ));

  const financeScore = Math.max(0, Math.min(100,
    goalProgress * 0.55 +
    (averageMargin / marginGoal) * 45
  ));

  const healthyStockRatio =
    stockItems.filter((item) => Number(item.current_quantity || 0) > Number(item.minimum_quantity || 0)).length /
    Math.max(1, stockItems.length);

  const stockScore = Math.max(0, Math.min(100, healthyStockRatio * 100));

  const globalScore = Math.round(
    commercialScore * 0.35 +
    productionScore * 0.25 +
    financeScore * 0.30 +
    stockScore * 0.10
  );

  const monthlyRevenue = useMemo(() => {
    const year = new Date().getFullYear();

    return Array.from({ length: 12 }, (_, index) => {
      const projectTotal = projects
        .filter((project) => {
          const date = new Date(project.signed_date || project.created_at);
          return date.getFullYear() === year && date.getMonth() === index;
        })
        .reduce((sum, project) => sum + Number(project.sale_amount || 0), 0);

      const manualTotal = revenueEntries
        .filter((entry) => {
          const date = new Date(entry.entry_date || entry.created_at);
          return date.getFullYear() === year && date.getMonth() === index;
        })
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

      return {
        label: new Date(year, index, 1).toLocaleDateString("fr-FR", { month: "short" }),
        value: projectTotal + manualTotal,
      };
    });
  }, [projects, revenueEntries]);

  const maxMonthlyRevenue = Math.max(1, ...monthlyRevenue.map((row) => row.value));

  const crmFunnel = crmStages.map((stage) => {
    const stageContacts = crmContacts.filter((contact) => contact.stage_id === stage.id);

    return {
      id: stage.id,
      label: stage.name,
      count: stageContacts.length,
      value: stageContacts.reduce((sum, contact) => sum + Number(contact.estimated_amount || 0), 0),
      color: stage.color || "#2563eb",
    };
  });

  const maxFunnelCount = Math.max(1, ...crmFunnel.map((row) => row.count));

  async function createWidget(e) {
    e.preventDefault();

    if (!can("can_create")) {
      setMessage("Action non autorisée.");
      return;
    }

    if (!widgetForm.title) {
      setMessage("Nom du widget obligatoire.");
      return;
    }

    const nextOrder = Math.max(...widgets.map((widget) => Number(widget.position_order || 0)), 0) + 1;

    const { error } = await supabase.from("bi_widgets").insert({
      title: widgetForm.title,
      source_key: widgetForm.source_key,
      widget_type: widgetForm.widget_type,
      color: widgetForm.color || "#2563eb",
      position_order: nextOrder,
      active: true,
      created_by: user?.id || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setWidgetForm({
      title: "",
      source_key: "projects_revenue",
      widget_type: "kpi",
      color: "#2563eb",
    });

    setMessage("Widget ajouté.");
    await loadData();
  }

  async function deleteWidget(widget) {
    if (!can("can_delete")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(`Supprimer le widget "${widget.title}" ?`);
    if (!ok) return;

    if (!widget.id) {
      setWidgets((current) => current.filter((item) => item.title !== widget.title));
      return;
    }

    const { error } = await supabase
      .from("bi_widgets")
      .update({ active: false })
      .eq("id", widget.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Widget supprimé.");
    await loadData();
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Business Intelligence</p>
          <h2>Reporting direction & investisseurs</h2>
          <p>Vue consolidée CRM, projets, chiffrage, stock, coûts et pointage.</p>
        </div>

        <div className="inline-actions">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>

          <button className={view === "direction" ? "btn primary" : "btn small"} onClick={() => setView("direction")}>Direction</button>
          <button className={view === "commercial" ? "btn primary" : "btn small"} onClick={() => setView("commercial")}>Commercial</button>
          <button className={view === "investors" ? "btn primary" : "btn small"} onClick={() => setView("investors")}>Investisseurs</button>
          <button className={editMode ? "btn primary" : "btn small"} onClick={() => setEditMode(!editMode)}>Édition</button>
          <button className="btn secondary" onClick={loadData}>Actualiser</button>
        </div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="bi-score-card">
        <div>
          <span>Indice 3D Concrete</span>
          <strong>{globalScore} / 100</strong>
          <p>
            Score pondéré : commercial 35 %, finance 30 %, production 25 %, stock 10 %.
            Les relances en retard pénalisent le score commercial.
          </p>
        </div>

        <div className="bi-score-breakdown">
          <div><span>Commercial</span><strong>{Math.round(commercialScore)}</strong></div>
          <div><span>Production</span><strong>{Math.round(productionScore)}</strong></div>
          <div><span>Finance</span><strong>{Math.round(financeScore)}</strong></div>
          <div><span>Stock</span><strong>{Math.round(stockScore)}</strong></div>
        </div>
      </div>

      <div className="bi-kpi-grid">
        {widgets.map((widget) => {
          const value = valueForSource(widget.source_key);

          return (
            <div className="bi-kpi-card" key={widget.id || widget.title} style={{ borderTopColor: widget.color || "#2563eb" }}>
              <span>{widget.title}</span>
              <strong>{displayValue(widget.source_key, value)}</strong>
              <small>{KPI_SOURCES.find((item) => item.value === widget.source_key)?.label || widget.source_key}</small>

              {editMode && (
                <button className="btn small danger-soft" onClick={() => deleteWidget(widget)}>
                  Supprimer
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editMode && (
        <div className="card">
          <h3>Ajouter un widget</h3>

          <form className="bi-widget-form" onSubmit={createWidget}>
            <div>
              <label>Titre</label>
              <input value={widgetForm.title} onChange={(e) => setWidgetForm({ ...widgetForm, title: e.target.value })} />
            </div>

            <div>
              <label>Source</label>
              <select value={widgetForm.source_key} onChange={(e) => setWidgetForm({ ...widgetForm, source_key: e.target.value })}>
                {KPI_SOURCES.map((source) => (
                  <option key={source.value} value={source.value}>{source.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label>Type</label>
              <select value={widgetForm.widget_type} onChange={(e) => setWidgetForm({ ...widgetForm, widget_type: e.target.value })}>
                <option value="kpi">Carte KPI</option>
              </select>
            </div>

            <div>
              <label>Couleur</label>
              <input type="color" value={widgetForm.color} onChange={(e) => setWidgetForm({ ...widgetForm, color: e.target.value })} />
            </div>

            <button className="btn primary">Ajouter</button>
          </form>
        </div>
      )}

      {view === "direction" && (
        <>
          <div className="card">
            <div className="page-head">
              <div>
                <h3>Objectif annuel</h3>
                <p>Objectif indicatif V1 : {formatMoney(goal)}</p>
              </div>
              <strong>{formatNumber(goalProgress)} %</strong>
            </div>

            <div className="bi-goal-track">
              <div style={{ width: `${goalProgress}%` }} />
            </div>
          </div>

          <div className="bi-main-grid">
            <div className="card">
              <h3>Évolution du CA</h3>

              <div className="bi-bar-chart">
                {monthlyRevenue.map((row) => (
                  <div key={row.label}>
                    <span>{row.label}</span>
                    <div><b style={{ height: `${Math.max(4, (row.value / maxMonthlyRevenue) * 100)}%` }} /></div>
                    <small>{formatMoney(row.value)}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3>Rentabilité période</h3>

              <div className="bi-profit-card">
                <div><span>CA</span><strong>{formatMoney(totalRevenue)}</strong></div>
                <div><span>Coûts</span><strong>{formatMoney(totalCosts)}</strong></div>
                <div><span>Marge</span><strong>{formatNumber(averageMargin)} %</strong></div>
              </div>
            </div>
          </div>
        </>
      )}

      {view === "commercial" && (
        <div className="card">
          <h3>Pipeline CRM</h3>

          <div className="bi-funnel">
            {crmFunnel.map((row) => (
              <div key={row.id}>
                <div>
                  <strong>{row.label}</strong>
                  <span>{row.count} contact(s)</span>
                </div>

                <div className="bi-funnel-bar">
                  <b style={{ width: `${Math.max(5, (row.count / maxFunnelCount) * 100)}%`, background: row.color }} />
                </div>

                <small>{formatMoney(row.value)}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "investors" && (
        <div className="bi-investor-board">
          <div className="card investor-hero">
            <span>PIPE + CHIFFRAGES</span>
            <strong>{formatMoney(crmPipeline + quotePipeline)}</strong>
            <p>Potentiel commercial consolidé CRM + chiffrage.</p>
          </div>

          <div className="card investor-hero">
            <span>BACKLOG / PROJETS ACTIFS</span>
            <strong>{activeProjects.length}</strong>
            <p>Nombre de projets en portefeuille actif.</p>
          </div>

          <div className="card investor-hero">
            <span>MARGE INDICATIVE</span>
            <strong>{formatNumber(averageMargin)} %</strong>
            <p>Marge estimée sur données disponibles.</p>
          </div>

          <div className="card investor-hero">
            <span>OBJECTIF ANNUEL</span>
            <strong>{formatNumber(goalProgress)} %</strong>
            <p>{formatMoney(totalRevenue)} / {formatMoney(goal)}</p>
          </div>
        </div>
      )}
    </section>
  );
}
