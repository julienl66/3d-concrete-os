import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelEvent(type) {
  const labels = {
    ARRIVAL: "Arrivée",
    PAUSE: "Pause",
    RESUME: "Reprise",
    DEPART: "Départ",
  };

  return labels[type] || type;
}

function calculateWorkedTime(events) {
  let totalMs = 0;
  let workStart = null;

  for (const event of events) {
    if (event.event_type === "ARRIVAL" || event.event_type === "RESUME") {
      workStart = new Date(event.event_time);
    }

    if ((event.event_type === "PAUSE" || event.event_type === "DEPART") && workStart) {
      totalMs += new Date(event.event_time) - workStart;
      workStart = null;
    }
  }

  if (workStart) {
    totalMs += new Date() - workStart;
  }

  return totalMs / 1000 / 60 / 60;
}

export default function Pointage({ user }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadProjects();
    loadEvents();
  }, []);

  async function loadProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("active", true)
      .order("name");

    if (error) {
      setMessage(error.message);
      return;
    }

    setProjects(data || []);
    if (data?.length) setProjectId(data[0].id);
  }

  async function loadEvents() {
    const range = todayRange();

    const { data, error } = await supabase
      .from("punch_events")
      .select("*, projects(name)")
      .eq("employee_id", user.id)
      .gte("event_time", range.start)
      .lte("event_time", range.end)
      .order("event_time", { ascending: true });

    if (error) {
      setMessage(error.message);
      return;
    }

    setEvents(data || []);
  }

  const lastEvent = events[events.length - 1];

  const status = useMemo(() => {
    if (!lastEvent) return "ABSENT";
    if (lastEvent.event_type === "ARRIVAL") return "WORKING";
    if (lastEvent.event_type === "RESUME") return "WORKING";
    if (lastEvent.event_type === "PAUSE") return "PAUSED";
    if (lastEvent.event_type === "DEPART") return "FINISHED";
    return "ABSENT";
  }, [lastEvent]);

  const workedHours = useMemo(() => {
    return calculateWorkedTime(events);
  }, [events]);

  async function punch(eventType) {
    setMessage("");

    if ((eventType === "ARRIVAL" || eventType === "RESUME") && !projectId) {
      setMessage("Choisis un projet avant de pointer.");
      return;
    }

    const { error } = await supabase.from("punch_events").insert({
      employee_id: user.id,
      project_id: eventType === "ARRIVAL" || eventType === "RESUME" ? projectId : null,
      event_type: eventType,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadEvents();
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Pointeuse intelligente</p>
          <h2>Pointage</h2>
          <p>Arrivée, pause, reprise et départ sans saisir les heures.</p>
        </div>

        <div className="total-pill">
          {workedHours.toFixed(2)} h aujourd’hui
        </div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="card">
        <h3>État actuel</h3>

        <div className="status-box">
          <strong>
            {status === "ABSENT" && "Absent"}
            {status === "WORKING" && "En travail"}
            {status === "PAUSED" && "En pause"}
            {status === "FINISHED" && "Journée terminée"}
          </strong>

          {lastEvent && (
            <span>
              Dernier pointage : {labelEvent(lastEvent.event_type)} à{" "}
              {formatTime(lastEvent.event_time)}
            </span>
          )}
        </div>

        {(status === "ABSENT" || status === "WORKING" || status === "PAUSED") && (
          <>
            <label>Projet</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="punch-grid">
          <button
            className="btn primary"
            disabled={status !== "ABSENT" && status !== "FINISHED"}
            onClick={() => punch("ARRIVAL")}
          >
            🟢 Arrivée
          </button>

          <button
            className="btn secondary"
            disabled={status !== "WORKING"}
            onClick={() => punch("PAUSE")}
          >
            ☕ Pause
          </button>

          <button
            className="btn secondary"
            disabled={status !== "PAUSED"}
            onClick={() => punch("RESUME")}
          >
            ▶️ Reprise
          </button>

          <button
            className="btn danger"
            disabled={status !== "WORKING" && status !== "PAUSED"}
            onClick={() => punch("DEPART")}
          >
            🔴 Départ
          </button>
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
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{formatTime(event.event_time)}</td>
                  <td>{labelEvent(event.event_type)}</td>
                  <td>{event.projects?.name || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}