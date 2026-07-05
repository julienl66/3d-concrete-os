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
  if (!date) return "-";
  return new Date(date).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHours(hours) {
  return `${Number(hours || 0).toFixed(2)} h`;
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

function getStatus(lastEvent) {
  if (!lastEvent) return "ABSENT";
  if (lastEvent.event_type === "ARRIVAL") return "WORKING";
  if (lastEvent.event_type === "RESUME") return "WORKING";
  if (lastEvent.event_type === "PAUSE") return "PAUSED";
  if (lastEvent.event_type === "DEPART") return "FINISHED";
  return "ABSENT";
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

export default function Dashboard({ user }) {
  const [employees, setEmployees] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDashboard();

    const interval = setInterval(() => {
      loadDashboard();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  async function loadDashboard() {
    const range = todayRange();

    const { data: employeesData, error: employeesError } = await supabase
      .from("employees")
      .select("*")
      .eq("active", true)
      .order("name");

    if (employeesError) {
      setError(employeesError.message);
      return;
    }

    const { data: eventsData, error: eventsError } = await supabase
      .from("punch_events")
      .select("*, employees(name), projects(name)")
      .gte("event_time", range.start)
      .lte("event_time", range.end)
      .order("event_time", { ascending: true });

    if (eventsError) {
      setError(eventsError.message);
      return;
    }

    setEmployees(employeesData || []);
    setEvents(eventsData || []);
  }

  const rows = useMemo(() => {
    return employees.map((employee) => {
      const employeeEvents = events.filter((event) => event.employee_id === employee.id);
      const lastEvent = employeeEvents[employeeEvents.length - 1];
      const status = getStatus(lastEvent);
      const workedHours = calculateWorkedTime(employeeEvents);

      const currentProject =
        status === "WORKING"
          ? lastEvent?.projects?.name || "-"
          : "-";

      return {
        employee,
        events: employeeEvents,
        lastEvent,
        status,
        workedHours,
        currentProject,
      };
    });
  }, [employees, events]);

  const totals = useMemo(() => {
    const totalToday = rows.reduce((sum, row) => sum + row.workedHours, 0);
    const present = rows.filter((row) => row.status === "WORKING").length;
    const paused = rows.filter((row) => row.status === "PAUSED").length;
    const absent = rows.filter((row) => row.status === "ABSENT").length;

    return { totalToday, present, paused, absent };
  }, [rows]);

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Temps réel</p>
          <h2>Tableau de bord</h2>
          <p>Présence, projet actuel et temps travaillé aujourd’hui.</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="stats-grid">
        <div className="stat-card">
          <span>Total aujourd’hui</span>
          <strong>{formatHours(totals.totalToday)}</strong>
        </div>

        <div className="stat-card">
          <span>Présents</span>
          <strong>{totals.present}</strong>
        </div>

        <div className="stat-card accent">
          <span>En pause</span>
          <strong>{totals.paused}</strong>
        </div>
      </div>

      <div className="card">
        <h3>Employés aujourd’hui</h3>

        <table>
          <thead>
            <tr>
              <th>Employé</th>
              <th>État</th>
              <th>Projet actuel</th>
              <th>Dernier pointage</th>
              <th>Temps aujourd’hui</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.employee.id}>
                <td>
                  <strong>{row.employee.name}</strong>
                </td>

                <td>
                  <span className={`status-pill ${row.status.toLowerCase()}`}>
                    {row.status === "ABSENT" && "Absent"}
                    {row.status === "WORKING" && "Présent"}
                    {row.status === "PAUSED" && "En pause"}
                    {row.status === "FINISHED" && "Parti"}
                  </span>
                </td>

                <td>{row.currentProject}</td>

                <td>
                  {row.lastEvent
                    ? `${labelEvent(row.lastEvent.event_type)} à ${formatTime(row.lastEvent.event_time)}`
                    : "-"}
                </td>

                <td>
                  <strong>{formatHours(row.workedHours)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Historique des pointages du jour</h3>

        {events.length === 0 ? (
          <p>Aucun pointage aujourd’hui.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Heure</th>
                <th>Employé</th>
                <th>Action</th>
                <th>Projet</th>
              </tr>
            </thead>

            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{formatTime(event.event_time)}</td>
                  <td>{event.employees?.name}</td>
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