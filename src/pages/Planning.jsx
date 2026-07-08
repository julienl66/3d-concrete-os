import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";
import { emitEvent } from "../services/events.js";

const PRIORITIES = [
  { value: "low", label: "Basse" },
  { value: "normal", label: "Normale" },
  { value: "high", label: "Haute" },
  { value: "urgent", label: "Urgente" },
];

const STATUSES = [
  { value: "planned", label: "Planifiée" },
  { value: "in_progress", label: "En cours" },
  { value: "done", label: "Terminée" },
  { value: "cancelled", label: "Annulée" },
];

export default function Planning({ user }) {
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [robotWeekStart, setRobotWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - day + 1);
    return monday;
  });
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [taskTypes, setTaskTypes] = useState([]);
  const [resources, setResources] = useState([]);
  const [taskResources, setTaskResources] = useState([]);
  const [taskAssignments, setTaskAssignments] = useState([]);
  const [dayTasks, setDayTasks] = useState([]);
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState("calendar");
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState("all");
  const [editingTask, setEditingTask] = useState(null);

  const [form, setForm] = useState({
    task_date: "",
    project_id: "",
    employee_id: "",
    employee_ids: [],
    task_type_id: "",
    resource_id: "",
    title: "",
    notes: "",
    status: "planned",
    priority: "normal",
  });

  useEffect(() => {
    loadData();
  }, [calendarDate]);

  async function loadData() {
    const monthStart = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    const monthEnd = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0);

    const [projectsResponse, employeesResponse, taskTypesResponse, resourcesResponse, tasksResponse, taskResourcesResponse, taskAssignmentsResponse] = await Promise.all([
      supabase.from("projects").select("*").eq("active", true).order("name"),
      supabase.from("employees").select("*").eq("active", true).order("name"),
      supabase.from("production_task_types").select("*").eq("active", true).order("name"),
      supabase.from("resources").select("*").eq("active", true).order("name"),
      supabase
        .from("production_day_tasks")
        .select(`
          *,
          projects(name, project_code, project_color),
          employee:employees!production_day_tasks_employee_id_fkey(name),
          production_task_types(name, color)
        `)
        .gte("task_date", monthStart.toISOString().slice(0, 10))
        .lte("task_date", monthEnd.toISOString().slice(0, 10))
        .order("task_date", { ascending: true }),
      supabase
        .from("production_task_resources")
        .select("*, resources(name, resource_type, status)"),
      supabase
        .from("production_task_assignments")
        .select("*, employees(name)")
    ]);

    const error =
      projectsResponse.error ||
      employeesResponse.error ||
      taskTypesResponse.error ||
      resourcesResponse.error ||
      tasksResponse.error ||
      taskResourcesResponse.error ||
      taskAssignmentsResponse.error;

    if (error) {
      setMessage(error.message);
      return;
    }

    setProjects(projectsResponse.data || []);
    setEmployees(employeesResponse.data || []);
    setTaskTypes(taskTypesResponse.data || []);
    setResources(resourcesResponse.data || []);
    setDayTasks(tasksResponse.data || []);
    setTaskResources(taskResourcesResponse.data || []);
    setTaskAssignments(taskAssignmentsResponse.data || []);
  }

  function dateToInputValue(date) {
    return date.toISOString().slice(0, 10);
  }

  function sameDay(dateA, dateB) {
    return dateToInputValue(dateA) === dateToInputValue(dateB);
  }

  function monthDays(date) {
    const year = date.getFullYear();
    const month = date.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days = [];
    const firstWeekDay = firstDay.getDay() || 7;

    for (let i = 1; i < firstWeekDay; i += 1) {
      days.push(null);
    }

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
      days.push(new Date(year, month, day));
    }

    return days;
  }

  function previousMonth() {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  }

  function nextMonth() {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  }
  function previousRobotWeek() {
    const next = new Date(robotWeekStart);
    next.setDate(next.getDate() - 7);
    setRobotWeekStart(next);
  }

  function nextRobotWeek() {
    const next = new Date(robotWeekStart);
    next.setDate(next.getDate() + 7);
    setRobotWeekStart(next);
  }

  function currentRobotWeek() {
    const today = new Date();
    const day = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - day + 1);
    setRobotWeekStart(monday);
  }

  function weekDaysFromMonday(mondayDate) {
    return Array.from({ length: 7 }, (_, index) => {
      const item = new Date(mondayDate);
      item.setDate(mondayDate.getDate() + index);
      return item;
    });
  }


  function tasksForDay(day) {
    if (!day) return [];
    const value = dateToInputValue(day);
    return dayTasks.filter((task) => task.task_date === value && taskMatchesEmployeeFilter(task));
  }

  function employeesForTask(taskId) {
    return taskAssignments.filter((row) => row.task_id === taskId);
  }

  function taskEmployeeIds(task) {
    const rows = employeesForTask(task.id);
    if (rows.length > 0) return rows.map((row) => row.employee_id);
    return task.employee_id ? [task.employee_id] : [];
  }

  function taskMatchesEmployeeFilter(task) {
    if (selectedEmployeeFilter === "all") return true;
    if (selectedEmployeeFilter === "unassigned") return taskEmployeeIds(task).length === 0;
    return taskEmployeeIds(task).includes(selectedEmployeeFilter);
  }

  function visibleEmployees() {
    if (selectedEmployeeFilter === "all") return employees;
    if (selectedEmployeeFilter === "unassigned") return [];
    return employees.filter((employee) => employee.id === selectedEmployeeFilter);
  }

  function tasksForEmployeeDay(employeeId, day) {
    if (!day) return [];
    const value = dateToInputValue(day);
    return dayTasks.filter((task) => {
      if (task.task_date !== value) return false;
      return taskEmployeeIds(task).includes(employeeId);
    });
  }

  function unassignedTasksForDay(day) {
    if (!day) return [];
    const value = dateToInputValue(day);
    if (selectedEmployeeFilter !== "all" && selectedEmployeeFilter !== "unassigned") return [];
    return dayTasks.filter((task) => task.task_date === value && taskEmployeeIds(task).length === 0);
  }

  function resourcesForTask(taskId) {
    return taskResources.filter((row) => row.task_id === taskId);
  }

  function taskHasRobot(task) {
    const rows = resourcesForTask(task.id);

    return rows.some((row) => {
      const name = (row.resources?.name || "").toLowerCase();
      const type = (row.resources?.resource_type || "").toLowerCase();

      return name.includes("robot") || name.includes("abb") || type === "robot";
    });
  }

  function robotTasksForDay(day) {
    if (!day) return [];

    const value = dateToInputValue(day);

    return dayTasks.filter((task) => task.task_date === value && taskHasRobot(task));
  }

  function resourceLabel(task) {
    const rows = resourcesForTask(task.id);

    if (rows.length === 0) return "Aucune ressource";

    return rows
      .map((row) => row.resources?.name || "Ressource")
      .join(", ");
  }

  function weekDaysFrom(date) {
    const selected = new Date(date);
    const day = selected.getDay() || 7;
    const monday = new Date(selected);
    monday.setDate(selected.getDate() - day + 1);

    return Array.from({ length: 5 }, (_, index) => {
      const item = new Date(monday);
      item.setDate(monday.getDate() + index);
      return item;
    });
  }

  function openCreateEmployeeTask(employeeId, day) {
    openCreateTask(day);
    setForm((current) => ({ ...current, employee_id: employeeId || "", employee_ids: employeeId ? [employeeId] : [] }));
  }

  async function moveTask(task, patch) {
    const { error } = await supabase
      .from("production_day_tasks")
      .update(patch)
      .eq("id", task.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Tâche déplacée.");
    loadData();
  }

  function openCreateTask(day) {
    const defaultType = taskTypes[0]?.id || "";

    setEditingTask(null);
    setForm({
      task_date: dateToInputValue(day),
      project_id: "",
      employee_id: "",
      employee_ids: [],
      task_type_id: defaultType,
      resource_id: "",
      title: "",
      notes: "",
      status: "planned",
      priority: "normal",
    });
    setModalOpen(true);
  }

  function openEditTask(task) {
    setEditingTask(task);
    setForm({
      task_date: task.task_date || "",
      project_id: task.project_id || "",
      employee_id: task.employee_id || "",
      employee_ids: taskEmployeeIds(task),
      task_type_id: task.task_type_id || "",
      resource_id: taskResources.find((row) => row.task_id === task.id)?.resource_id || "",
      title: task.title || "",
      notes: task.notes || "",
      status: task.status || "planned",
      priority: task.priority || "normal",
    });
    setModalOpen(true);
  }

  async function saveTask() {
    if (!form.task_date) {
      setMessage("Date obligatoire.");
      return;
    }

    if (!form.title) {
      setMessage("Titre / consigne obligatoire.");
      return;
    }

    const payload = {
      task_date: form.task_date,
      project_id: form.project_id || null,
      employee_id: (form.employee_ids?.[0] || form.employee_id) || null,
      task_type_id: form.task_type_id || null,
      title: form.title,
      notes: form.notes || null,
      status: form.status || "planned",
      priority: form.priority || "normal",
      created_by: user?.id || null,
    };

    const request = editingTask
      ? supabase.from("production_day_tasks").update(payload).eq("id", editingTask.id).select().single()
      : supabase.from("production_day_tasks").insert(payload).select().single();

    const { data: savedTask, error } = await request;

    if (error) {
      setMessage(error.message);
      return;
    }

    if (savedTask?.id) {
      await supabase
        .from("production_task_resources")
        .delete()
        .eq("task_id", savedTask.id);

      if (form.resource_id) {
        const { error: resourceError } = await supabase
          .from("production_task_resources")
          .insert({
            task_id: savedTask.id,
            resource_id: form.resource_id,
          });

        if (resourceError) {
          setMessage(resourceError.message);
          return;
        }
      }

      await supabase
        .from("production_task_assignments")
        .delete()
        .eq("task_id", savedTask.id);

      const assignmentRows = (form.employee_ids || []).map((employeeId) => ({
        task_id: savedTask.id,
        employee_id: employeeId,
      }));

      if (assignmentRows.length > 0) {
        const { error: assignmentError } = await supabase
          .from("production_task_assignments")
          .insert(assignmentRows);

        if (assignmentError) {
          setMessage(assignmentError.message);
          return;
        }
      }

      await emitEvent({
        event_type: editingTask ? "PLANNING_TASK_UPDATED" : "PLANNING_TASK_CREATED",
        entity_type: "planning_task",
        entity_id: savedTask.id,
        title: editingTask ? `Tâche modifiée : ${savedTask.title}` : `Tâche créée : ${savedTask.title}`,
        payload: {
          task_date: savedTask.task_date,
          employee_ids: form.employee_ids || [],
          project_id: savedTask.project_id || null,
        },
        user,
      });
    }

    setModalOpen(false);
    setEditingTask(null);
    setMessage(editingTask ? "Tâche modifiée." : "Tâche ajoutée au planning.");
    loadData();
  }

  async function updateTaskStatus(task, status) {
    const { error } = await supabase
      .from("production_day_tasks")
      .update({ status })
      .eq("id", task.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    loadData();
  }

  async function deleteTask(task) {
    const ok = window.confirm(`Supprimer la tâche "${task.title}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("production_day_tasks")
      .delete()
      .eq("id", task.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Tâche supprimée.");
    loadData();
  }

  function taskColor(task) {
    return task.production_task_types?.color || "#111827";
  }

  function projectColor(task) {
    return task.projects?.project_color || "#111827";
  }

  function projectLabel(task) {
    if (!task.projects) return "Hors projet";
    return `${task.projects.project_code ? `${task.projects.project_code} · ` : ""}${task.projects.name}`;
  }

  function statusLabel(value) {
    return STATUSES.find((status) => status.value === value)?.label || value || "-";
  }

  function priorityLabel(value) {
    return PRIORITIES.find((priority) => priority.value === value)?.label || value || "-";
  }

  function employeeLabel(task) {
    const assigned = employeesForTask(task.id);

    if (assigned.length > 0) {
      return assigned.map((row) => row.employees?.name || "Employé").join(", ");
    }

    return task.employee?.name || "Non affecté";
  }

  function toggleEmployee(employeeId) {
    setForm((current) => {
      const currentIds = current.employee_ids || [];
      const nextIds = currentIds.includes(employeeId)
        ? currentIds.filter((id) => id !== employeeId)
        : [...currentIds, employeeId];

      return {
        ...current,
        employee_ids: nextIds,
        employee_id: nextIds[0] || "",
      };
    });
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function dateDiffDays(start, end) {
    const startDate = new Date(dateToInputValue(start));
    const endDate = new Date(dateToInputValue(end));
    return Math.round((endDate - startDate) / 86400000);
  }

  function ganttDays() {
    const start = new Date(robotWeekStart);
    return Array.from({ length: 21 }, (_, index) => addDays(start, index));
  }

  function taskStart(task) {
    return new Date(task.start_date || task.task_date);
  }

  function taskEnd(task) {
    return new Date(task.end_date || task.start_date || task.task_date);
  }

  function ganttTaskStyle(task) {
    const days = ganttDays();
    const rangeStart = days[0];
    const rangeEnd = days[days.length - 1];

    const start = taskStart(task) < rangeStart ? rangeStart : taskStart(task);
    const end = taskEnd(task) > rangeEnd ? rangeEnd : taskEnd(task);

    const startIndex = Math.max(0, dateDiffDays(rangeStart, start));
    const duration = Math.max(1, dateDiffDays(start, end) + 1);

    return {
      gridColumn: `${startIndex + 2} / span ${duration}`,
      borderTopColor: task.projects ? projectColor(task) : taskColor(task),
    };
  }

  async function editTaskDates(task) {
    const start = window.prompt(
      "Date début ? AAAA-MM-JJ",
      task.start_date || task.task_date
    );
    if (start === null) return;

    const end = window.prompt(
      "Date fin ? AAAA-MM-JJ",
      task.end_date || task.start_date || task.task_date
    );
    if (end === null) return;

    const { error } = await supabase
      .from("production_day_tasks")
      .update({
        start_date: start,
        end_date: end,
        task_date: start,
      })
      .eq("id", task.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Dates Gantt modifiées.");
    loadData();
  }

  const visibleDayTasks = dayTasks.filter(taskMatchesEmployeeFilter);

  const ganttProjects = projects
    .map((project) => ({
      ...project,
      tasks: visibleDayTasks
        .filter((task) => task.project_id === project.id)
        .sort((a, b) => new Date(taskStart(a)) - new Date(taskStart(b))),
    }))
    .filter((project) => project.tasks.length > 0);

  const ganttUnassignedTasks = visibleDayTasks.filter((task) => !task.project_id);

  const monthTasks = visibleDayTasks.length;
  const doneTasks = visibleDayTasks.filter((task) => task.status === "done").length;
  const activeTasks = visibleDayTasks.filter((task) => task.status === "in_progress").length;

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Planning</p>
          <h2>Planning production atelier</h2>
          <p>Planifie les projets et les tâches hors projet jour par jour.</p>
        </div>

        <div className="inline-actions">
          <button className="btn small" onClick={previousMonth}>← Mois précédent</button>
          <button className="btn small" onClick={() => setCalendarDate(new Date())}>Aujourd’hui</button>
          <button className="btn small" onClick={nextMonth}>Mois suivant →</button>
        </div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="card planning-employee-filter-card">
        <div>
          <label>Filtrer le planning par employé</label>
          <select
            value={selectedEmployeeFilter}
            onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
          >
            <option value="all">Toutes les tâches</option>
            <option value="unassigned">Tâches non affectées</option>
            {visibleEmployees().map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>

        <div className="planning-filter-actions">
          <button className="btn small" onClick={() => setSelectedEmployeeFilter("all")}>
            Tout voir
          </button>
          <button className="btn small primary" onClick={() => setViewMode("atelier")}>
            Voir par employé
          </button>
        </div>
      </div>



      <div className="stats-grid">
        <div className="stat-card">
          <span>Tâches du mois</span>
          <strong>{monthTasks}</strong>
        </div>

        <div className="stat-card">
          <span>En cours</span>
          <strong>{activeTasks}</strong>
        </div>

        <div className="stat-card accent">
          <span>Terminées</span>
          <strong>{doneTasks}</strong>
        </div>
      </div>

      <div className="card robot-load-card">
        <div className="page-head">
          <div>
            <h3>Charge robot</h3>
            <p>
              Semaine du {robotWeekStart.toLocaleDateString("fr-FR")} —
              jours bloqués par une tâche affectée au Robot ABB.
            </p>
          </div>

          <div className="inline-actions">
            <button className="btn small" onClick={previousRobotWeek}>← Semaine précédente</button>
            <button className="btn small" onClick={currentRobotWeek}>Semaine en cours</button>
            <button className="btn small" onClick={nextRobotWeek}>Semaine suivante →</button>
          </div>
        </div>

        <div className="robot-load-grid robot-load-week">
          {weekDaysFromMonday(robotWeekStart).map((day) => {
            const tasks = robotTasksForDay(day);
            const isToday = sameDay(day, new Date());

            return (
              <div
                className={[
                  "robot-day",
                  tasks.length ? "blocked" : "free",
                  isToday ? "today" : "",
                ].join(" ")}
                key={dateToInputValue(day)}
              >
                <strong>
                  {day.toLocaleDateString("fr-FR", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </strong>

                {tasks.length === 0 ? (
                  <small>Disponible</small>
                ) : (
                  <>
                    <small>{tasks.length} tâche(s) robot</small>
                    {tasks.slice(0, 4).map((task) => (
                      <span key={task.id}>
                        {task.projects?.project_code ? `${task.projects.project_code} · ` : ""}
                        {task.title}
                      </span>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="planning-view-switch">
        <button className={viewMode === "calendar" ? "active" : ""} onClick={() => setViewMode("calendar")}>
          📅 Calendrier
        </button>
        <button className={viewMode === "atelier" ? "active" : ""} onClick={() => setViewMode("atelier")}>
          👷 Vue atelier
        </button>
        <button className={viewMode === "gantt" ? "active" : ""} onClick={() => setViewMode("gantt")}>
          📊 Gantt
        </button>
      </div>

      {viewMode === "calendar" && (
        <div className="card planning-board-card">
          <div className="planning-board-title">
            <h3>{calendarDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h3>

            <div className="planning-legend">
              {taskTypes.slice(0, 8).map((type) => (
                <span key={type.id} style={{ background: `${type.color}22`, color: type.color }}>
                  {type.name}
                </span>
              ))}
            </div>
          </div>

          <div className="production-calendar">
            <div className="production-calendar-head">Lundi</div>
            <div className="production-calendar-head">Mardi</div>
            <div className="production-calendar-head">Mercredi</div>
            <div className="production-calendar-head">Jeudi</div>
            <div className="production-calendar-head">Vendredi</div>
            <div className="production-calendar-head weekend">Samedi</div>
            <div className="production-calendar-head weekend">Dimanche</div>

            {monthDays(calendarDate).map((day, index) => {
              const tasks = tasksForDay(day);
              const today = day && sameDay(day, new Date());

              return (
                <div
                  className={[
                    "production-calendar-day",
                    !day ? "empty" : "",
                    today ? "today" : "",
                  ].join(" ")}
                  key={index}
                >
                  {day && (
                    <>
                      <div className="production-calendar-date">
                        <strong>{day.getDate()}</strong>
                        <button onClick={() => openCreateTask(day)}>+ Tâche</button>
                      </div>

                      <div className="production-calendar-content">
                        {tasks.length === 0 && (
                          <small className="calendar-empty-label">Rien de prévu</small>
                        )}

                        {tasks.map((task) => (
                          <article
                            className={`production-card task-status-${task.status}`}
                            style={{ borderLeftColor: task.projects ? projectColor(task) : taskColor(task) }}
                            key={task.id}
                          >
                            {task.projects && (
                              <div className="project-color-strip" style={{ background: projectColor(task) }} />
                            )}

                            <div>
                              <strong>{task.title}</strong>
                              <span>{projectLabel(task)}</span>
                              <small>
                                {task.production_task_types?.name || "Tâche"} · {employeeLabel(task)}
                              </small>
                              <small>
                                {priorityLabel(task.priority)} · {statusLabel(task.status)}
                              </small>
                              <small>Ressource : {resourceLabel(task)}</small>
                            </div>

                            <div className="production-card-actions">
                              <button onClick={() => updateTaskStatus(task, "in_progress")}>En cours</button>
                              <button onClick={() => updateTaskStatus(task, "done")}>Terminé</button>
                              <button onClick={() => openEditTask(task)}>Modifier</button>
                              <button onClick={() => deleteTask(task)}>Suppr.</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === "atelier" && (
        <div className="card planning-board-card">
          <div className="planning-board-title">
            <h3>Vue atelier — semaine</h3>
            <p>Chaque ligne correspond à un employé. Les cartes reprennent la couleur du projet.</p>
          </div>

          <div className="atelier-week-board">
            <div className="atelier-week-header employee-cell">Employé</div>
            {weekDaysFrom(calendarDate).map((day) => (
              <div className="atelier-week-header" key={dateToInputValue(day)}>
                <strong>{day.toLocaleDateString("fr-FR", { weekday: "short" })}</strong>
                <span>{day.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
              </div>
            ))}

            {employees.map((employee) => (
              <div className="atelier-week-row" key={employee.id}>
                <div className="atelier-employee-name">
                  <strong>{employee.name}</strong>
                  <small>{employee.role || "Employé"}</small>
                </div>

                {weekDaysFrom(calendarDate).map((day) => {
                  const tasks = tasksForEmployeeDay(employee.id, day);

                  return (
                    <div className="atelier-day-cell" key={`${employee.id}-${dateToInputValue(day)}`}>
                      <button className="atelier-add-task" onClick={() => openCreateEmployeeTask(employee.id, day)}>
                        + Ajouter
                      </button>

                      {tasks.map((task) => (
                        <article
                          className={`atelier-task-card task-status-${task.status}`}
                          style={{ borderTopColor: task.projects ? projectColor(task) : taskColor(task) }}
                          key={task.id}
                        >
                          <strong>{task.title}</strong>
                          <span>{projectLabel(task)}</span>
                          <small>{task.production_task_types?.name || "Tâche"} · {statusLabel(task.status)}</small>
                          <small>Ressource : {resourceLabel(task)}</small>

                          <div className="production-card-actions">
                            <button onClick={() => updateTaskStatus(task, "in_progress")}>En cours</button>
                            <button onClick={() => updateTaskStatus(task, "done")}>Terminé</button>
                            <button onClick={() => openEditTask(task)}>Modifier</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}

            {(selectedEmployeeFilter === "all" || selectedEmployeeFilter === "unassigned") && (
            <div className="atelier-week-row">
              <div className="atelier-employee-name">
                <strong>Non affecté</strong>
                <small>Tâches à attribuer</small>
              </div>

              {weekDaysFrom(calendarDate).map((day) => {
                const tasks = unassignedTasksForDay(day);

                return (
                  <div className="atelier-day-cell" key={`unassigned-${dateToInputValue(day)}`}>
                    <button className="atelier-add-task" onClick={() => openCreateEmployeeTask("", day)}>
                      + Ajouter
                    </button>

                    {tasks.map((task) => (
                      <article
                        className={`atelier-task-card task-status-${task.status}`}
                        style={{ borderTopColor: task.projects ? projectColor(task) : taskColor(task) }}
                        key={task.id}
                      >
                        <strong>{task.title}</strong>
                        <span>{projectLabel(task)}</span>
                        <small>{task.production_task_types?.name || "Tâche"} · {statusLabel(task.status)}</small>

                        <div className="production-card-actions">
                          <button onClick={() => openEditTask(task)}>Modifier</button>
                          <button onClick={() => deleteTask(task)}>Suppr.</button>
                        </div>
                      </article>
                    ))}
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </div>
      )}

      {viewMode === "gantt" && (
        <div className="card gantt-card">
          <div className="page-head">
            <div>
              <h3>Gantt production</h3>
              <p>
                Vue 3 semaines à partir du {robotWeekStart.toLocaleDateString("fr-FR")}.
                Modifie les dates d'une tâche pour étirer sa barre.
              </p>
            </div>

            <div className="inline-actions">
              <button className="btn small" onClick={previousRobotWeek}>← 3 semaines avant</button>
              <button className="btn small" onClick={currentRobotWeek}>Aujourd’hui</button>
              <button className="btn small" onClick={nextRobotWeek}>3 semaines après →</button>
            </div>
          </div>

          <div className="gantt-scroll">
            <div className="gantt-grid gantt-header-row">
              <div className="gantt-project-label">Projet / tâche</div>
              {ganttDays().map((day) => (
                <div
                  className={sameDay(day, new Date()) ? "gantt-day today" : "gantt-day"}
                  key={dateToInputValue(day)}
                >
                  <strong>{day.toLocaleDateString("fr-FR", { weekday: "short" })}</strong>
                  <span>{day.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
                </div>
              ))}
            </div>

            {ganttProjects.length === 0 && ganttUnassignedTasks.length === 0 ? (
              <p>Aucune tâche planifiée pour cette période.</p>
            ) : (
              <>
                {ganttProjects.map((project) => (
                  <div className="gantt-project-block" key={project.id}>
                    <div className="gantt-project-title">
                      <span style={{ background: project.project_color || "#111827" }} />
                      <strong>
                        {project.project_code ? `${project.project_code} - ` : ""}
                        {project.name}
                      </strong>
                    </div>

                    {project.tasks.map((task) => (
                      <div className="gantt-grid gantt-task-row" key={task.id}>
                        <div className="gantt-task-label">
                          <strong>{task.title}</strong>
                          <small>
                            {task.production_task_types?.name || "Tâche"} · {employeeLabel(task)} · {statusLabel(task.status)}
                          </small>
                        </div>

                        <button
                          className={`gantt-bar task-status-${task.status}`}
                          style={ganttTaskStyle(task)}
                          onClick={() => editTaskDates(task)}
                          title="Cliquer pour modifier les dates"
                        >
                          {task.title}
                        </button>
                      </div>
                    ))}
                  </div>
                ))}

                {ganttUnassignedTasks.length > 0 && (
                  <div className="gantt-project-block">
                    <div className="gantt-project-title">
                      <span style={{ background: "#64748b" }} />
                      <strong>Hors projet</strong>
                    </div>

                    {ganttUnassignedTasks.map((task) => (
                      <div className="gantt-grid gantt-task-row" key={task.id}>
                        <div className="gantt-task-label">
                          <strong>{task.title}</strong>
                          <small>
                            {task.production_task_types?.name || "Tâche"} · {employeeLabel(task)} · {statusLabel(task.status)}
                          </small>
                        </div>

                        <button
                          className={`gantt-bar task-status-${task.status}`}
                          style={ganttTaskStyle(task)}
                          onClick={() => editTaskDates(task)}
                          title="Cliquer pour modifier les dates"
                        >
                          {task.title}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop">
          <div className="planning-task-modal">
            <div className="page-head">
              <div>
                <p className="eyebrow">Planning atelier</p>
                <h3>{editingTask ? "Modifier la tâche" : "Nouvelle tâche"}</h3>
              </div>

              <button className="btn small" onClick={() => setModalOpen(false)}>
                Fermer
              </button>
            </div>

            <div className="grid">
              <div>
                <label>Date</label>
                <input
                  type="date"
                  value={form.task_date}
                  onChange={(e) => setForm({ ...form, task_date: e.target.value })}
                />
              </div>

              <div>
                <label>Projet optionnel</label>
                <select
                  value={form.project_id}
                  onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                >
                  <option value="">Hors projet</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.project_code ? `${project.project_code} - ` : ""}
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Type de tâche</label>
                <select
                  value={form.task_type_id}
                  onChange={(e) => setForm({ ...form, task_type_id: e.target.value })}
                >
                  <option value="">Non défini</option>
                  {taskTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Ressource principale</label>
                <select
                  value={form.resource_id}
                  onChange={(e) => setForm({ ...form, resource_id: e.target.value })}
                >
                  <option value="">Aucune ressource</option>
                  {resources.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name} · {resource.resource_type}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <div className="planning-assignees-head">
                  <label>Employés affectés</label>
                  <strong>{(form.employee_ids || []).length} personne(s) sélectionnée(s)</strong>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => setForm({ ...form, employee_ids: employees.map((employee) => employee.id), employee_id: employees[0]?.id || "" })}
                  >
                    Tout sélectionner
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => setForm({ ...form, employee_ids: [], employee_id: "" })}
                  >
                    Vider
                  </button>
                </div>

                <div className="planning-employee-checklist">
                  {employees.map((employee) => (
                    <label
                      key={employee.id}
                      className={(form.employee_ids || []).includes(employee.id) ? "selected" : ""}
                    >
                      <input
                        type="checkbox"
                        checked={(form.employee_ids || []).includes(employee.id)}
                        onChange={() => toggleEmployee(employee.id)}
                      />
                      <span>{employee.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label>Priorité</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Statut</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label>Tâche / consigne</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex : Impression modules 1 à 4, nettoyage atelier, maintenance robot..."
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label>Détails attendus</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Consignes, ordre de priorité, points de vigilance..."
                  rows="4"
                />
              </div>
            </div>

            <div className="planning-modal-actions">
              <button className="btn secondary" onClick={() => setModalOpen(false)}>
                Annuler
              </button>
              <button className="btn primary" onClick={saveTask}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
