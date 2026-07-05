import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";

export default function Dashboard({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [productionPlanning, setProductionPlanning] = useState([]);
  const [installationPlanning, setInstallationPlanning] = useState([]);
  const [punchEvents, setPunchEvents] = useState([]);
  const [revenueEntries, setRevenueEntries] = useState([]);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("notifications");
  const [acknowledgedAutoNotifications, setAcknowledgedAutoNotifications] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("acknowledged_auto_notifications") || "[]");
    } catch {
      return [];
    }
  });
  const [notificationCategory, setNotificationCategory] = useState("stock");
  const [now, setNow] = useState(new Date());
  const [selectedRevenueYear, setSelectedRevenueYear] = useState(new Date().getFullYear());
  const [selectedRevenueMonth, setSelectedRevenueMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => {
    loadDashboard();

    const timer = setInterval(loadDashboard, 30000);
    const clock = setInterval(() => setNow(new Date()), 1000);

    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, []);

  async function loadDashboard() {
    const [
      notificationsResponse,
      logResponse,
      stockResponse,
      productionResponse,
      installationResponse,
      punchResponse,
      revenueResponse,
      projectsRevenueResponse,
    ] = await Promise.all([
      supabase
        .from("erp_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("erp_activity_log")
        .select("*, employees(name), projects(name, project_code)")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("stock_items")
        .select("*, stock_categories(name)")
        .eq("active", true),
      supabase
        .from("production_planning")
        .select("*, projects(name, project_code)")
        .order("planned_start", { ascending: true }),
      supabase
        .from("installation_planning")
        .select("*, projects(name, project_code)")
        .order("planned_date", { ascending: true }),
      supabase
        .from("punch_events")
        .select("*, employees(name), projects(name, project_code), work_activities(name)")
        .order("event_time", { ascending: false })
        .limit(100),
      supabase
        .from("revenue_entries")
        .select("*")
        .order("entry_date", { ascending: false }),
      supabase
        .from("projects")
        .select("id, name, project_code, sale_amount, signed_date, created_at")
        .eq("active", true),
    ]);

    const error =
      notificationsResponse.error ||
      logResponse.error ||
      stockResponse.error ||
      productionResponse.error ||
      installationResponse.error ||
      punchResponse.error ||
      revenueResponse.error ||
      projectsRevenueResponse.error;

    if (error) {
      setMessage(error.message);
      return;
    }

    setNotifications(notificationsResponse.data || []);
    setActivityLog(logResponse.data || []);
    setStockItems(stockResponse.data || []);
    setProductionPlanning(productionResponse.data || []);
    setInstallationPlanning(installationResponse.data || []);
    setPunchEvents(punchResponse.data || []);

    const projectRevenueRows = (projectsRevenueResponse.data || [])
      .filter((project) => Number(project.sale_amount || 0) > 0)
      .map((project) => ({
        id: `project-${project.id}`,
        label: `${project.project_code ? `${project.project_code} - ` : ""}${project.name}`,
        amount: Number(project.sale_amount || 0),
        entry_date: project.signed_date || project.created_at?.slice(0, 10) || null,
        source: "project",
      }));

    setRevenueEntries([...projectRevenueRows, ...(revenueResponse.data || [])]);
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

  function formatDate(value) {
    if (!value) return "-";

    return new Date(value).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function isLate(dateValue) {
    if (!dateValue) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const date = new Date(dateValue);
    date.setHours(0, 0, 0, 0);

    return date < today;
  }

  function latestEmployeeEvents() {
    const latestByEmployee = {};

    punchEvents.forEach((event) => {
      if (!event.employee_id) return;
      if (!latestByEmployee[event.employee_id]) {
        latestByEmployee[event.employee_id] = event;
      }
    });

    return Object.values(latestByEmployee);
  }

  function employeeStatus(event) {
    if (event.event_type === "ARRIVAL" || event.event_type === "RESUME") {
      return { label: "En travail", className: "live-working" };
    }

    if (event.event_type === "PAUSE") {
      return { label: "Pause", className: "live-pause" };
    }

    return { label: "Arrêté", className: "live-stopped" };
  }

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString("fr-FR")} €`;
  }

  async function addManualRevenue() {
    const label = window.prompt("Libellé du CA ?");
    if (!label) return;

    const amountRaw = window.prompt("Montant HT encaissé / réalisé ?", "0");
    if (amountRaw === null) return;

    const amount = Number(String(amountRaw).replace(",", "."));

    if (Number.isNaN(amount) || amount <= 0) {
      setMessage("Montant invalide.");
      return;
    }

    const entryDate = window.prompt("Date ? AAAA-MM-JJ", new Date().toISOString().slice(0, 10));
    if (entryDate === null) return;

    const { error } = await supabase.from("revenue_entries").insert({
      label,
      amount,
      entry_date: entryDate || new Date().toISOString().slice(0, 10),
      source: "manual",
      created_by: user?.id || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("CA manuel ajouté.");
    loadDashboard();
  }

  async function deleteManualRevenue(entry) {
    if (entry.source === "project") {
      setMessage("Ce CA vient d'un projet : modifie le montant vendu dans la fiche projet.");
      return;
    }

    const ok = window.confirm(`Supprimer la ligne CA "${entry.label}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("revenue_entries")
      .delete()
      .eq("id", entry.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Ligne CA supprimée.");
    loadDashboard();
  }

  async function markNotificationRead(notification) {
    const { error } = await supabase
      .from("erp_notifications")
      .update({ is_read: true })
      .eq("id", notification.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    loadDashboard();
  }

  async function deleteNotification(notification) {
    const ok = window.confirm("Supprimer cette notification ?");
    if (!ok) return;

    const { error } = await supabase
      .from("erp_notifications")
      .delete()
      .eq("id", notification.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    loadDashboard();
  }

  function acknowledgeAutomaticNotification(notification) {
    const nextAcknowledged = Array.from(
      new Set([...acknowledgedAutoNotifications, notification.id])
    );

    setAcknowledgedAutoNotifications(nextAcknowledged);
    localStorage.setItem(
      "acknowledged_auto_notifications",
      JSON.stringify(nextAcknowledged)
    );
  }

  function resetAcknowledgedAutomaticNotifications() {
    setAcknowledgedAutoNotifications([]);
    localStorage.removeItem("acknowledged_auto_notifications");
  }

  async function generateAutomaticNotifications() {
    const lowStockItems = stockItems.filter((item) => {
      const current = Number(item.current_quantity || 0);
      const minimum = Number(item.minimum_quantity || 0);
      return minimum > 0 && current < minimum;
    });

    const lateProduction = productionPlanning.filter(
      (item) => isLate(item.planned_end) && item.status !== "done"
    );

    const lateInstallation = installationPlanning.filter(
      (item) => isLate(item.planned_date) && item.status !== "done" && item.status !== "cancelled"
    );

    const rows = [
      ...lowStockItems.map((item) => ({
        level: "critical",
        title: "Stock bas",
        message: `${item.reference || "-"} · ${item.name} : ${item.current_quantity || 0} / mini ${item.minimum_quantity || 0} ${item.unit || ""}`,
        entity_type: "stock_item",
        entity_id: item.id,
        created_by: user?.id || null,
      })),
      ...lateProduction.map((item) => ({
        level: "critical",
        title: "Production en retard",
        message: `${item.projects?.project_code || ""} ${item.projects?.name || item.title} · fin prévue ${formatDate(item.planned_end)}`,
        entity_type: "production_planning",
        entity_id: item.id,
        created_by: user?.id || null,
      })),
      ...lateInstallation.map((item) => ({
        level: "critical",
        title: "Pose en retard",
        message: `${item.projects?.project_code || ""} ${item.projects?.name || item.title} · prévue ${formatDate(item.planned_date)}`,
        entity_type: "installation_planning",
        entity_id: item.id,
        created_by: user?.id || null,
      })),
    ];

    if (rows.length === 0) {
      setMessage("Aucune notification automatique à générer.");
      return;
    }

    const { error } = await supabase.from("erp_notifications").insert(rows);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(`${rows.length} notification(s) générée(s).`);
    loadDashboard();
  }

  async function createManualLog() {
    const action = window.prompt("Action ?");
    if (!action) return;

    const description = window.prompt("Description ?");
    if (description === null) return;

    const { error } = await supabase.from("erp_activity_log").insert({
      action,
      description,
      entity_type: "manual",
      created_by: user?.id || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Journal ajouté.");
    loadDashboard();
  }

  async function deleteLog(log) {
    const ok = window.confirm("Supprimer cette ligne du journal ?");
    if (!ok) return;

    const { error } = await supabase
      .from("erp_activity_log")
      .delete()
      .eq("id", log.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    loadDashboard();
  }

  const lowStockItems = stockItems.filter((item) => {
    const current = Number(item.current_quantity || 0);
    const minimum = Number(item.minimum_quantity || 0);
    return minimum > 0 && current < minimum;
  });

  const lateProduction = productionPlanning.filter(
    (item) => isLate(item.planned_end) && item.status !== "done"
  );

  const lateInstallation = installationPlanning.filter(
    (item) => isLate(item.planned_date) && item.status !== "done" && item.status !== "cancelled"
  );

  const liveAutomaticNotifications = [
    ...lowStockItems.map((item) => ({
      id: `auto-stock-${item.id}`,
      level: "critical",
      title: "Stock bas",
      message: `${item.reference || "-"} · ${item.name} : ${item.current_quantity || 0} / mini ${item.minimum_quantity || 0} ${item.unit || ""}`,
      created_at: new Date().toISOString(),
      is_read: false,
      automatic: true,
    })),
    ...lateProduction.map((item) => ({
      id: `auto-prod-${item.id}`,
      level: "critical",
      title: "Production en retard",
      message: `${item.projects?.project_code || ""} ${item.projects?.name || item.title} · fin prévue ${formatDate(item.planned_end)}`,
      created_at: new Date().toISOString(),
      is_read: false,
      automatic: true,
    })),
    ...lateInstallation.map((item) => ({
      id: `auto-pose-${item.id}`,
      level: "critical",
      title: "Pose en retard",
      message: `${item.projects?.project_code || ""} ${item.projects?.name || item.title} · prévue ${formatDate(item.planned_date)}`,
      created_at: new Date().toISOString(),
      is_read: false,
      automatic: true,
    })),
  ];

  const liveAutomaticNotificationsWithState = liveAutomaticNotifications.map((notification) => ({
    ...notification,
    is_acknowledged: acknowledgedAutoNotifications.includes(notification.id),
  }));

  const allNotifications = [...liveAutomaticNotificationsWithState, ...notifications];
  const stockNotifications = liveAutomaticNotificationsWithState.filter((notification) =>
    notification.id.startsWith("auto-stock-")
  );

  const lateNotifications = liveAutomaticNotificationsWithState.filter(
    (notification) =>
      notification.id.startsWith("auto-prod-") ||
      notification.id.startsWith("auto-pose-")
  );

  const savedNotifications = notifications.filter((notification) => !notification.is_read);

  const stockNewCount = stockNotifications.filter((notification) => !notification.is_acknowledged).length;
  const lateNewCount = lateNotifications.filter((notification) => !notification.is_acknowledged).length;

  const notificationGroups = [
    {
      id: "stock",
      icon: "📦",
      title: "Stock bas",
      level: stockNotifications.length ? "danger" : "success",
      count: stockNotifications.length,
      description: stockNotifications.length
        ? `${stockNotifications.length} critique(s) · ${stockNewCount} nouvelle(s)`
        : "Aucun stock critique",
      items: stockNotifications,
    },
    {
      id: "late",
      icon: "⏰",
      title: "Retards",
      level: lateNotifications.length ? "danger" : "success",
      count: lateNotifications.length,
      description: lateNotifications.length
        ? `${lateNotifications.length} retard(s) · ${lateNewCount} nouveau(x)`
        : "Aucun retard détecté",
      items: lateNotifications,
    },
    {
      id: "manual",
      icon: "🔔",
      title: "Notifications ERP",
      level: savedNotifications.length ? "info" : "success",
      count: savedNotifications.length,
      description: savedNotifications.length
        ? "Notifications enregistrées en base"
        : "Aucune notification ERP",
      items: savedNotifications,
    },
  ];

  const selectedNotificationGroup =
    notificationGroups.find((group) => group.id === notificationCategory) ||
    notificationGroups[0];


  function currentSessionStartForEmployee(employeeId) {
    const employeeEvents = punchEvents
      .filter((event) => event.employee_id === employeeId)
      .sort((a, b) => new Date(b.event_time) - new Date(a.event_time));

    const latest = employeeEvents[0];

    if (!latest || !["ARRIVAL", "RESUME", "PAUSE"].includes(latest.event_type)) {
      return null;
    }

    return latest.event_time;
  }

  function formatElapsedFrom(value) {
    if (!value) return "-";

    const ms = Math.max(0, now - new Date(value));
    const totalMinutes = Math.floor(ms / 1000 / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const seconds = Math.floor((ms / 1000) % 60);

    return `${String(hours).padStart(2, "0")}h${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`;
  }

  function progressFromDuration(value) {
    if (!value) return 0;

    const ms = Math.max(0, now - new Date(value));
    const targetMs = 4 * 60 * 60 * 1000;
    return Math.min(100, Math.round((ms / targetMs) * 100));
  }

  const unreadNotifications = allNotifications.filter((notification) =>
    notification.automatic ? !notification.is_acknowledged : !notification.is_read
  );
  const criticalNotifications = unreadNotifications.filter((notification) =>
    ["critical", "danger"].includes(notification.level)
  );
  function entryYear(entry) {
    if (!entry.entry_date) return null;
    return new Date(entry.entry_date).getFullYear();
  }

  function entryMonth(entry) {
    if (!entry.entry_date) return null;
    return new Date(entry.entry_date).getMonth() + 1;
  }

  const availableRevenueYears = Array.from(
    new Set(
      revenueEntries
        .map((entry) => entryYear(entry))
        .filter(Boolean)
    )
  ).sort((a, b) => b - a);

  const filteredYearRevenueEntries = revenueEntries.filter(
    (entry) => entryYear(entry) === Number(selectedRevenueYear)
  );

  const filteredMonthRevenueEntries = filteredYearRevenueEntries.filter(
    (entry) => entryMonth(entry) === Number(selectedRevenueMonth)
  );

  const annualProjectRevenue = filteredYearRevenueEntries
    .filter((entry) => entry.source === "project")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const annualManualRevenue = filteredYearRevenueEntries
    .filter((entry) => entry.source !== "project")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const annualRevenue = annualProjectRevenue + annualManualRevenue;

  const monthlyProjectRevenue = filteredMonthRevenueEntries
    .filter((entry) => entry.source === "project")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const monthlyManualRevenue = filteredMonthRevenueEntries
    .filter((entry) => entry.source !== "project")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const monthlyRevenue = monthlyProjectRevenue + monthlyManualRevenue;

  const revenueByMonth = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const rows = filteredYearRevenueEntries.filter((entry) => entryMonth(entry) === month);
    const total = rows.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    return {
      month,
      label: new Date(Number(selectedRevenueYear), index, 1).toLocaleDateString("fr-FR", {
        month: "short",
      }),
      total,
    };
  });

  const maxMonthlyRevenue = Math.max(1, ...revenueByMonth.map((row) => row.total));

  const employeesNow = latestEmployeeEvents();

  function levelLabel(level) {
    const labels = {
      critical: "Critique",
      danger: "Critique",
      warning: "Important",
      info: "Info",
      success: "OK",
    };

    return labels[level] || level || "Info";
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Tableau de bord</p>
          <h2>Centre de pilotage</h2>
          <p>Notifications ERP, journal d'activité et atelier en direct.</p>
        </div>

        <div className="inline-actions">
          <button className="btn small" onClick={generateAutomaticNotifications}>
            Générer alertes
          </button>
          <button className="btn secondary" onClick={loadDashboard}>
            Actualiser
          </button>
        </div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="stats-grid">
        <div className="stat-card accent">
          <span>Notifications non lues</span>
          <strong>{unreadNotifications.length}</strong>
        </div>

        <div className="stat-card accent">
          <span>Critiques</span>
          <strong>{criticalNotifications.length}</strong>
        </div>

        <div className="stat-card">
          <span>Employés en suivi</span>
          <strong>{employeesNow.length}</strong>
        </div>

        <div className="stat-card">
          <span>CA réalisé total</span>
          <strong>{formatMoney(annualRevenue)}</strong>
        </div>
      </div>

      <div className="card revenue-summary-card">
        <div className="page-head">
          <div>
            <h3>CA réalisé</h3>
            <p>Suivi annuel, mensuel et antériorités.</p>
          </div>

          <button className="btn primary" onClick={addManualRevenue}>
            + Ajouter CA
          </button>
        </div>

        <div className="revenue-controls">
          <div>
            <label>Année</label>
            <select
              value={selectedRevenueYear}
              onChange={(e) => setSelectedRevenueYear(Number(e.target.value))}
            >
              {(availableRevenueYears.length ? availableRevenueYears : [new Date().getFullYear()]).map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Mois</label>
            <select
              value={selectedRevenueMonth}
              onChange={(e) => setSelectedRevenueMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {new Date(2026, index, 1).toLocaleDateString("fr-FR", { month: "long" })}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card accent">
            <span>CA annuel {selectedRevenueYear}</span>
            <strong>{formatMoney(annualRevenue)}</strong>
          </div>

          <div className="stat-card">
            <span>CA mensuel</span>
            <strong>{formatMoney(monthlyRevenue)}</strong>
          </div>

          <div className="stat-card">
            <span>CA projets annuel</span>
            <strong>{formatMoney(annualProjectRevenue)}</strong>
          </div>

          <div className="stat-card">
            <span>CA manuel annuel</span>
            <strong>{formatMoney(annualManualRevenue)}</strong>
          </div>
        </div>

        <div className="revenue-month-chart">
          {revenueByMonth.map((row) => (
            <div className={Number(selectedRevenueMonth) === row.month ? "active" : ""} key={row.month}>
              <span>{row.label}</span>
              <div>
                <b style={{ height: `${Math.max(4, (row.total / maxMonthlyRevenue) * 100)}%` }} />
              </div>
              <small>{formatMoney(row.total)}</small>
            </div>
          ))}
        </div>

        <h4>Antériorités / lignes de CA</h4>

        {filteredYearRevenueEntries.length === 0 ? (
          <p>Aucune ligne de CA pour cette année.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Libellé</th>
                <th>Date</th>
                <th>Montant</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredYearRevenueEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    {entry.source === "project" ? (
                      <span className="planning-badge status-done">Projet</span>
                    ) : (
                      <span className="planning-badge status-planned">Manuel</span>
                    )}
                  </td>
                  <td><strong>{entry.label}</strong></td>
                  <td>{entry.entry_date ? formatDate(entry.entry_date) : "-"}</td>
                  <td>{formatMoney(entry.amount)}</td>
                  <td>
                    {entry.source === "project" ? (
                      <small>Modifier dans le projet</small>
                    ) : (
                      <button className="btn small danger-soft" onClick={() => deleteManualRevenue(entry)}>
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="dashboard-tabs">
        <button className={tab === "notifications" ? "active" : ""} onClick={() => setTab("notifications")}>
          🔔 Notifications
        </button>
        <button className={tab === "live" ? "active" : ""} onClick={() => setTab("live")}>
          👷 Atelier en direct
        </button>
        <button className={tab === "journal" ? "active" : ""} onClick={() => setTab("journal")}>
          📝 Journal ERP
        </button>
        <button className={tab === "revenue" ? "active" : ""} onClick={() => setTab("revenue")}>
          💰 CA réalisé
        </button>
      </div>

      {tab === "notifications" && (
        <div className="card">
          <div className="page-head">
            <div>
              <h3>Notifications</h3>
              <p>Les alertes automatiques restent visibles tant que la cause existe.</p>
            </div>

            <button className="btn small" onClick={resetAcknowledgedAutomaticNotifications}>
              Réinitialiser prises en compte
            </button>
          </div>

          <div className="notification-category-grid">
            {notificationGroups.map((group) => (
              <button
                key={group.id}
                className={`notification-category-card ${group.level} ${notificationCategory === group.id ? "active" : ""}`}
                onClick={() => setNotificationCategory(group.id)}
              >
                <span>{group.icon}</span>

                <div>
                  <strong>{group.title}</strong>
                  <small>{group.description}</small>
                </div>

                <b>{group.count}</b>
              </button>
            ))}
          </div>

          <div className="notification-detail-box">
            <div className="page-head">
              <div>
                <h3>{selectedNotificationGroup.title}</h3>
                <p>{selectedNotificationGroup.description}</p>
              </div>
            </div>

            {selectedNotificationGroup.items.length === 0 ? (
              <p>Aucune alerte dans cette catégorie.</p>
            ) : (
              <div className="erp-notification-list">
                {selectedNotificationGroup.items.map((notification) => (
                  <div
                    className={`erp-notification ${notification.level || "info"} ${notification.is_read || notification.is_acknowledged ? "read" : ""}`}
                    key={notification.id}
                  >
                    <div>
                      <span>{levelLabel(notification.level)}</span>
                      <strong>{notification.title}</strong>
                      <p>{notification.message || "-"}</p>
                      <small>
                        {notification.automatic
                          ? notification.is_acknowledged
                            ? "Alerte automatique · prise en compte"
                            : "Alerte automatique · nouvelle"
                          : formatDateTime(notification.created_at)}
                      </small>
                    </div>

                    <div className="inline-actions">
                      {notification.automatic ? (
                        notification.is_acknowledged ? (
                          <span className="auto-notification-label">Pris en compte</span>
                        ) : (
                          <button className="btn small" onClick={() => acknowledgeAutomaticNotification(notification)}>
                            Pris en compte
                          </button>
                        )
                      ) : (
                        <>
                          {!notification.is_read && (
                            <button className="btn small" onClick={() => markNotificationRead(notification)}>
                              Marquer lu
                            </button>
                          )}

                          <button className="btn small danger-soft" onClick={() => deleteNotification(notification)}>
                            Supprimer
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "live" && (
        <div className="card">
          <div className="page-head">
            <div>
              <h3>Atelier en direct</h3>
              <p>Vue temps réel : employé, projet, activité et durée de session.</p>
            </div>
          </div>

          {employeesNow.length === 0 ? (
            <p>Aucun pointage récent.</p>
          ) : (
            <div className="atelier-command-grid">
              {employeesNow.map((event) => {
                const status = employeeStatus(event);
                const sessionStart = currentSessionStartForEmployee(event.employee_id);
                const progress = progressFromDuration(sessionStart);

                return (
                  <div className={`atelier-command-card ${status.className}`} key={event.id}>
                    <div className="atelier-command-head">
                      <div>
                        <strong>{event.employees?.name || "-"}</strong>
                        <span>{status.label}</span>
                      </div>

                      <b>{formatElapsedFrom(sessionStart)}</b>
                    </div>

                    <div className="atelier-command-body">
                      <div>
                        <small>Projet</small>
                        <p>
                          {event.projects?.project_code
                            ? `${event.projects.project_code} · `
                            : ""}
                          {event.projects?.name || "Sans projet"}
                        </p>
                      </div>

                      <div>
                        <small>Activité</small>
                        <p>{event.work_activities?.name || "-"}</p>
                      </div>

                      <div>
                        <small>Dernier pointage</small>
                        <p>{formatDateTime(event.event_time)}</p>
                      </div>
                    </div>

                    <div className="atelier-progress">
                      <div style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "journal" && (
        <div className="card">
          <div className="page-head">
            <div>
              <h3>Journal ERP</h3>
              <p>Historique global des actions importantes.</p>
            </div>

            <button className="btn primary" onClick={createManualLog}>
              Ajouter une note
            </button>
          </div>

          {activityLog.length === 0 ? (
            <p>Aucun journal pour le moment.</p>
          ) : (
            <div className="erp-log-list">
              {activityLog.map((log) => (
                <div className="erp-log-row" key={log.id}>
                  <div>
                    <strong>{log.action}</strong>
                    <p>{log.description || "-"}</p>
                    <small>
                      {formatDateTime(log.created_at)}
                      {log.employees?.name ? ` · ${log.employees.name}` : ""}
                      {log.projects?.name ? ` · ${log.projects.project_code || ""} ${log.projects.name}` : ""}
                    </small>
                  </div>

                  <button className="btn small danger-soft" onClick={() => deleteLog(log)}>
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "revenue" && (
        <div className="card">
          <div className="page-head">
            <div>
              <h3>CA réalisé</h3>
              <p>Somme des montants vendus des projets + CA ajouté manuellement.</p>
            </div>

            <button className="btn primary" onClick={addManualRevenue}>
              + Ajouter CA manuel
            </button>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span>CA projets</span>
              <strong>{formatMoney(annualProjectRevenue)}</strong>
            </div>

            <div className="stat-card">
              <span>CA manuel</span>
              <strong>{formatMoney(annualManualRevenue)}</strong>
            </div>

            <div className="stat-card accent">
              <span>CA total</span>
              <strong>{formatMoney(annualRevenue)}</strong>
            </div>
          </div>

          {revenueEntries.length === 0 ? (
            <p>Aucune ligne de CA.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Libellé</th>
                  <th>Date</th>
                  <th>Montant</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {revenueEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {entry.source === "project" ? (
                        <span className="planning-badge status-done">Projet</span>
                      ) : (
                        <span className="planning-badge status-planned">Manuel</span>
                      )}
                    </td>
                    <td><strong>{entry.label}</strong></td>
                    <td>{entry.entry_date ? formatDate(entry.entry_date) : "-"}</td>
                    <td>{formatMoney(entry.amount)}</td>
                    <td>
                      {entry.source === "project" ? (
                        <small>Modifier dans le projet</small>
                      ) : (
                        <button className="btn small danger-soft" onClick={() => deleteManualRevenue(entry)}>
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

    </section>
  );
}
