import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";
import { canAccess } from "../services/permissions.js";

const PRIORITIES = [
  { value: "low", label: "Basse" },
  { value: "normal", label: "Normale" },
  { value: "high", label: "Haute" },
  { value: "critical", label: "Critique" },
];

export default function WeeklyPoints({ user, permissions }) {
  const [topics, setTopics] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("open");

  const [topicForm, setTopicForm] = useState({
    title: "",
    description: "",
    priority: "normal",
    week_date: new Date().toISOString().slice(0, 10),
  });

  const [taskForm, setTaskForm] = useState({
    topic_id: "",
    title: "",
    description: "",
    assigned_to: "",
    due_date: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  function can(action) {
    return canAccess(user, permissions, "weekly", action);
  }

  async function loadData() {
    const [topicsResponse, tasksResponse, employeesResponse] = await Promise.all([
      supabase
        .from("weekly_topics")
        .select("*")
        .eq("active", true)
        .order("week_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("weekly_tasks")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("employees")
        .select("*")
        .eq("active", true)
        .order("name"),
    ]);

    const error = topicsResponse.error || tasksResponse.error || employeesResponse.error;

    if (error) {
      setMessage(error.message);
      return;
    }

    setTopics(topicsResponse.data || []);
    setTasks(tasksResponse.data || []);
    setEmployees(employeesResponse.data || []);
  }

  function employeeName(id) {
    return employees.find((employee) => employee.id === id)?.name || "Non assigné";
  }

  function topicTasks(topicId) {
    return tasks.filter((task) => task.topic_id === topicId);
  }

  function openTasks(topicId) {
    return topicTasks(topicId).filter((task) => task.status !== "done");
  }

  function statusLabel(status) {
    const labels = {
      open: "À traiter",
      in_progress: "En cours",
      done: "Traité",
      todo: "À faire",
    };

    return labels[status] || status;
  }

  const filteredTopics = useMemo(() => {
    if (filter === "all") return topics;
    return topics.filter((topic) => topic.status === filter);
  }, [topics, filter]);

  const todoTasks = tasks.filter((task) => task.status !== "done");
  const myTasks = todoTasks.filter((task) => task.assigned_to === user?.id);

  async function createTopic(e) {
    e.preventDefault();

    if (!can("can_create")) {
      setMessage("Action non autorisée.");
      return;
    }

    if (!topicForm.title) {
      setMessage("Sujet obligatoire.");
      return;
    }

    const { error } = await supabase.from("weekly_topics").insert({
      title: topicForm.title,
      description: topicForm.description || null,
      priority: topicForm.priority || "normal",
      week_date: topicForm.week_date || new Date().toISOString().slice(0, 10),
      status: "open",
      created_by: user?.id || null,
      active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setTopicForm({
      title: "",
      description: "",
      priority: "normal",
      week_date: new Date().toISOString().slice(0, 10),
    });

    setMessage("Sujet ajouté au point hebdo.");
    await loadData();
  }

  async function updateTopicStatus(topic, status) {
    if (!can("can_edit") && status !== "done") {
      setMessage("Action non autorisée.");
      return;
    }

    const patch = {
      status,
      validated_by: status === "done" ? user?.id || null : null,
      validated_at: status === "done" ? new Date().toISOString() : null,
    };

    const { error } = await supabase
      .from("weekly_topics")
      .update(patch)
      .eq("id", topic.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(status === "done" ? "Sujet traité." : "Statut modifié.");
    await loadData();
  }

  async function archiveTopic(topic) {
    if (!can("can_archive") && !can("can_delete")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(`Archiver le sujet "${topic.title}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("weekly_topics")
      .update({ active: false })
      .eq("id", topic.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Sujet archivé.");
    await loadData();
  }

  async function createTask(e) {
    e.preventDefault();

    if (!can("can_create")) {
      setMessage("Action non autorisée.");
      return;
    }

    if (!taskForm.topic_id || !taskForm.title) {
      setMessage("Sujet et tâche obligatoires.");
      return;
    }

    const { error } = await supabase.from("weekly_tasks").insert({
      topic_id: taskForm.topic_id,
      title: taskForm.title,
      description: taskForm.description || null,
      assigned_to: taskForm.assigned_to || null,
      due_date: taskForm.due_date || null,
      status: "todo",
      created_by: user?.id || null,
      active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await supabase
      .from("weekly_topics")
      .update({ status: "in_progress" })
      .eq("id", taskForm.topic_id)
      .neq("status", "done");

    setTaskForm({
      topic_id: "",
      title: "",
      description: "",
      assigned_to: "",
      due_date: "",
    });

    setMessage("Tâche assignée.");
    await loadData();
  }

  async function completeTask(task) {
    const isAssignedUser = task.assigned_to === user?.id;

    if (!isAssignedUser && !can("can_validate")) {
      setMessage("Seule la personne assignée ou un admin peut valider cette tâche.");
      return;
    }

    const { error } = await supabase
      .from("weekly_tasks")
      .update({
        status: "done",
        completed_by: user?.id || null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    const remainingTasks = tasks.filter(
      (item) => item.topic_id === task.topic_id && item.id !== task.id && item.status !== "done"
    );

    if (remainingTasks.length === 0) {
      await supabase
        .from("weekly_topics")
        .update({
          status: "done",
          validated_by: user?.id || null,
          validated_at: new Date().toISOString(),
        })
        .eq("id", task.topic_id);
    }

    setMessage("Tâche validée.");
    await loadData();
  }

  async function reopenTask(task) {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const { error } = await supabase
      .from("weekly_tasks")
      .update({
        status: "todo",
        completed_by: null,
        completed_at: null,
      })
      .eq("id", task.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await supabase
      .from("weekly_topics")
      .update({ status: "in_progress", validated_by: null, validated_at: null })
      .eq("id", task.topic_id);

    setMessage("Tâche rouverte.");
    await loadData();
  }

  async function deleteTask(task) {
    if (!can("can_delete")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(`Supprimer la tâche "${task.title}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("weekly_tasks")
      .update({ active: false })
      .eq("id", task.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Tâche supprimée.");
    await loadData();
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Pilotage</p>
          <h2>Points hebdomadaires</h2>
          <p>Sujets à traiter, décisions, tâches assignées et validation par les responsables.</p>
        </div>

        <button className="btn secondary" onClick={loadData}>Actualiser</button>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="stats-grid">
        <div className="stat-card accent">
          <span>Sujets ouverts</span>
          <strong>{topics.filter((topic) => topic.status !== "done").length}</strong>
        </div>

        <div className="stat-card">
          <span>Tâches en cours</span>
          <strong>{todoTasks.length}</strong>
        </div>

        <div className="stat-card accent">
          <span>Mes tâches</span>
          <strong>{myTasks.length}</strong>
        </div>

        <div className="stat-card">
          <span>Sujets traités</span>
          <strong>{topics.filter((topic) => topic.status === "done").length}</strong>
        </div>
      </div>

      <div className="card weekly-global-tasks">
        <div className="page-head">
          <div>
            <h3>Vue globale des tâches</h3>
            <p>Toutes les tâches assignées, visibles par responsable et statut.</p>
          </div>
        </div>

        <div className="weekly-global-task-grid">
          {tasks.filter((task) => task.status !== "done").length === 0 ? (
            <p>Aucune tâche en attente.</p>
          ) : (
            tasks.filter((task) => task.status !== "done").map((task) => (
              <div className={`weekly-global-task-card ${task.due_date && String(task.due_date) < new Date().toISOString().slice(0, 10) ? "late" : ""}`} key={task.id}>
                <strong>❌ {task.title}</strong>
                <small>{employeeName(task.assigned_to)}</small>
                <small>{topics.find((topic) => topic.id === task.topic_id)?.title || "Point hebdo"}</small>
                {task.due_date && <small>Échéance : {task.due_date}</small>}
                <button className="btn small primary" onClick={() => completeTask(task)}>✅ Valider</button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="weekly-layout">
        <div className="card">
          <h3>Ajouter un sujet</h3>

          <form className="weekly-topic-form" onSubmit={createTopic}>
            <div>
              <label>Sujet</label>
              <input
                value={topicForm.title}
                onChange={(e) => setTopicForm({ ...topicForm, title: e.target.value })}
                placeholder="Ex : relance CASA, SAV banc, recrutement..."
              />
            </div>

            <div>
              <label>Semaine</label>
              <input
                type="date"
                value={topicForm.week_date}
                onChange={(e) => setTopicForm({ ...topicForm, week_date: e.target.value })}
              />
            </div>

            <div>
              <label>Priorité</label>
              <select
                value={topicForm.priority}
                onChange={(e) => setTopicForm({ ...topicForm, priority: e.target.value })}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority.value} value={priority.value}>{priority.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label>Description</label>
              <input
                value={topicForm.description}
                onChange={(e) => setTopicForm({ ...topicForm, description: e.target.value })}
              />
            </div>

            <button className="btn primary">Ajouter</button>
          </form>
        </div>

        <div className="card">
          <h3>Assigner une tâche</h3>

          <form className="weekly-task-form" onSubmit={createTask}>
            <div>
              <label>Sujet lié</label>
              <select
                value={taskForm.topic_id}
                onChange={(e) => setTaskForm({ ...taskForm, topic_id: e.target.value })}
              >
                <option value="">Choisir</option>
                {topics.filter((topic) => topic.status !== "done").map((topic) => (
                  <option key={topic.id} value={topic.id}>{topic.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label>Tâche</label>
              <input
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="Ex : rappeler M. Martin"
              />
            </div>

            <div>
              <label>Assignée à</label>
              <select
                value={taskForm.assigned_to}
                onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
              >
                <option value="">Non assignée</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label>Échéance</label>
              <input
                type="date"
                value={taskForm.due_date}
                onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
              />
            </div>

            <div>
              <label>Détail</label>
              <input
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              />
            </div>

            <button className="btn primary">Assigner</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="page-head">
          <div>
            <h3>Sujets du point hebdo</h3>
            <p>Un sujet peut être validé directement, ou automatiquement lorsque toutes ses tâches sont réalisées.</p>
          </div>

          <div className="planning-filters">
            <button className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>Ouverts</button>
            <button className={filter === "in_progress" ? "active" : ""} onClick={() => setFilter("in_progress")}>En cours</button>
            <button className={filter === "done" ? "active" : ""} onClick={() => setFilter("done")}>Traités</button>
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Tous</button>
          </div>
        </div>

        <div className="weekly-topic-list">
          {filteredTopics.length === 0 ? (
            <p>Aucun sujet.</p>
          ) : (
            filteredTopics.map((topic) => {
              const linkedTasks = topicTasks(topic.id);
              const remaining = openTasks(topic.id);

              return (
                <div className={`weekly-topic-card ${topic.status}`} key={topic.id}>
                  <div className="weekly-topic-head">
                    <div>
                      <strong>{topic.title}</strong>
                      <small>
                        Semaine du {topic.week_date || "-"} · {statusLabel(topic.status)} · priorité {topic.priority}
                      </small>
                      {topic.description && <p>{topic.description}</p>}
                    </div>

                    <div className="inline-actions">
                      {topic.status !== "done" && (
                        <>
                          <button className="btn small" onClick={() => updateTopicStatus(topic, "in_progress")}>En cours</button>
                          <button className="btn small primary" onClick={() => updateTopicStatus(topic, "done")}>Sujet traité</button>
                        </>
                      )}

                      <button className="btn small danger-soft" onClick={() => archiveTopic(topic)}>Archiver</button>
                    </div>
                  </div>

                  <div className="weekly-task-list">
                    {linkedTasks.length === 0 ? (
                      <p>Aucune tâche assignée.</p>
                    ) : (
                      linkedTasks.map((task) => (
                        <div className={`weekly-task-row ${task.status} ${task.due_date && task.status !== "done" && String(task.due_date) < new Date().toISOString().slice(0, 10) ? "late" : ""}`} key={task.id}>
                          <div>
                            <strong>{task.status === "done" ? "✅ " : "❌ "}{task.title}</strong>
                            <small>
                              Assignée à {employeeName(task.assigned_to)}
                              {task.due_date ? ` · échéance ${task.due_date}` : ""}
                              {task.status === "done" ? ` · réalisée par ${employeeName(task.completed_by)}` : ""}
                            </small>
                            {task.description && <p>{task.description}</p>}
                          </div>

                          <div className="inline-actions">
                            {task.status !== "done" ? (
                              <button className="btn small primary" onClick={() => completeTask(task)}>Valider</button>
                            ) : (
                              <button className="btn small" onClick={() => reopenTask(task)}>Rouvrir</button>
                            )}

                            <button className="btn small danger-soft" onClick={() => deleteTask(task)}>Supprimer</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {remaining.length === 0 && linkedTasks.length > 0 && topic.status !== "done" && (
                    <div className="alert success">Toutes les tâches sont terminées. Le sujet peut être validé.</div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
