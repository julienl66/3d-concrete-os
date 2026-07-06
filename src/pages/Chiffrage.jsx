import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";
import { canAccess } from "../services/permissions.js";

const DEFAULT_CATEGORIES = [
  "Béton imprimé",
  "Main d'œuvre",
  "Robot",
  "Finition",
  "Armatures",
  "Transport",
  "Pose",
  "Divers",
];

export default function Chiffrage({ user, permissions }) {
  const [projectTypes, setProjectTypes] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [lines, setLines] = useState([]);
  const [message, setMessage] = useState("");

  const [quoteForm, setQuoteForm] = useState({
    client_name: "",
    project_name: "",
    project_type_id: "",
    description: "",
    delivery_date: "",
    margin_rate: 35,
  });

  const [lineForm, setLineForm] = useState({
    category: "Béton imprimé",
    label: "Béton imprimé",
    quantity: 1,
    unit: "kg",
    unit_price: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [quotesResponse, projectTypesResponse] = await Promise.all([
      supabase.from("quote_estimations").select("*").order("created_at", { ascending: false }),
      supabase.from("project_types").select("*").eq("active", true).order("name"),
    ]);

    const error = quotesResponse.error || projectTypesResponse.error;

    if (error) {
      setMessage(error.message);
      return;
    }

    setQuotes(quotesResponse.data || []);
    setProjectTypes(projectTypesResponse.data || []);

    const selectedId = selectedQuoteId || quotesResponse.data?.[0]?.id || "";
    setSelectedQuoteId(selectedId);

    if (selectedId) {
      await loadLines(selectedId);
    } else {
      setLines([]);
    }
  }

  async function loadLines(quoteId) {
    const { data, error } = await supabase
      .from("quote_estimation_lines")
      .select("*")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(error.message);
      return;
    }

    setLines(data || []);
  }

  function can(action) {
    return canAccess(user, permissions, "chiffrage", action);
  }

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`;
  }

  const selectedQuote = quotes.find((quote) => quote.id === selectedQuoteId);
  const totalCost = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const marginRate = Number(selectedQuote?.margin_rate || quoteForm.margin_rate || 0);
  const sellingPrice = totalCost * (1 + marginRate / 100);
  const marginAmount = sellingPrice - totalCost;

  const totalsByCategory = useMemo(() => {
    const map = new Map();
    lines.forEach((line) => {
      const key = line.category || "Divers";
      map.set(key, (map.get(key) || 0) + Number(line.amount || 0));
    });
    return Array.from(map.entries()).map(([category, amount]) => ({ category, amount }));
  }, [lines]);

  async function createQuote(e) {
    e.preventDefault();

    if (!can("can_create")) {
      setMessage("Action non autorisée.");
      return;
    }

    if (!quoteForm.client_name || !quoteForm.project_name) {
      setMessage("Client et nom du chiffrage obligatoires.");
      return;
    }

    const { data, error } = await supabase
      .from("quote_estimations")
      .insert({
        client_name: quoteForm.client_name,
        project_name: quoteForm.project_name,
        project_type_id: quoteForm.project_type_id || null,
        description: quoteForm.description || null,
        delivery_date: quoteForm.delivery_date || null,
        margin_rate: Number(quoteForm.margin_rate || 0),
        status: "draft",
        created_by: user?.id || null,
      })
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setQuoteForm({
      client_name: "",
      project_name: "",
      project_type_id: "",
      description: "",
      delivery_date: "",
      margin_rate: 35,
    });

    setSelectedQuoteId(data.id);
    setMessage("Chiffrage créé.");
    await loadData();
  }

  async function updateQuoteField(field, label) {
    if (!selectedQuote) return;

    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const value = window.prompt(label, selectedQuote[field] ?? "");
    if (value === null) return;

    const patch = {
      [field]: field === "margin_rate" ? Number(String(value).replace(",", ".")) || 0 : value || null,
    };

    const { error } = await supabase.from("quote_estimations").update(patch).eq("id", selectedQuote.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Chiffrage modifié.");
    await loadData();
  }

  async function addLine(e) {
    e.preventDefault();

    if (!can("can_create")) {
      setMessage("Action non autorisée.");
      return;
    }

    if (!selectedQuoteId) {
      setMessage("Sélectionne ou crée un chiffrage.");
      return;
    }

    if (!lineForm.label) {
      setMessage("Libellé obligatoire.");
      return;
    }

    const quantity = Number(String(lineForm.quantity || 0).replace(",", "."));
    const unitPrice = Number(String(lineForm.unit_price || 0).replace(",", "."));

    const { error } = await supabase.from("quote_estimation_lines").insert({
      quote_id: selectedQuoteId,
      category: lineForm.category || "Divers",
      label: lineForm.label,
      quantity,
      unit: lineForm.unit || "unité",
      unit_price: unitPrice,
      amount: quantity * unitPrice,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setLineForm({
      category: lineForm.category || "Divers",
      label: "",
      quantity: 1,
      unit: "kg",
      unit_price: 0,
    });

    setMessage("Ligne ajoutée.");
    await loadLines(selectedQuoteId);
  }

  async function editLine(line) {
    if (!can("can_edit")) {
      setMessage("Action non autorisée.");
      return;
    }

    const category = window.prompt("Catégorie ?", line.category || "Divers");
    if (category === null) return;

    const label = window.prompt("Libellé ?", line.label || "");
    if (label === null) return;

    const quantity = window.prompt("Quantité ?", String(line.quantity || 0));
    if (quantity === null) return;

    const unit = window.prompt("Unité ?", line.unit || "unité");
    if (unit === null) return;

    const unitPrice = window.prompt("Prix unitaire ?", String(line.unit_price || 0));
    if (unitPrice === null) return;

    const qtyNumber = Number(String(quantity).replace(",", ".")) || 0;
    const priceNumber = Number(String(unitPrice).replace(",", ".")) || 0;

    const { error } = await supabase
      .from("quote_estimation_lines")
      .update({
        category: category || "Divers",
        label: label || "Sans libellé",
        quantity: qtyNumber,
        unit: unit || "unité",
        unit_price: priceNumber,
        amount: qtyNumber * priceNumber,
      })
      .eq("id", line.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Ligne modifiée.");
    await loadLines(selectedQuoteId);
  }

  async function deleteLine(line) {
    if (!can("can_delete")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(`Supprimer "${line.label}" ?`);
    if (!ok) return;

    const { error } = await supabase.from("quote_estimation_lines").delete().eq("id", line.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Ligne supprimée.");
    await loadLines(selectedQuoteId);
  }

  async function createProjectFromQuote() {
    if (!selectedQuote) {
      setMessage("Sélectionne un chiffrage.");
      return;
    }

    if (!can("can_validate")) {
      setMessage("Action non autorisée.");
      return;
    }

    const ok = window.confirm(`Créer un projet depuis le chiffrage "${selectedQuote.project_name}" ?`);
    if (!ok) return;

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        project_code: `PRJ-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
        name: selectedQuote.project_name,
        client_name: selectedQuote.client_name,
        description: selectedQuote.description || null,
        project_type_id: selectedQuote.project_type_id || null,
        requested_delivery_date: selectedQuote.delivery_date || null,
        validated_delivery_date: selectedQuote.delivery_date || null,
        sale_amount: sellingPrice,
        estimated_material_cost: totalCost,
        status: "validated",
        active: true,
      })
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    await supabase
      .from("quote_estimations")
      .update({
        status: "converted",
        converted_project_id: project.id,
        sale_amount: sellingPrice,
        total_cost: totalCost,
      })
      .eq("id", selectedQuote.id);

    setMessage("Projet créé depuis le chiffrage.");
    await loadData();
  }

  function exportCsv() {
    if (!can("can_export")) {
      setMessage("Action non autorisée.");
      return;
    }

    if (!selectedQuote) return;

    const rows = [
      ["Client", selectedQuote.client_name],
      ["Projet", selectedQuote.project_name],
      ["Coût total", totalCost],
      ["Marge %", marginRate],
      ["Marge €", marginAmount],
      ["Prix de vente conseillé", sellingPrice],
      [],
      ["Catégorie", "Libellé", "Quantité", "Unité", "Prix unitaire", "Montant"],
      ...lines.map((line) => [
        line.category,
        line.label,
        line.quantity,
        line.unit,
        line.unit_price,
        line.amount,
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `chiffrage_${selectedQuote.project_name || "projet"}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Commercial</p>
          <h2>Chiffrage</h2>
          <p>Calcule un prix à partir de lignes libres, puis crée le projet.</p>
        </div>

        <div className="inline-actions">
          <button className="btn small" onClick={exportCsv}>Export CSV</button>
          <button className="btn primary" onClick={createProjectFromQuote}>
            Créer le projet
          </button>
        </div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="quote-layout">
        <div className="card">
          <h3>Nouveau chiffrage</h3>

          <form className="quote-form" onSubmit={createQuote}>
            <div>
              <label>Client</label>
              <input
                value={quoteForm.client_name}
                onChange={(e) => setQuoteForm({ ...quoteForm, client_name: e.target.value })}
                placeholder="Nom du client"
              />
            </div>

            <div>
              <label>Nom du projet</label>
              <input
                value={quoteForm.project_name}
                onChange={(e) => setQuoteForm({ ...quoteForm, project_name: e.target.value })}
                placeholder="Ex : Banc mairie"
              />
            </div>

            <div>
              <label>Type</label>
              <select
                value={quoteForm.project_type_id}
                onChange={(e) => setQuoteForm({ ...quoteForm, project_type_id: e.target.value })}
              >
                <option value="">Aucun</option>
                {projectTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label>Date livraison</label>
              <input
                type="date"
                value={quoteForm.delivery_date}
                onChange={(e) => setQuoteForm({ ...quoteForm, delivery_date: e.target.value })}
              />
            </div>

            <div>
              <label>Marge %</label>
              <input
                type="number"
                step="0.01"
                value={quoteForm.margin_rate}
                onChange={(e) => setQuoteForm({ ...quoteForm, margin_rate: e.target.value })}
              />
            </div>

            <div>
              <label>Description</label>
              <input
                value={quoteForm.description}
                onChange={(e) => setQuoteForm({ ...quoteForm, description: e.target.value })}
                placeholder="Infos utiles"
              />
            </div>

            <button className="btn primary">Créer chiffrage</button>
          </form>
        </div>

        <div className="card">
          <h3>Chiffrages existants</h3>

          {quotes.length === 0 ? (
            <p>Aucun chiffrage.</p>
          ) : (
            <div className="quote-list">
              {quotes.map((quote) => (
                <button
                  key={quote.id}
                  className={quote.id === selectedQuoteId ? "active" : ""}
                  onClick={() => {
                    setSelectedQuoteId(quote.id);
                    loadLines(quote.id);
                  }}
                >
                  <strong>{quote.project_name}</strong>
                  <small>{quote.client_name} · {quote.status || "draft"}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedQuote && (
        <>
          <div className="quote-summary-grid">
            <div className="stat-card">
              <span>Coût total</span>
              <strong>{formatMoney(totalCost)}</strong>
            </div>

            <div className="stat-card">
              <span>Marge</span>
              <strong>{marginRate.toFixed(1)} %</strong>
            </div>

            <div className="stat-card accent">
              <span>Prix conseillé</span>
              <strong>{formatMoney(sellingPrice)}</strong>
            </div>

            <div className="stat-card">
              <span>Marge en €</span>
              <strong>{formatMoney(marginAmount)}</strong>
            </div>
          </div>

          <div className="card">
            <div className="page-head">
              <div>
                <h3>{selectedQuote.project_name}</h3>
                <p>{selectedQuote.client_name}</p>
              </div>

              <div className="inline-actions">
                <button className="btn small" onClick={() => updateQuoteField("client_name", "Client ?")}>Client</button>
                <button className="btn small" onClick={() => updateQuoteField("project_name", "Nom projet ?")}>Projet</button>
                <button className="btn small" onClick={() => updateQuoteField("margin_rate", "Marge % ?")}>Marge</button>
              </div>
            </div>

            <form className="quote-line-form" onSubmit={addLine}>
              <div>
                <label>Catégorie</label>
                <input
                  value={lineForm.category}
                  onChange={(e) => setLineForm({ ...lineForm, category: e.target.value })}
                  list="quote-categories"
                />
                <datalist id="quote-categories">
                  {DEFAULT_CATEGORIES.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </div>

              <div>
                <label>Libellé</label>
                <input
                  value={lineForm.label}
                  onChange={(e) => setLineForm({ ...lineForm, label: e.target.value })}
                  placeholder="Ex : Béton imprimé"
                />
              </div>

              <div>
                <label>Quantité</label>
                <input
                  type="number"
                  step="0.01"
                  value={lineForm.quantity}
                  onChange={(e) => setLineForm({ ...lineForm, quantity: e.target.value })}
                />
              </div>

              <div>
                <label>Unité</label>
                <input
                  value={lineForm.unit}
                  onChange={(e) => setLineForm({ ...lineForm, unit: e.target.value })}
                />
              </div>

              <div>
                <label>Prix unité</label>
                <input
                  type="number"
                  step="0.01"
                  value={lineForm.unit_price}
                  onChange={(e) => setLineForm({ ...lineForm, unit_price: e.target.value })}
                />
              </div>

              <button className="btn primary">Ajouter ligne</button>
            </form>

            <div className="quote-category-grid">
              {totalsByCategory.map((row) => (
                <div key={row.category}>
                  <span>{row.category}</span>
                  <strong>{formatMoney(row.amount)}</strong>
                </div>
              ))}
            </div>

            {lines.length === 0 ? (
              <p>Aucune ligne. Exemple : Béton imprimé — 850 kg — 0,42 €/kg.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Catégorie</th>
                    <th>Libellé</th>
                    <th>Quantité</th>
                    <th>PU</th>
                    <th>Montant</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.category}</td>
                      <td><strong>{line.label}</strong></td>
                      <td>{Number(line.quantity || 0).toLocaleString("fr-FR")} {line.unit}</td>
                      <td>{formatMoney(line.unit_price)}</td>
                      <td>{formatMoney(line.amount)}</td>
                      <td>
                        <div className="inline-actions">
                          <button className="btn small" onClick={() => editLine(line)}>Modifier</button>
                          <button className="btn small danger-soft" onClick={() => deleteLine(line)}>Supprimer</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </section>
  );
}
