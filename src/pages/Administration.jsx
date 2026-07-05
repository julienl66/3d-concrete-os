import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";

export default function Administration({ user }) {
  const [activities, setActivities] = useState([]);
  const [stockCategories, setStockCategories] = useState([]);
  const [taskTypes, setTaskTypes] = useState([]);
  const [message, setMessage] = useState("");

  const [activityForm, setActivityForm] = useState({
    name: "",
    color: "#2563eb",
  });

  const [stockCategoryName, setStockCategoryName] = useState("");

  const [taskTypeForm, setTaskTypeForm] = useState({
    name: "",
    color: "#2563eb",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    await Promise.all([loadActivities(), loadStockCategories(), loadTaskTypes()]);
  }

  async function loadActivities() {
    const { data, error } = await supabase
      .from("work_activities")
      .select("*")
      .eq("active", true)
      .order("name");

    if (error) {
      setMessage(error.message);
      return;
    }

    setActivities(data || []);
  }

  async function loadStockCategories() {
    const { data, error } = await supabase
      .from("stock_categories")
      .select("*")
      .eq("active", true)
      .order("name");

    if (error) {
      setMessage(error.message);
      return;
    }

    setStockCategories(data || []);
  }

  async function createActivity(e) {
    e.preventDefault();

    if (!activityForm.name) {
      setMessage("Nom de l'activité obligatoire.");
      return;
    }

    const { error } = await supabase.from("work_activities").insert({
      name: activityForm.name,
      color: activityForm.color || "#2563eb",
      active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setActivityForm({
      name: "",
      color: "#2563eb",
    });

    setMessage("Activité ajoutée.");
    loadActivities();
  }

  async function renameActivity(activity) {
    const name = window.prompt("Nouveau nom de l'activité ?", activity.name);
    if (name === null) return;

    const { error } = await supabase
      .from("work_activities")
      .update({ name })
      .eq("id", activity.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Activité modifiée.");
    loadActivities();
  }

  async function changeActivityColor(activity) {
    const color = window.prompt("Couleur HEX ?", activity.color || "#2563eb");
    if (color === null) return;

    const { error } = await supabase
      .from("work_activities")
      .update({ color })
      .eq("id", activity.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Couleur modifiée.");
    loadActivities();
  }

  async function deleteActivity(activity) {
    const ok = window.confirm(
      `Supprimer l'activité "${activity.name}" ? Les anciens pointages resteront en base.`
    );

    if (!ok) return;

    const { error } = await supabase
      .from("work_activities")
      .update({ active: false })
      .eq("id", activity.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Activité supprimée.");
    loadActivities();
  }

  async function createStockCategory(e) {
    e.preventDefault();

    if (!stockCategoryName) {
      setMessage("Nom de sous-catégorie obligatoire.");
      return;
    }

    const { error } = await supabase.from("stock_categories").insert({
      name: stockCategoryName,
      active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setStockCategoryName("");
    setMessage("Sous-catégorie stock ajoutée.");
    loadStockCategories();
  }

  async function renameStockCategory(category) {
    const name = window.prompt("Nouveau nom de la sous-catégorie ?", category.name);
    if (name === null) return;

    const { error } = await supabase
      .from("stock_categories")
      .update({ name })
      .eq("id", category.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Sous-catégorie modifiée.");
    loadStockCategories();
  }

  async function deleteStockCategory(category) {
    const ok = window.confirm(
      `Supprimer la sous-catégorie "${category.name}" ? Les articles liés passeront sans sous-catégorie.`
    );

    if (!ok) return;

    const { error: unlinkError } = await supabase
      .from("stock_items")
      .update({ category_id: null })
      .eq("category_id", category.id);

    if (unlinkError) {
      setMessage(unlinkError.message);
      return;
    }

    const { error } = await supabase
      .from("stock_categories")
      .update({ active: false })
      .eq("id", category.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Sous-catégorie supprimée.");
    loadStockCategories();
  }

  async function loadTaskTypes() {
    const { data, error } = await supabase
      .from("production_task_types")
      .select("*")
      .eq("active", true)
      .order("name");

    if (error) {
      setMessage(error.message);
      return;
    }

    setTaskTypes(data || []);
  }

  async function createTaskType(e) {
    e.preventDefault();

    if (!taskTypeForm.name) {
      setMessage("Nom de tâche obligatoire.");
      return;
    }

    const { error } = await supabase.from("production_task_types").insert({
      name: taskTypeForm.name,
      color: taskTypeForm.color || "#2563eb",
      active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setTaskTypeForm({
      name: "",
      color: "#2563eb",
    });

    setMessage("Type de tâche ajouté.");
    loadTaskTypes();
  }

  async function renameTaskType(taskType) {
    const name = window.prompt("Nouveau nom du type de tâche ?", taskType.name);
    if (name === null) return;

    const { error } = await supabase
      .from("production_task_types")
      .update({ name })
      .eq("id", taskType.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Type de tâche modifié.");
    loadTaskTypes();
  }

  async function changeTaskTypeColor(taskType) {
    const color = window.prompt("Couleur HEX ?", taskType.color || "#2563eb");
    if (color === null) return;

    const { error } = await supabase
      .from("production_task_types")
      .update({ color })
      .eq("id", taskType.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Couleur modifiée.");
    loadTaskTypes();
  }

  async function deleteTaskType(taskType) {
    const ok = window.confirm(
      `Supprimer le type de tâche "${taskType.name}" ? Les anciennes tâches conserveront leur historique.`
    );

    if (!ok) return;

    const { error } = await supabase
      .from("production_task_types")
      .update({ active: false })
      .eq("id", taskType.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Type de tâche supprimé.");
    loadTaskTypes();
  }

  if (user?.role !== "admin") {
    return (
      <section className="page">
        <div className="card">
          <h2>Accès refusé</h2>
          <p>Cette page est réservée aux administrateurs.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Paramètres ERP</h2>
          <p>Gère les listes utilisées dans le logiciel sans passer par Supabase.</p>
        </div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="stats-grid">
        <div className="stat-card">
          <span>Activités pointage</span>
          <strong>{activities.length}</strong>
        </div>

        <div className="stat-card accent">
          <span>Sous-catégories stock</span>
          <strong>{stockCategories.length}</strong>
        </div>

        <div className="stat-card">
          <span>Types de tâches planning</span>
          <strong>{taskTypes.length}</strong>
        </div>
      </div>

      <div className="admin-grid">
        <div className="card">
          <h3>Activités de pointage</h3>

          <form onSubmit={createActivity} className="admin-inline-form">
            <input
              value={activityForm.name}
              onChange={(e) =>
                setActivityForm({ ...activityForm, name: e.target.value })
              }
              placeholder="Ex : Nettoyage atelier"
            />

            <input
              type="color"
              value={activityForm.color}
              onChange={(e) =>
                setActivityForm({ ...activityForm, color: e.target.value })
              }
            />

            <button className="btn primary">Ajouter</button>
          </form>

          <div className="admin-list">
            {activities.map((activity) => (
              <div className="admin-row" key={activity.id}>
                <div>
                  <span
                    className="admin-color-dot"
                    style={{ background: activity.color || "#2563eb" }}
                  />
                  <strong>{activity.name}</strong>
                </div>

                <div className="inline-actions">
                  <button className="btn small" onClick={() => renameActivity(activity)}>
                    Renommer
                  </button>

                  <button className="btn small" onClick={() => changeActivityColor(activity)}>
                    Couleur
                  </button>

                  <button className="btn small danger-soft" onClick={() => deleteActivity(activity)}>
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Types de tâches planning</h3>

          <form onSubmit={createTaskType} className="admin-inline-form">
            <input
              value={taskTypeForm.name}
              onChange={(e) =>
                setTaskTypeForm({ ...taskTypeForm, name: e.target.value })
              }
              placeholder="Ex : Découpe, collage, reprise impression..."
            />

            <input
              type="color"
              value={taskTypeForm.color}
              onChange={(e) =>
                setTaskTypeForm({ ...taskTypeForm, color: e.target.value })
              }
            />

            <button className="btn primary">Ajouter</button>
          </form>

          <div className="admin-list">
            {taskTypes.map((taskType) => (
              <div className="admin-row" key={taskType.id}>
                <div>
                  <span
                    className="admin-color-dot"
                    style={{ background: taskType.color || "#2563eb" }}
                  />
                  <strong>{taskType.name}</strong>
                </div>

                <div className="inline-actions">
                  <button className="btn small" onClick={() => renameTaskType(taskType)}>
                    Renommer
                  </button>

                  <button className="btn small" onClick={() => changeTaskTypeColor(taskType)}>
                    Couleur
                  </button>

                  <button className="btn small danger-soft" onClick={() => deleteTaskType(taskType)}>
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Sous-catégories de stock</h3>

          <form onSubmit={createStockCategory} className="admin-inline-form">
            <input
              value={stockCategoryName}
              onChange={(e) => setStockCategoryName(e.target.value)}
              placeholder="Ex : Fibres, Ciments, Outillage..."
            />

            <button className="btn primary">Ajouter</button>
          </form>

          <div className="admin-list">
            {stockCategories.map((category) => (
              <div className="admin-row" key={category.id}>
                <div>
                  <strong>{category.name}</strong>
                </div>

                <div className="inline-actions">
                  <button className="btn small" onClick={() => renameStockCategory(category)}>
                    Renommer
                  </button>

                  <button className="btn small danger-soft" onClick={() => deleteStockCategory(category)}>
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
