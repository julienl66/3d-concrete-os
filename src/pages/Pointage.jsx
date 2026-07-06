import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";

export default function Pointage({ user }) {
  const [projects, setProjects] = useState([]);
  const [activities, setActivities] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [events, setEvents] = useState([]);
  const [allTodayEvents, setAllTodayEvents] = useState([]);
  const [periodEvents, setPeriodEvents] = useState([]);
  const [period, setPeriod] = useState("day");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(new Date());

  const [form, setForm] = useState({
    project_id: "",
    activity_id: "",
    comment: "",
  });

  const [manualForm, setManualForm] = useState({
    employee_id: "",
    project_id: "",
    activity_id: "",
    event_type: "ARRIVAL",
    event_time: "",
    comment: "",
  });

  useEffect(() => {
    loadData();

    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadPeriodEvents();
  }, [period]);

  async function loadData() {
    const { data: projectsData, error: projectsError } = await supabase
      .from("projects")
      .select("*")
      .eq("active", true)
      .order("name");

    if (projectsError) {
      setMessage(projectsError.message);
      return;
    }

    const { data: activitiesData, error: activitiesError } = await supabase
      .from("work_activities")
      .select("*")
      .eq("active", true)
      .order("name");

    if (activitiesError) {
      setMessage(activitiesError.message);
      return;
    }

    const { data: employeesData, error: employeesError } = await supabase
      .from("employees")
      .select("*")
      .eq("active", true)
      .order("name");

    if (employeesError) {
      setMessage(employeesError.message);
      return;
    }

    setProjects(projectsData || []);
    setActivities(activitiesData || []);
    setEmployees(employeesData || []);

    if (!form.project_id && projectsData?.length) {
      setForm((current) => ({
        ...current,
        project_id: "",
      }));
    }

    if (!form.activity_id && activitiesData?.length) {
      setForm((current) => ({
        ...current,
        activity_id: activitiesData[0].id,
      }));
    }

    await loadTodayEvents();
    await loadAllTodayEvents();
    await loadPeriodEvents();
  }

  function getStartDate(selectedPeriod) {
    const date = new Date();

    if (selectedPeriod === "day") {
      date.setHours(0, 0, 0, 0);
      return date;
    }

    if (selectedPeriod === "week") {
      const day = date.getDay() || 7;
      date.setDate(date.getDate() - day + 1);
      date.setHours(0, 0, 0, 0);
      return date;
    }

    if (selectedPeriod === "month") {
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      return date;
    }

    date.setMonth(0, 1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  async function loadTodayEvents() {
    const startOfDay = getStartDate("day");

    const { data: eventsData, error: eventsError } = await supabase
      .from("punch_events")
      .select("*")
      .eq("employee_id", user.id)
      .gte("event_time", startOfDay.toISOString())
      .order("event_time", { ascending: true });

    if (eventsError) {
      setMessage(eventsError.message);
      return;
    }

    setEvents(eventsData || []);
  }

  async function loadAllTodayEvents() {
    const startOfDay = getStartDate("day");

    const { data: eventsData, error: eventsError } = await supabase
      .from("punch_events")
      .select("*, employees(name), projects(name, project_code), work_activities(name)")
      .gte("event_time", startOfDay.toISOString())
      .order("employee_id", { ascending: true })
      .order("event_time", { ascending: true });

    if (eventsError) {
      setMessage(eventsError.message);
      return;
    }

    setAllTodayEvents(eventsData || []);
  }

  async function loadPeriodEvents() {
    const startDate = getStartDate(period);

    const { data: eventsData, error: eventsError } = await supabase
      .from("punch_events")
      .select("*")
      .eq("employee_id", user.id)
      .gte("event_time", startDate.toISOString())
      .order("event_time", { ascending: true });

    if (eventsError) {
      setMessage(eventsError.message);
      return;
    }

    setPeriodEvents(eventsData || []);
  }

  function employeeName(employeeId) {
    const employee = employees.find((item) => item.id === employeeId);
    return employee?.name || "-";
  }

  function toDatetimeLocalValue(value = new Date()) {
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  }

  function fromDatetimeLocalValue(value) {
    if (!value) return new Date().toISOString();
    return new Date(value).toISOString();
  }

  function projectName(projectId) {
    if (!projectId) return "Sans projet";
    const project = projects.find((item) => item.id === projectId);
    return project ? `${project.project_code ? `${project.project_code} - ` : ""}${project.name}` : null;
  }

  function activityName(activityId) {
    if (!activityId) return null;
    const activity = activities.find((item) => item.id === activityId);
    return activity?.name || null;
  }

  function hasVisibleProject(event) {
    return !event.project_id || projectName(event.project_id);
  }

  function hasVisibleActivity(event) {
    return !!event.activity_id && !!activityName(event.activity_id);
  }

  function hasVisibleEvent(event) {
    return hasVisibleProject(event) && hasVisibleActivity(event);
  }

  async function deletePunchEvent(event) {
    const ok = window.confirm("Supprimer cette ligne de pointage ?");
    if (!ok) return;

    const { error } = await supabase
      .from("punch_events")
      .delete()
      .eq("id", event.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Ligne de pointage supprimée.");
    await loadTodayEvents();
    await loadAllTodayEvents();
    await loadPeriodEvents();
  }

  async function editPunchEventComment(event) {
    const comment = window.prompt("Commentaire ?", event.comment || "");
    if (comment === null) return;

    const { error } = await supabase
      .from("punch_events")
      .update({ comment: comment || null })
      .eq("id", event.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Commentaire modifié.");
    await loadTodayEvents();
    await loadAllTodayEvents();
    await loadPeriodEvents();
  }

  const latestEvent = events.length ? events[events.length - 1] : null;

  const status = useMemo(() => {
    if (!latestEvent) return "stopped";
    if (latestEvent.event_type === "ARRIVAL" || latestEvent.event_type === "RESUME") return "working";
    if (latestEvent.event_type === "PAUSE") return "paused";
    return "stopped";
  }, [latestEvent]);

  const currentSessionStart = useMemo(() => {
    if (status !== "working") return null;

    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];

      if (event.event_type === "ARRIVAL" || event.event_type === "RESUME") {
        return new Date(event.event_time);
      }

      if (event.event_type === "PAUSE" || event.event_type === "DEPART") {
        return null;
      }
    }

    return null;
  }, [events, status]);

  const elapsedCurrent = currentSessionStart
    ? Math.max(0, now - currentSessionStart)
    : 0;

  function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, "0")}h${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`;
  }

  function formatHours(hours) {
    return `${hours.toFixed(2)} h`;
  }

  function formatDateTime(value) {
    if (!value) return "-";

    return new Date(value).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function actionLabel(type) {
    const labels = {
      ARRIVAL: "Démarrage",
      PAUSE: "Pause",
      RESUME: "Reprise",
      DEPART: "Fin",
    };

    return labels[type] || type;
  }

  async function insertEvent(type, overrides = {}) {
    const projectId = overrides.project_id ?? form.project_id;
    const activityId = overrides.activity_id ?? form.activity_id;

    if ((type === "ARRIVAL" || type === "RESUME") && !activityId) {
      setMessage("Choisis une activité.");
      return;
    }

    const { error } = await supabase.from("punch_events").insert({
      employee_id: user.id,
      project_id: projectId || null,
      activity_id: activityId || null,
      event_type: type,
      event_time: new Date().toISOString(),
      comment: form.comment || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setForm((current) => ({
      ...current,
      comment: "",
    }));

    setMessage("Pointage enregistré.");
    await loadTodayEvents();
    await loadAllTodayEvents();
    await loadPeriodEvents();
  }

  async function startWork() {
    await insertEvent("ARRIVAL");
  }

  async function pauseWork() {
    await insertEvent("PAUSE", {
      project_id: latestEvent?.project_id || form.project_id,
      activity_id: latestEvent?.activity_id || form.activity_id,
    });
  }

  async function resumeWork() {
    await insertEvent("RESUME", {
      project_id: latestEvent?.project_id || form.project_id,
      activity_id: latestEvent?.activity_id || form.activity_id,
    });
  }

  async function stopWork() {
    await insertEvent("DEPART", {
      project_id: latestEvent?.project_id || form.project_id,
      activity_id: latestEvent?.activity_id || form.activity_id,
    });
  }

  async function switchProject() {
    if (status === "working") {
      await insertEvent("DEPART", {
        project_id: latestEvent?.project_id || form.project_id,
        activity_id: latestEvent?.activity_id || form.activity_id,
      });
    }

    await insertEvent("ARRIVAL");
  }

  function calculateWorkedMs(sourceEvents) {
    let total = 0;
    let start = null;

    sourceEvents.forEach((event) => {
      if (event.event_type === "ARRIVAL" || event.event_type === "RESUME") {
        start = new Date(event.event_time);
      }

      if ((event.event_type === "PAUSE" || event.event_type === "DEPART") && start) {
        total += new Date(event.event_time) - start;
        start = null;
      }
    });

    if (sourceEvents === events && status === "working" && currentSessionStart) {
      total += now - currentSessionStart;
    }

    return total;
  }

  function buildSegments(sourceEvents) {
    const segments = [];
    let startEvent = null;

    sourceEvents.forEach((event) => {
      if (event.event_type === "ARRIVAL" || event.event_type === "RESUME") {
        startEvent = event;
      }

      if ((event.event_type === "PAUSE" || event.event_type === "DEPART") && startEvent) {
        const ms = new Date(event.event_time) - new Date(startEvent.event_time);

        if (ms > 0) {
          segments.push({
            project_id: startEvent.project_id,
            activity_id: startEvent.activity_id,
            start: startEvent.event_time,
            end: event.event_time,
            ms,
          });
        }

        startEvent = null;
      }
    });

    if (sourceEvents === events && status === "working" && startEvent) {
      segments.push({
        project_id: startEvent.project_id,
        activity_id: startEvent.activity_id,
        start: startEvent.event_time,
        end: now.toISOString(),
        ms: now - new Date(startEvent.event_time),
      });
    }

    return segments;
  }

  function aggregateBy(sourceEvents, key) {
    const rows = {};
    const segments = buildSegments(sourceEvents);

    segments.forEach((segment) => {
      if (key === "project_id" && segment.project_id && !projectName(segment.project_id)) {
        return;
      }

      if (key === "activity_id" && !segment.activity_id) {
        return;
      }

      if (key === "activity_id" && segment.activity_id && !activityName(segment.activity_id)) {
        return;
      }

      const id = segment[key] || "none";
      rows[id] = (rows[id] || 0) + segment.ms;
    });

    return Object.entries(rows)
      .map(([id, ms]) => ({
        id,
        label: key === "project_id"
          ? projectName(id === "none" ? null : id) || "Sans projet"
          : activityName(id === "none" ? null : id) || "Sans activité",
        hours: ms / 1000 / 60 / 60,
      }))
      .sort((a, b) => b.hours - a.hours);
  }

  const workedMs = calculateWorkedMs(events);
  const periodWorkedMs = calculateWorkedMs(periodEvents);
  const projectStats = aggregateBy(periodEvents, "project_id");
  const activityStats = aggregateBy(periodEvents, "activity_id");
  const maxProjectHours = Math.max(1, ...projectStats.map((row) => row.hours));
  const maxActivityHours = Math.max(1, ...activityStats.map((row) => row.hours));

  function isInvalidEvent(event) {
    if (event.project_id && !projectName(event.project_id)) {
      return true;
    }

    if (!event.activity_id || !activityName(event.activity_id)) {
      return true;
    }

    return false;
  }

  const invalidPeriodEvents = periodEvents.filter(isInvalidEvent);

  async function deleteInvalidPeriodEvents() {
    if (invalidPeriodEvents.length === 0) {
      setMessage("Aucune ligne à nettoyer.");
      return;
    }

    const ok = window.confirm(
      `Supprimer ${invalidPeriodEvents.length} ligne(s) de pointage orpheline(s) ou incomplète(s) ?`
    );

    if (!ok) return;

    const ids = invalidPeriodEvents.map((event) => event.id);

    const { error } = await supabase
      .from("punch_events")
      .delete()
      .in("id", ids);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Pointages orphelins supprimés.");
    await loadTodayEvents();
    await loadAllTodayEvents();
    await loadPeriodEvents();
  }

  async function editPunchEvent(event) {
    const dateValue = window.prompt(
      "Date / heure ? Format local",
      toDatetimeLocalValue(event.event_time)
    );
    if (dateValue === null) return;

    const type = window.prompt(
      "Type : ARRIVAL / PAUSE / RESUME / DEPART",
      event.event_type || "ARRIVAL"
    );
    if (type === null) return;

    const projectChoice = window.prompt(
      `Projet ? Laisse vide pour aucun.\n${projects
        .map((project, index) => `${index + 1}. ${project.project_code ? `${project.project_code} - ` : ""}${project.name}`)
        .join("\n")}`,
      event.project_id ? String(projects.findIndex((project) => project.id === event.project_id) + 1) : ""
    );
    if (projectChoice === null) return;

    const activityChoice = window.prompt(
      `Activité ?\n${activities
        .map((activity, index) => `${index + 1}. ${activity.name}`)
        .join("\n")}`,
      event.activity_id ? String(activities.findIndex((activity) => activity.id === event.activity_id) + 1) : ""
    );
    if (activityChoice === null) return;

    const comment = window.prompt("Commentaire ?", event.comment || "");
    if (comment === null) return;

    const selectedProject = projectChoice ? projects[Number(projectChoice) - 1] : null;
    const selectedActivity = activityChoice ? activities[Number(activityChoice) - 1] : null;

    const { error } = await supabase
      .from("punch_events")
      .update({
        event_time: fromDatetimeLocalValue(dateValue),
        event_type: type || event.event_type,
        project_id: selectedProject?.id || null,
        activity_id: selectedActivity?.id || null,
        comment: comment || null,
      })
      .eq("id", event.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Pointage modifié.");
    await loadTodayEvents();
    await loadAllTodayEvents();
    await loadPeriodEvents();
  }

  async function addManualPunchEvent(e) {
    e.preventDefault();

    if (!manualForm.employee_id) {
      setMessage("Choisis un employé.");
      return;
    }

    if (!manualForm.activity_id && (manualForm.event_type === "ARRIVAL" || manualForm.event_type === "RESUME")) {
      setMessage("Choisis une activité pour un démarrage ou une reprise.");
      return;
    }

    const { error } = await supabase.from("punch_events").insert({
      employee_id: manualForm.employee_id,
      project_id: manualForm.project_id || null,
      activity_id: manualForm.activity_id || null,
      event_type: manualForm.event_type,
      event_time: fromDatetimeLocalValue(manualForm.event_time || toDatetimeLocalValue()),
      comment: manualForm.comment || "Ajout manuel",
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setManualForm((current) => ({
      ...current,
      event_time: "",
      comment: "",
    }));

    setMessage("Pointage manuel ajouté.");
    await loadTodayEvents();
    await loadAllTodayEvents();
    await loadPeriodEvents();
  }

  function employeeSegments(employeeEvents) {
    return buildSegments(employeeEvents);
  }

  function employeeWorkedMs(employeeEvents) {
    let total = calculateWorkedMs(employeeEvents);

    const last = employeeEvents[employeeEvents.length - 1];
    if (last && (last.event_type === "ARRIVAL" || last.event_type === "RESUME")) {
      total += now - new Date(last.event_time);
    }

    return total;
  }

  function employeeCurrentStatus(employeeEvents) {
    const last = employeeEvents[employeeEvents.length - 1];

    if (!last) return "stopped";
    if (last.event_type === "ARRIVAL" || last.event_type === "RESUME") return "working";
    if (last.event_type === "PAUSE") return "paused";
    return "stopped";
  }

  const liveEmployeeRows = employees.map((employee) => {
    const employeeEvents = allTodayEvents.filter((event) => event.employee_id === employee.id);
    const last = employeeEvents[employeeEvents.length - 1];

    return {
      employee,
      events: employeeEvents,
      status: employeeCurrentStatus(employeeEvents),
      workedMs: employeeWorkedMs(employeeEvents),
      last,
      segments: employeeSegments(employeeEvents),
    };
  });

  function exportPeriodCsv() {
    const rows = [
      ["Heure", "Action", "Projet", "Activité", "Commentaire"],
      ...periodEvents.filter(hasVisibleEvent).map((event) => [
        formatDateTime(event.event_time),
        actionLabel(event.event_type),
        projectName(event.project_id) || "Sans projet",
        activityName(event.activity_id) || "Sans activité",
        event.comment || "",
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(";")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `pointage-${period}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Pointeuse</p>
          <h2>Pointage par activité</h2>
          <p>Le projet est optionnel. Les analyses permettent de suivre les heures par jour, semaine, mois et année.</p>
        </div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="stats-grid">
        <div className="stat-card">
          <span>Statut actuel</span>
          <strong>
            {status === "working" && "🟢 En travail"}
            {status === "paused" && "🟠 En pause"}
            {status === "stopped" && "⚪ Arrêté"}
          </strong>
        </div>

        <div className="stat-card">
          <span>Session en cours</span>
          <strong>{formatDuration(elapsedCurrent)}</strong>
        </div>

        <div className="stat-card accent">
          <span>Total journée</span>
          <strong>{formatDuration(workedMs)}</strong>
        </div>
      </div>

      <div className="card">
        <h3>Nouveau pointage</h3>

        <div className="grid">
          <div>
            <label>Projet optionnel</label>
            <select
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            >
              <option value="">Sans projet</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.project_code ? `${project.project_code} - ` : ""}
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Activité</label>
            <select
              value={form.activity_id}
              onChange={(e) => setForm({ ...form, activity_id: e.target.value })}
            >
              <option value="">Choisir une activité</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label>Commentaire optionnel</label>
            <input
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              placeholder="Ex : impression pièce 2, maintenance, rangement atelier..."
            />
          </div>
        </div>

        <div className="punch-actions">
          {status === "stopped" && (
            <button className="btn primary punch-main" onClick={startWork}>
              ▶ Démarrer
            </button>
          )}

          {status === "working" && (
            <>
              <button className="btn secondary punch-main" onClick={pauseWork}>
                ⏸ Pause
              </button>

              <button className="btn primary punch-main" onClick={switchProject}>
                🔁 Changer activité / projet
              </button>

              <button className="btn danger-soft punch-main" onClick={stopWork}>
                ■ Finir
              </button>
            </>
          )}

          {status === "paused" && (
            <>
              <button className="btn primary punch-main" onClick={resumeWork}>
                ▶ Reprendre
              </button>

              <button className="btn danger-soft punch-main" onClick={stopWork}>
                ■ Finir
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Travail actuel</h3>

        {!latestEvent || status === "stopped" ? (
          <p>Aucun travail en cours.</p>
        ) : (
          <div className="current-work">
            <div>
              <span>Projet</span>
              <strong>{projectName(latestEvent.project_id)}</strong>
            </div>

            <div>
              <span>Activité</span>
              <strong>{activityName(latestEvent.activity_id) || "Sans activité"}</strong>
            </div>

            <div>
              <span>Durée session</span>
              <strong>{formatDuration(elapsedCurrent)}</strong>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="page-head">
          <div>
            <h3>Pointage atelier en direct</h3>
            <p>Vue globale de tous les employés, connectée à la pointeuse.</p>
          </div>

          <button className="btn secondary" onClick={loadAllTodayEvents}>
            Actualiser
          </button>
        </div>

        <div className="live-punch-grid">
          {liveEmployeeRows.map((row) => (
            <div className={`live-punch-card ${row.status}`} key={row.employee.id}>
              <div className="live-punch-head">
                <div>
                  <strong>{row.employee.name}</strong>
                  <small>
                    {row.status === "working" && "🟢 En travail"}
                    {row.status === "paused" && "🟠 En pause"}
                    {row.status === "stopped" && "⚪ Arrêté"}
                  </small>
                </div>
                <span>{formatDuration(row.workedMs)}</span>
              </div>

              {row.last ? (
                <div className="live-punch-detail">
                  <small>Dernier pointage : {actionLabel(row.last.event_type)} · {formatDateTime(row.last.event_time)}</small>
                  <small>Projet : {projectName(row.last.project_id) || "Sans projet"}</small>
                  <small>Activité : {activityName(row.last.activity_id) || "Sans activité"}</small>
                </div>
              ) : (
                <p>Aucun pointage aujourd'hui.</p>
              )}

              {row.segments.length > 0 && (
                <div className="live-punch-segments">
                  {row.segments.slice(-3).map((segment, index) => (
                    <small key={`${row.employee.id}-${index}`}>
                      {formatDateTime(segment.start)} → {formatDateTime(segment.end)} · {formatDuration(segment.ms)}
                    </small>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Correction / ajout manuel</h3>
        <p>Permet d'ajouter des heures, corriger un oubli, modifier ou supprimer un pointage. Chaque ligne reste modifiable ou supprimable.</p>

        <form className="manual-punch-form" onSubmit={addManualPunchEvent}>
          <div>
            <label>Employé</label>
            <select
              value={manualForm.employee_id}
              onChange={(e) => setManualForm({ ...manualForm, employee_id: e.target.value })}
            >
              <option value="">Choisir</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Type</label>
            <select
              value={manualForm.event_type}
              onChange={(e) => setManualForm({ ...manualForm, event_type: e.target.value })}
            >
              <option value="ARRIVAL">Démarrage</option>
              <option value="PAUSE">Pause</option>
              <option value="RESUME">Reprise</option>
              <option value="DEPART">Fin</option>
            </select>
          </div>

          <div>
            <label>Date / heure</label>
            <input
              type="datetime-local"
              value={manualForm.event_time}
              onChange={(e) => setManualForm({ ...manualForm, event_time: e.target.value })}
            />
          </div>

          <div>
            <label>Projet</label>
            <select
              value={manualForm.project_id}
              onChange={(e) => setManualForm({ ...manualForm, project_id: e.target.value })}
            >
              <option value="">Sans projet</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.project_code ? `${project.project_code} - ` : ""}{project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Activité</label>
            <select
              value={manualForm.activity_id}
              onChange={(e) => setManualForm({ ...manualForm, activity_id: e.target.value })}
            >
              <option value="">Choisir</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>{activity.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Commentaire</label>
            <input
              value={manualForm.comment}
              onChange={(e) => setManualForm({ ...manualForm, comment: e.target.value })}
              placeholder="Ex : oubli pointage, heures sup..."
            />
          </div>

          <button className="btn primary">Ajouter</button>
        </form>

        <h4>Tous les pointages du jour</h4>
        {allTodayEvents.length === 0 ? (
          <p>Aucun pointage aujourd'hui.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employé</th>
                <th>Heure</th>
                <th>Action</th>
                <th>Projet</th>
                <th>Activité</th>
                <th>Commentaire</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {allTodayEvents.map((event) => (
                <tr key={event.id}>
                  <td>{employeeName(event.employee_id)}</td>
                  <td>{formatDateTime(event.event_time)}</td>
                  <td>{actionLabel(event.event_type)}</td>
                  <td>{projectName(event.project_id) || "Sans projet"}</td>
                  <td>{activityName(event.activity_id) || "Sans activité"}</td>
                  <td>{event.comment || "-"}</td>
                  <td>
                    <div className="inline-actions">
                      <button className="btn small" onClick={() => editPunchEvent(event)}>
                        Modifier
                      </button>
                      <button className="btn small danger-soft" onClick={() => deletePunchEvent(event)}>
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
            <h3>Analyse du pointage</h3>
            <p>Prévisualisation des heures par période, projet et activité.</p>
          </div>

          <div className="inline-actions">
            {invalidPeriodEvents.length > 0 && (
              <button className="btn small danger-soft" onClick={deleteInvalidPeriodEvents}>
                Nettoyer {invalidPeriodEvents.length} ligne(s)
              </button>
            )}

            <button className="btn primary" onClick={exportPeriodCsv}>
              Export CSV
            </button>
          </div>
        </div>

        <div className="planning-filters">
          <button className={period === "day" ? "active" : ""} onClick={() => setPeriod("day")}>Jour</button>
          <button className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>Semaine</button>
          <button className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>Mois</button>
          <button className={period === "year" ? "active" : ""} onClick={() => setPeriod("year")}>Année</button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <span>Total période</span>
            <strong>{formatDuration(periodWorkedMs)}</strong>
          </div>

          <div className="stat-card">
            <span>Projets concernés</span>
            <strong>{projectStats.length}</strong>
          </div>

          <div className="stat-card accent">
            <span>Activités concernées</span>
            <strong>{activityStats.length}</strong>
          </div>
        </div>

        <div className="pointage-analysis-grid">
          <div>
            <h4>Heures par projet</h4>

            {projectStats.length === 0 ? (
              <p>Aucune donnée.</p>
            ) : (
              <div className="mini-chart-list">
                {projectStats.map((row) => (
                  <div className="mini-chart-row" key={row.id}>
                    <div className="mini-chart-label">
                      <span>{row.label}</span>
                      <strong>{formatHours(row.hours)}</strong>
                    </div>
                    <div className="mini-chart-track">
                      <div style={{ width: `${Math.max(3, (row.hours / maxProjectHours) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4>Heures par activité</h4>

            {activityStats.length === 0 ? (
              <p>Aucune donnée.</p>
            ) : (
              <div className="mini-chart-list">
                {activityStats.map((row) => (
                  <div className="mini-chart-row" key={row.id}>
                    <div className="mini-chart-label">
                      <span>{row.label}</span>
                      <strong>{formatHours(row.hours)}</strong>
                    </div>
                    <div className="mini-chart-track">
                      <div style={{ width: `${Math.max(3, (row.hours / maxActivityHours) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Historique du jour</h3>

        {events.length === 0 ? (
          <p>Aucun pointage aujourd’hui.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Heure</th>
                <th>Action</th>
                <th>Projet</th>
                <th>Activité</th>
                <th>Commentaire</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {events.filter(hasVisibleEvent).map((event) => (
                <tr key={event.id}>
                  <td>{formatDateTime(event.event_time)}</td>
                  <td>{actionLabel(event.event_type)}</td>
                  <td>{projectName(event.project_id) || "Sans projet"}</td>
                  <td>{activityName(event.activity_id) || "Sans activité"}</td>
                  <td>{event.comment || "-"}</td>
                  <td>
                    <div className="inline-actions">
                      <button className="btn small" onClick={() => editPunchEventComment(event)}>
                        Commentaire
                      </button>
                      <button className="btn small danger-soft" onClick={() => deletePunchEvent(event)}>
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
    </section>
  );
}
