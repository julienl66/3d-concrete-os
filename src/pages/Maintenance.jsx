import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";
import { maintenanceOccurrences, recurrenceLabel } from "../services/maintenance.js";

const EMPTY_FORM = {
  title: "",
  equipment: "",
  description: "",
  scheduled_date: "",
  start_time: "08:00",
  end_time: "09:00",
  assigned_employee_id: "",
  priority: "normal",
  recurrence_type: "none",
  recurrence_interval: 1,
  recurrence_end_date: "",
};

const PRIORITIES = [
  ["low", "Basse"],
  ["normal", "Normale"],
  ["high", "Haute"],
  ["urgent", "Urgente"],
];

export default function Maintenance() {
  const [activities, setActivities] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [activitiesRes, completionsRes, employeesRes] = await Promise.all([
      supabase.from("maintenance_activities").select("*").eq("active", true).order("scheduled_date"),
      supabase.from("maintenance_completions").select("*").order("occurrence_date", { ascending: false }),
      supabase.from("employees").select("id, name").eq("active", true).order("name"),
    ]);

    const error = activitiesRes.error || completionsRes.error || employeesRes.error;
    if (error) {
      setMessage(error.message);
      return;
    }
    setActivities(activitiesRes.data || []);
    setCompletions(completionsRes.data || []);
    setEmployees(employeesRes.data || []);
  }

  function employeeName(id) {
    return employees.find((employee) => String(employee.id) === String(id))?.name || "Non attribuée";
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  async function saveActivity(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.scheduled_date) {
      setMessage("Le titre et la première date sont obligatoires.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      equipment: form.equipment.trim() || null,
      description: form.description.trim() || null,
      scheduled_date: form.scheduled_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      assigned_employee_id: form.assigned_employee_id || null,
      priority: form.priority,
      recurrence_type: form.recurrence_type,
      recurrence_interval: Math.max(1, Number(form.recurrence_interval || 1)),
      recurrence_end_date: form.recurrence_type === "none" ? null : form.recurrence_end_date || null,
      active: true,
      updated_at: new Date().toISOString(),
    };

    const query = editingId
      ? supabase.from("maintenance_activities").update(payload).eq("id", editingId)
      : supabase.from("maintenance_activities").insert(payload);
    const { error } = await query;

    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(editingId ? "Maintenance mise à jour." : "Maintenance planifiée.");
    resetForm();
    await loadData();
  }

  function editActivity(activity) {
    setEditingId(activity.id);
    setForm({
      title: activity.title || "",
      equipment: activity.equipment || "",
      description: activity.description || "",
      scheduled_date: activity.scheduled_date || "",
      start_time: activity.start_time || "08:00",
      end_time: activity.end_time || "09:00",
      assigned_employee_id: activity.assigned_employee_id || "",
      priority: activity.priority || "normal",
      recurrence_type: activity.recurrence_type || "none",
      recurrence_interval: activity.recurrence_interval || 1,
      recurrence_end_date: activity.recurrence_end_date || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function archiveActivity(activity) {
    if (!window.confirm(`Archiver « ${activity.title} » ?`)) return;
    const { error } = await supabase
      .from("maintenance_activities")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", activity.id);
    if (error) return setMessage(error.message);
    await loadData();
  }

  async function completeOccurrence(activity, occurrenceDate) {
    const existing = completions.find(
      (row) => String(row.activity_id) === String(activity.id) && row.occurrence_date === occurrenceDate
    );
    if (existing) return;

    const notes = window.prompt("Compte-rendu / note de maintenance (facultatif) :", "");
    if (notes === null) return;

    const { error } = await supabase.from("maintenance_completions").insert({
      activity_id: activity.id,
      occurrence_date: occurrenceDate,
      completed_at: new Date().toISOString(),
      notes: notes || null,
    });
    if (error) return setMessage(error.message);
    setMessage("Maintenance marquée comme réalisée.");
    await loadData();
  }

  const upcoming = useMemo(() => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 90);
    const startYmd = today.toISOString().slice(0, 10);
    const endYmd = end.toISOString().slice(0, 10);

    return activities
      .flatMap((activity) =>
        maintenanceOccurrences(activity, startYmd, endYmd).map((date) => ({ activity, date }))
      )
      .filter(({ activity, date }) =>
        !completions.some(
          (row) => String(row.activity_id) === String(activity.id) && row.occurrence_date === date
        )
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [activities, completions]);

  return (
    <section className="page maintenance-page">
      <div className="page-head">
        <div>
          <h2>Maintenance</h2>
          <p>Planifie les entretiens ponctuels ou récurrents. Ils remontent automatiquement dans le Planning et le Dashboard.</p>
        </div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <form className="card maintenance-form" onSubmit={saveActivity}>
        <div className="page-head">
          <div>
            <h3>{editingId ? "Modifier la maintenance" : "Nouvelle activité de maintenance"}</h3>
            <p>Le sujet peut concerner une machine, un véhicule, le bâtiment ou tout autre équipement.</p>
          </div>
          {editingId && <button type="button" className="btn secondary" onClick={resetForm}>Annuler</button>}
        </div>

        <div className="maintenance-form-grid">
          <label>Titre<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex. Graissage robot ABB" /></label>
          <label>Équipement / zone<input value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} placeholder="Robot, compresseur, véhicule..." /></label>
          <label>Première date<input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} /></label>
          <label>Attribuée à<select value={form.assigned_employee_id} onChange={(e) => setForm({ ...form, assigned_employee_id: e.target.value })}><option value="">Non attribuée</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
          <label>Début<input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></label>
          <label>Fin<input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></label>
          <label>Priorité<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{PRIORITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Récurrence<select value={form.recurrence_type} onChange={(e) => setForm({ ...form, recurrence_type: e.target.value })}><option value="none">Aucune</option><option value="daily">Journalière</option><option value="weekly">Hebdomadaire</option><option value="monthly">Mensuelle</option><option value="yearly">Annuelle</option></select></label>
          {form.recurrence_type !== "none" && <label>Chaque / tous les<input type="number" min="1" value={form.recurrence_interval} onChange={(e) => setForm({ ...form, recurrence_interval: e.target.value })} /></label>}
          {form.recurrence_type !== "none" && <label>Fin de récurrence<input type="date" value={form.recurrence_end_date} onChange={(e) => setForm({ ...form, recurrence_end_date: e.target.value })} /></label>}
          <label className="maintenance-description">Description<textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Consignes, pièces à contrôler, matériel nécessaire..." /></label>
        </div>

        <button className="btn primary" type="submit">{editingId ? "Enregistrer les modifications" : "Planifier la maintenance"}</button>
      </form>

      <div className="card">
        <h3>Maintenances programmées</h3>
        {activities.length === 0 ? <p>Aucune activité de maintenance.</p> : (
          <div className="maintenance-list">
            {activities.map((activity) => (
              <article className="maintenance-list-row" key={activity.id}>
                <div>
                  <strong>{activity.title}</strong>
                  <span>{activity.equipment || "Maintenance générale"}</span>
                  <small>{activity.scheduled_date} · {activity.start_time?.slice(0, 5) || "-"} · {recurrenceLabel(activity)} · {employeeName(activity.assigned_employee_id)}</small>
                </div>
                <div className="inline-actions">
                  <button className="btn small" onClick={() => editActivity(activity)}>Modifier</button>
                  <button className="btn small danger-soft" onClick={() => archiveActivity(activity)}>Archiver</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Prochaines échéances (90 jours)</h3>
        {upcoming.length === 0 ? <p>Aucune maintenance à venir.</p> : (
          <div className="maintenance-list">
            {upcoming.slice(0, 50).map(({ activity, date }) => (
              <article className="maintenance-list-row" key={`${activity.id}-${date}`}>
                <div><strong>{date} · {activity.title}</strong><span>{activity.equipment || "Maintenance générale"}</span><small>{employeeName(activity.assigned_employee_id)} · {recurrenceLabel(activity)}</small></div>
                <button className="btn small" onClick={() => completeOccurrence(activity, date)}>Marquer réalisée</button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
