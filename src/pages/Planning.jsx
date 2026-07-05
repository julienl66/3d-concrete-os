import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";

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
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [taskTypes, setTaskTypes] = useState([]);
  const [dayTasks, setDayTasks] = useState([]);
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState("calendar");
  const [editingTask, setEditingTask] = useState(null);

  const [form, setForm] = useState({
    task_date: "",
    project_id: "",
    employee_id: "",
    task_type_id: "",
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

    const [projectsResponse, employeesResponse, taskTypesResponse, tasksResponse] = await Promise.all([
      supabase.from("projects").select("*").eq("active", true).order("name"),
      supabase.from("employees").select("*").eq("active", true).order("name"),
      supabase.from("production_task_types").select("*").eq("active", true).order("name"),
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
    ]);

    const error =
      projectsResponse.error ||
      employeesResponse.error ||
      taskTypesResponse.error ||
      tasksResponse.error;

    if (error) {
      setMessage(error.message);
      return;
    }

    setProjects(projectsResponse.data || []);
    setEmployees(employeesResponse.data || []);
    setTaskTypes(taskTypesResponse.data || []);
    setDayTasks(tasksResponse.data || []);
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

  function tasksForDay(day) {
    if (!day) return [];
    const value = dateToInputValue(day);
    return dayTasks.filter((task) => task.task_date === value);
  }

  function tasksForEmployeeDay(employeeId, day) {
    if (!day) return [];
    const value = dateToInputValue(day);
    return dayTasks.filter((task) => task.task_date === value && task.employee_id === employeeId);
  }

  function unassignedTasksForDay(day) {
    if (!day) return [];
    const value = dateToInputValue(day);
    return dayTasks.filter((task) => task.task_date === value && !task.employee_id);
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
    setForm((current) => ({ ...current, employee_id: employeeId || "" }));
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
      task_type_id: defaultType,
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
      task_type_id: task.task_type_id || "",
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
      employee_id: form.employee_id || null,
      task_type_id: form.task_type_id || null,
      title: form.title,
      notes: form.notes || null,
      status: form.status || "planned",
      priority: form.priority || "normal",
      created_by: user?.id || null,
    };

    const request = editingTask
      ? supabase.from("production_day_tasks").update(payload).eq("id", editingTask.id)
      : supabase.from("production_day_tasks").insert(payload);

    const { error } = await request;

    if (error) {
      setMessage(error.message);
      return;
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
    return task.employee?.name || "Non affecté";
  }

  const monthTasks = dayTasks.length;
  const doneTasks = dayTasks.filter((task) => task.status === "done").length;
  const activeTasks = dayTasks.filter((task) => task.status === "in_progress").length;

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

      <div className="planning-view-switch">
        <button className={viewMode === "calendar" ? "active" : ""} onClick={() => setViewMode("calendar")}>
          📅 Calendrier
        </button>
        <button className={viewMode === "atelier" ? "active" : ""} onClick={() => setViewMode("atelier")}>
          👷 Vue atelier
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
                <label>Employé affecté</label>
                <select
                  value={form.employee_id}
                  onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                >
                  <option value="">Non affecté</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
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
