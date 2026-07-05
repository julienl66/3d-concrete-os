import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";
import { canAccess } from "../services/permissions.js";

export default function Couts({ user, permissions }) {
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [punchEvents, setPunchEvents] = useState([]);
  const [annexCosts, setAnnexCosts] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [
      projectsResponse,
      employeesResponse,
      stockMovementsResponse,
      punchEventsResponse,
      annexCostsResponse,
    ] = await Promise.all([
      supabase
        .from("projects")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false }),

      supabase
        .from("employees")
        .select("*")
        .eq("active", true)
        .order("name"),

      supabase
        .from("stock_movements")
        .select(`
          *,
          stock_items(name, reference, unit_price, price_unit)
        `)
        .eq("movement_type", "out")
        .order("created_at", { ascending: false }),

      supabase
        .from("punch_events")
        .select("*")
        .order("event_time", { ascending: true }),

      supabase
        .from("project_cost_entries")
        .select("*")
        .or("source.eq.manual,source.eq.annex,source.is.null")
        .order("cost_date", { ascending: false }),
    ]);

    const error =
      projectsResponse.error ||
      employeesResponse.error ||
      stockMovementsResponse.error ||
      punchEventsResponse.error ||
      annexCostsResponse.error;

    if (error) {
      setMessage(error.message);
      return;
    }

    setProjects(projectsResponse.data || []);
    setEmployees(employeesResponse.data || []);
    setStockMovements(stockMovementsResponse.data || []);
    setPunchEvents(punchEventsResponse.data || []);
    setAnnexCosts(annexCostsResponse.data || []);

    if (!selectedProjectId && projectsResponse.data?.length) {
      setSelectedProjectId(projectsResponse.data[0].id);
    }
  }

  function can(action) {
    return canAccess(user, permissions, "couts", action);
  }

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString("fr-FR", {
      maximumFractionDigits: 2,
    })} €`;
  }

  function formatHours(value) {
    return `${Number(value || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} h`;
  }

  function normalizedStockUnitCost(item) {
    const price = Number(item?.unit_price || 0);

    if (item?.price_unit === "tonne") return price / 1000;
    if (item?.price_unit === "kg") return price;
    if (item?.price_unit === "unit") return price;

    return price;
  }

  function priceUnitLabel(value) {
    const labels = {
      unit: "unité",
      kg: "kg",
      tonne: "tonne",
      liter: "litre",
      meter: "mètre",
      m2: "m²",
      m3: "m³",
    };

    return labels[value] || value || "unité";
  }

  function selectedProject() {
    return projects.find((project) => project.id === selectedProjectId);
  }

  function employeeById(employeeId) {
    return employees.find((employee) => employee.id === employeeId);
  }

  function computeLaborLines() {
    const groupedByEmployee = new Map();

    punchEvents
      .filter((event) => event.project_id === selectedProjectId)
      .forEach((event) => {
        if (!groupedByEmployee.has(event.employee_id)) {
          groupedByEmployee.set(event.employee_id, []);
        }

        groupedByEmployee.get(event.employee_id).push(event);
      });

    const lines = [];

    groupedByEmployee.forEach((events, employeeId) => {
      const employee = employeeById(employeeId);
      const orderedEvents = [...events].sort(
        (a, b) => new Date(a.event_time) - new Date(b.event_time)
      );

      let currentStart = null;
      let totalMs = 0;

      orderedEvents.forEach((event) => {
        if (event.event_type === "ARRIVAL" || event.event_type === "RESUME") {
          currentStart = new Date(event.event_time);
        }

        if ((event.event_type === "PAUSE" || event.event_type === "DEPART") && currentStart) {
          const end = new Date(event.event_time);
          const diff = end - currentStart;

          if (diff > 0) {
            totalMs += diff;
          }

          currentStart = null;
        }
      });

      const hours = totalMs / 1000 / 60 / 60;
      const hourlyRate = Number(employee?.hourly_rate || 0);

      if (hours > 0) {
        lines.push({
          employee_id: employeeId,
          employee_name: employee?.name || "Employé supprimé",
          hours,
          hourly_rate: hourlyRate,
          amount: hours * hourlyRate,
        });
      }
    });

    return lines;
  }

  const selectedStockMovements = useMemo(() => {
    return stockMovements.filter((movement) => movement.project_id === selectedProjectId);
  }, [stockMovements, selectedProjectId]);

  const selectedAnnexCosts = useMemo(() => {
    return annexCosts.filter((entry) => entry.project_id === selectedProjectId);
  }, [annexCosts, selectedProjectId]);

  const laborLines = useMemo(() => computeLaborLines(), [punchEvents, employees, selectedProjectId]);

  const stockLines = selectedStockMovements.map((movement) => {
    const unitPrice = normalizedStockUnitCost(movement.stock_items);
    const quantity = Number(movement.quantity || 0);

    return {
      id: movement.id,
      label: `${movement.stock_items?.reference ? `${movement.stock_items.reference} · ` : ""}${movement.stock_items?.name || "Article stock"}`,
      quantity,
      unit_price: unitPrice,
      raw_unit_price: Number(movement.stock_items?.unit_price || 0),
      price_unit: movement.stock_items?.price_unit || "unit",
      amount: quantity * unitPrice,
      created_at: movement.created_at,
      comment: movement.comment || "",
    };
  });

  const stockTotal = stockLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const laborTotal = laborLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const annexTotal = selectedAnnexCosts.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const totalCost = stockTotal + laborTotal + annexTotal;
  const revenue = Number(selectedProject()?.sale_amount || 0);
  const margin = revenue - totalCost;
  const marginRate = revenue > 0 ? (margin / revenue) * 100 : 0;

  async function updateEmployeeRate(employee) {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const value = window.prompt(
      `Taux horaire de ${employee.name} ?`,
      String(employee.hourly_rate || 0)
    );

    if (value === null) return;

    const { error } = await supabase
      .from("employees")
      .update({ hourly_rate: Number(String(value).replace(",", ".")) || 0 })
      .eq("id", employee.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Taux horaire modifié.");
    loadData();
  }

  function exportCsv() {
    if (!can("can_export")) {
      setMessage("Action non autorisée.");
      return;
    }

    const project = selectedProject();

    const rows = [
      ["Projet", project?.name || ""],
      ["CA vendu", revenue],
      ["Coût stock", stockTotal],
      ["Coût main d'œuvre", laborTotal],
      ["Coûts annexes", annexTotal],
      ["Coût de revient total", totalCost],
      ["Marge", margin],
      ["Taux marge", `${marginRate.toFixed(2)} %`],
      [],
      ["STOCK SORTI DU PROJET"],
      ["Date", "Article", "Quantité", "Prix unitaire", "Montant", "Commentaire"],
      ...stockLines.map((line) => [
        line.created_at || "",
        line.label,
        line.quantity,
        line.unit_price,
        line.amount,
        line.comment,
      ]),
      [],
      ["MAIN D'OEUVRE ISSUE DU POINTAGE"],
      ["Employé", "Heures", "Taux horaire", "Montant"],
      ...laborLines.map((line) => [
        line.employee_name,
        line.hours.toFixed(2),
        line.hourly_rate,
        line.amount,
      ]),
      [],
      ["COÛTS ANNEXES"],
      ["Date", "Catégorie", "Libellé", "Quantité", "Prix unitaire", "Montant", "Notes"],
      ...selectedAnnexCosts.map((entry) => [
        entry.cost_date || "",
        entry.category || "",
        entry.label || "",
        entry.quantity || 0,
        entry.unit_cost || 0,
        entry.amount || 0,
        entry.notes || "",
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
          .join(";")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `bilan_${project?.project_code || "projet"}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Finance projet</p>
          <h2>Bilan coûts & marges</h2>
          <p>Lecture automatique depuis le stock sorti, le pointage et les dépenses annexes projet.</p>
        </div>

        <button className="btn primary" onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="card">
        <label>Projet à analyser</label>
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.project_code ? `${project.project_code} - ` : ""}
              {project.name}
            </option>
          ))}
        </select>
      </div>

      <div className="stats-grid">
        <div className="stat-card accent">
          <span>Montant vendu</span>
          <strong>{formatMoney(revenue)}</strong>
        </div>

        <div className="stat-card">
          <span>Coût de revient</span>
          <strong>{formatMoney(totalCost)}</strong>
        </div>

        <div className="stat-card">
          <span>Marge brute</span>
          <strong>{formatMoney(margin)}</strong>
        </div>

        <div className="stat-card">
          <span>Taux de marge</span>
          <strong>{marginRate.toFixed(1)} %</strong>
        </div>
      </div>

      <div className="cost-category-grid">
        <div>
          <span>Stock sorti</span>
          <strong>{formatMoney(stockTotal)}</strong>
        </div>

        <div>
          <span>Main d'œuvre pointée</span>
          <strong>{formatMoney(laborTotal)}</strong>
        </div>

        <div>
          <span>Dépenses annexes</span>
          <strong>{formatMoney(annexTotal)}</strong>
        </div>

        <div>
          <span>Heures pointées</span>
          <strong>{formatHours(laborLines.reduce((sum, line) => sum + line.hours, 0))}</strong>
        </div>
      </div>

      <div className="card">
        <div className="page-head">
          <div>
            <h3>Taux horaires employés</h3>
            <p>Ces taux servent au calcul automatique de la main d'œuvre depuis la pointeuse.</p>
          </div>
        </div>

        <div className="cost-mini-list">
          {employees.map((employee) => (
            <button key={employee.id} onClick={() => updateEmployeeRate(employee)}>
              {employee.name} · {formatMoney(employee.hourly_rate || 0)}/h
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Stock sorti sur ce projet</h3>

        {stockLines.length === 0 ? (
          <p>Aucune sortie stock liée à ce projet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Article</th>
                <th>Quantité</th>
                <th>Prix unitaire</th>
                <th>Montant</th>
              </tr>
            </thead>

            <tbody>
              {stockLines.map((line) => (
                <tr key={line.id}>
                  <td>{line.created_at?.slice(0, 10) || "-"}</td>
                  <td>{line.label}</td>
                  <td>{line.quantity}</td>
                  <td>
                    {formatMoney(line.unit_price)}
                    <br />
                    <small>Prix saisi : {formatMoney(line.raw_unit_price)} / {priceUnitLabel(line.price_unit)}</small>
                  </td>
                  <td>{formatMoney(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Main d'œuvre issue du pointage</h3>

        {laborLines.length === 0 ? (
          <p>Aucune heure pointée sur ce projet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employé</th>
                <th>Heures</th>
                <th>Taux horaire</th>
                <th>Montant</th>
              </tr>
            </thead>

            <tbody>
              {laborLines.map((line) => (
                <tr key={line.employee_id}>
                  <td>{line.employee_name}</td>
                  <td>{formatHours(line.hours)}</td>
                  <td>{formatMoney(line.hourly_rate)}</td>
                  <td>{formatMoney(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Dépenses annexes du projet</h3>
        <p>
          Ces lignes doivent être ajoutées depuis la fiche projet : palette, petit matériel,
          ferraillage, sous-traitance, achats spécifiques, etc.
        </p>

        {selectedAnnexCosts.length === 0 ? (
          <p>Aucune dépense annexe liée à ce projet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Catégorie</th>
                <th>Libellé</th>
                <th>Quantité</th>
                <th>PU</th>
                <th>Montant</th>
              </tr>
            </thead>

            <tbody>
              {selectedAnnexCosts.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.cost_date || "-"}</td>
                  <td>{entry.category || "-"}</td>
                  <td>
                    <strong>{entry.label}</strong>
                    <br />
                    <small>{entry.notes || "-"}</small>
                  </td>
                  <td>{Number(entry.quantity || 0).toLocaleString("fr-FR")}</td>
                  <td>{formatMoney(entry.unit_cost)}</td>
                  <td>{formatMoney(entry.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
