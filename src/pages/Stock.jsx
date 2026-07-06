import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";

const PRICE_UNITS = [
  { value: "unit", label: "€/unité" },
  { value: "kg", label: "€/kg" },
  { value: "tonne", label: "€/tonne" },
  { value: "liter", label: "€/litre" },
  { value: "meter", label: "€/mètre" },
  { value: "m2", label: "€/m²" },
  { value: "m3", label: "€/m³" },
];

export default function Stock({ user }) {
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [stockCategories, setStockCategories] = useState([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [expandedGroups, setExpandedGroups] = useState({});

  const [form, setForm] = useState({
    reference: "",
    name: "",
    category_id: "",
    unit: "kg",
    current_quantity: 0,
    minimum_quantity: 0,
    unit_price: 0,
    price_unit: "kg",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [itemsResponse, projectsResponse, categoriesResponse] = await Promise.all([
      supabase
        .from("stock_items")
        .select("*")
        .eq("active", true)
        .order("name"),
      supabase
        .from("projects")
        .select("*")
        .eq("active", true)
        .order("name"),
      supabase
        .from("stock_categories")
        .select("*")
        .eq("active", true)
        .order("name"),
    ]);

    const error =
      itemsResponse.error || projectsResponse.error || categoriesResponse.error;

    if (error) {
      setMessage(error.message);
      return;
    }

    const loadedItems = itemsResponse.data || [];
    const loadedCategories = categoriesResponse.data || [];

    setItems(loadedItems);
    setProjects(projectsResponse.data || []);
    setStockCategories(loadedCategories);

    const defaultExpanded = {};
    loadedItems.forEach((item) => {
      defaultExpanded[groupKey(item)] = true;
    });
    setExpandedGroups(defaultExpanded);
  }

  function categoryName(item) {
    const category = stockCategories.find((entry) => entry.id === item.category_id);
    return category?.name || "Sans sous-catégorie";
  }

  function groupKey(item) {
    return item.category_id || "none";
  }

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString("fr-FR", {
      maximumFractionDigits: 2,
    })} €`;
  }

  function priceUnitLabel(value) {
    return PRICE_UNITS.find((item) => item.value === value)?.label || "€/unité";
  }

  function normalizedUnitCost(item) {
    const price = Number(item.unit_price || 0);
    if (item.price_unit === "tonne") return price / 1000;
    return price;
  }

  function stockValue(item) {
    return Number(item.current_quantity || 0) * normalizedUnitCost(item);
  }

  function isCritical(item) {
    const current = Number(item.current_quantity || 0);
    const minimum = Number(item.minimum_quantity || 0);

    return minimum > 0 && current <= minimum;
  }

  const filteredItems = useMemo(() => {
    const query = search.toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        (item.reference || "").toLowerCase().includes(query) ||
        (item.name || "").toLowerCase().includes(query) ||
        categoryName(item).toLowerCase().includes(query);

      const matchesCategory =
        selectedCategoryId === "all" ||
        (selectedCategoryId === "none" && !item.category_id) ||
        item.category_id === selectedCategoryId;

      return matchesSearch && matchesCategory;
    });
  }, [items, search, selectedCategoryId, stockCategories]);

  const groupedStock = useMemo(() => {
    const map = new Map();

    filteredItems.forEach((item) => {
      const key = groupKey(item);
      const name = categoryName(item);

      if (!map.has(key)) {
        map.set(key, {
          key,
          name,
          items: [],
          value: 0,
          criticalCount: 0,
        });
      }

      const group = map.get(key);
      group.items.push(item);
      group.value += stockValue(item);

      if (isCritical(item)) {
        group.criticalCount += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredItems, stockCategories]);

  const criticalItems = items.filter(isCritical);
  const totalValue = items.reduce((sum, item) => sum + stockValue(item), 0);

  function toggleGroup(key) {
    setExpandedGroups((current) => ({ ...current, [key]: !current[key] }));
  }

  function expandAll() {
    const next = {};
    groupedStock.forEach((group) => {
      next[group.key] = true;
    });
    setExpandedGroups(next);
  }

  function collapseAll() {
    setExpandedGroups({});
  }

  async function createItem(e) {
    e.preventDefault();

    if (!form.name) {
      setMessage("Nom obligatoire.");
      return;
    }

    const { error } = await supabase.from("stock_items").insert({
      reference: form.reference || null,
      name: form.name,
      category_id: form.category_id || null,
      unit: form.unit || "kg",
      current_quantity: Number(form.current_quantity || 0),
      minimum_quantity: Number(form.minimum_quantity || 0),
      unit_price: Number(form.unit_price || 0),
      price_unit: form.price_unit || "kg",
      active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setForm({
      reference: "",
      name: "",
      category_id: "",
      unit: "kg",
      current_quantity: 0,
      minimum_quantity: 0,
      unit_price: 0,
      price_unit: "kg",
    });

    setMessage("Article ajouté.");
    loadData();
  }

  function askProjectId() {
    if (projects.length === 0) return "";

    const list = projects
      .map((project, index) => `${index + 1}. ${project.project_code ? `${project.project_code} - ` : ""}${project.name}`)
      .join("\n");

    const choice = window.prompt(
      `Projet lié à la sortie ?\nLaisse vide si aucun projet.\n\n${list}`,
      ""
    );

    if (!choice) return "";

    const selectedProject = projects[Number(choice) - 1];
    return selectedProject?.id || "";
  }

  async function moveStock(item, type) {
    const value = window.prompt(
      type === "in" ? "Quantité à entrer ?" : "Quantité à sortir ?",
      "1"
    );

    if (value === null) return;

    const qty = Number(String(value).replace(",", "."));

    if (!qty || Number.isNaN(qty) || qty <= 0) {
      setMessage("Quantité invalide.");
      return;
    }

    const projectId = type === "out" ? askProjectId() : "";

    const newQuantity =
      type === "in"
        ? Number(item.current_quantity || 0) + qty
        : Number(item.current_quantity || 0) - qty;

    const { error: updateError } = await supabase
      .from("stock_items")
      .update({ current_quantity: newQuantity })
      .eq("id", item.id);

    if (updateError) {
      setMessage(updateError.message);
      return;
    }

    const { error: movementError } = await supabase.from("stock_movements").insert({
      item_id: item.id,
      project_id: projectId || null,
      movement_type: type,
      quantity: qty,
      comment: type === "in" ? "Entrée stock" : "Sortie stock",
      created_by: user?.id || null,
    });

    if (movementError) {
      setMessage(movementError.message);
      return;
    }

    setMessage("Stock mis à jour.");
    loadData();
  }

  async function editItem(item) {
    const reference = window.prompt("Référence ?", item.reference || "");
    if (reference === null) return;

    const name = window.prompt("Désignation ?", item.name || "");
    if (name === null) return;

    const unit = window.prompt("Unité de stock ? Exemple : kg, unité, litre", item.unit || "kg");
    if (unit === null) return;

    const list = stockCategories
      .map((category, index) => `${index + 1}. ${category.name}`)
      .join("\n");

    const currentIndex = stockCategories.findIndex(
      (category) => category.id === item.category_id
    );

    const choice = window.prompt(
      `Sous-catégorie issue de l'administration :\n0. Aucune\n${list}`,
      currentIndex >= 0 ? String(currentIndex + 1) : "0"
    );

    if (choice === null) return;

    const selectedCategory =
      Number(choice) === 0 ? null : stockCategories[Number(choice) - 1];

    const { error } = await supabase
      .from("stock_items")
      .update({
        reference: reference || null,
        name: name || "Sans nom",
        unit: unit || "unité",
        category_id: selectedCategory?.id || null,
      })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Article modifié.");
    loadData();
  }

  async function editQuantity(item) {
    const value = window.prompt("Nouvelle quantité actuelle ?", item.current_quantity);
    if (value === null) return;

    const quantity = Number(String(value).replace(",", "."));
    if (Number.isNaN(quantity)) {
      setMessage("Quantité invalide.");
      return;
    }

    const { error } = await supabase
      .from("stock_items")
      .update({ current_quantity: quantity })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Quantité modifiée.");
    loadData();
  }

  async function editMinimum(item) {
    const value = window.prompt("Nouveau stock mini ?", item.minimum_quantity);
    if (value === null) return;

    const quantity = Number(String(value).replace(",", "."));
    if (Number.isNaN(quantity)) {
      setMessage("Stock mini invalide.");
      return;
    }

    const { error } = await supabase
      .from("stock_items")
      .update({ minimum_quantity: quantity })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Stock mini modifié.");
    loadData();
  }

  async function editPrice(item) {
    const price = window.prompt(
      "Prix d'achat ? Exemple : 180 pour 180 €/tonne",
      String(item.unit_price || 0)
    );

    if (price === null) return;

    const list = PRICE_UNITS.map((unit, index) => `${index + 1}. ${unit.label}`).join("\n");
    const currentIndex = Math.max(
      0,
      PRICE_UNITS.findIndex((unit) => unit.value === item.price_unit)
    );

    const choice = window.prompt(`Unité du prix :\n${list}`, String(currentIndex + 1));
    if (choice === null) return;

    const selectedUnit = PRICE_UNITS[Number(choice) - 1] || PRICE_UNITS[0];

    const { error } = await supabase
      .from("stock_items")
      .update({
        unit_price: Number(String(price).replace(",", ".")) || 0,
        price_unit: selectedUnit.value,
      })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Prix matière modifié.");
    loadData();
  }

  async function archiveItem(item) {
    const ok = window.confirm(`Archiver "${item.name}" ?`);
    if (!ok) return;

    const { error } = await supabase
      .from("stock_items")
      .update({ active: false })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Article archivé.");
    loadData();
  }

  function exportMissingProducts() {
    const rows = [
      ["Référence", "Désignation", "Sous-catégorie", "Stock actuel", "Stock mini", "Unité", "Prix achat", "Unité prix"],
      ...criticalItems.map((item) => [
        item.reference || "",
        item.name || "",
        categoryName(item),
        item.current_quantity || 0,
        item.minimum_quantity || 0,
        item.unit || "",
        item.unit_price || 0,
        priceUnitLabel(item.price_unit),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";"))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "stock_articles_critiques.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Stock</p>
          <h2>Stock & matières</h2>
          <p>Sous-catégories pilotées depuis Administration, sans famille intermédiaire.</p>
        </div>

        <button className="btn primary" onClick={exportMissingProducts}>
          Export produits manquants
        </button>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="stats-grid">
        <div className="stat-card">
          <span>Articles actifs</span>
          <strong>{items.length}</strong>
        </div>

        <div className="stat-card accent">
          <span>Stock critique</span>
          <strong>{criticalItems.length}</strong>
        </div>

        <div className="stat-card">
          <span>Valeur stock estimée</span>
          <strong>{formatMoney(totalValue)}</strong>
        </div>
      </div>

      <div className="card">
        <h3>Ajouter un article</h3>

        <form className="grid" onSubmit={createItem}>
          <div>
            <label>Référence</label>
            <input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="Ex : CIM-GRIS"
            />
          </div>

          <div>
            <label>Désignation</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex : Ciment gris"
            />
          </div>

          <div>
            <label>Sous-catégorie</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">Aucune</option>
              {stockCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Unité de stock</label>
            <input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="kg, unité, litre..."
            />
          </div>

          <div>
            <label>Quantité actuelle</label>
            <input
              type="number"
              step="0.01"
              value={form.current_quantity}
              onChange={(e) => setForm({ ...form, current_quantity: e.target.value })}
            />
          </div>

          <div>
            <label>Stock mini</label>
            <input
              type="number"
              step="0.01"
              value={form.minimum_quantity}
              onChange={(e) => setForm({ ...form, minimum_quantity: e.target.value })}
            />
          </div>

          <div>
            <label>Prix d'achat</label>
            <input
              type="number"
              step="0.01"
              value={form.unit_price}
              onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
            />
          </div>

          <div>
            <label>Unité du prix</label>
            <select
              value={form.price_unit}
              onChange={(e) => setForm({ ...form, price_unit: e.target.value })}
            >
              {PRICE_UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </div>

          <div className="align-end">
            <button className="btn primary">Ajouter</button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="page-head">
          <div>
            <h3>Inventaire par sous-catégorie</h3>
            <p>Les sous-catégories affichées ici sont celles du menu Administration.</p>
          </div>

          <div className="inline-actions">
            <button className="btn small" onClick={expandAll}>Tout ouvrir</button>
            <button className="btn small" onClick={collapseAll}>Tout fermer</button>
          </div>
        </div>

        <div className="stock-filters single-category">
          <input
            placeholder="Rechercher par référence, désignation ou sous-catégorie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
          >
            <option value="all">Toutes les sous-catégories</option>
            <option value="none">Sans sous-catégorie</option>
            {stockCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {groupedStock.length === 0 ? (
          <p>Aucun article trouvé.</p>
        ) : (
          <div className="stock-group-list">
            {groupedStock.map((group) => {
              const opened = expandedGroups[group.key] !== false;

              return (
                <div className="stock-group" key={group.key}>
                  <button className="stock-group-head simple" type="button" onClick={() => toggleGroup(group.key)}>
                    <span>{opened ? "▾" : "▸"}</span>

                    <div>
                      <strong>{group.name}</strong>
                    </div>

                    <div className="stock-group-metrics">
                      <span>{group.items.length} article(s)</span>
                      <span>{formatMoney(group.value)}</span>
                      {group.criticalCount > 0 && (
                        <span className="critical">{group.criticalCount} critique(s)</span>
                      )}
                    </div>
                  </button>

                  {opened && (
                    <div className="stock-group-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Référence</th>
                            <th>Désignation</th>
                            <th>Stock</th>
                            <th>Mini</th>
                            <th>Prix</th>
                            <th>Valeur</th>
                            <th>Alerte</th>
                            <th>Actions</th>
                          </tr>
                        </thead>

                        <tbody>
                          {group.items.map((item) => {
                            const current = Number(item.current_quantity || 0);
                            const minimum = Number(item.minimum_quantity || 0);

                            return (
                              <tr key={item.id}>
                                <td><strong>{item.reference || "-"}</strong></td>
                                <td>{item.name}</td>
                                <td>{current.toLocaleString("fr-FR")} {item.unit}</td>
                                <td>{minimum.toLocaleString("fr-FR")} {item.unit}</td>
                                <td>
                                  <span className="stock-price-pill">
                                    {formatMoney(item.unit_price)} / {priceUnitLabel(item.price_unit)}
                                  </span>
                                  {item.price_unit === "tonne" && (
                                    <small><br />soit {formatMoney(normalizedUnitCost(item))} / kg</small>
                                  )}
                                </td>
                                <td>{formatMoney(stockValue(item))}</td>
                                <td>
                                  {isCritical(item) ? (
                                    <span className="status-pill refused">Stock bas</span>
                                  ) : (
                                    <span className="status-pill validated">OK</span>
                                  )}
                                </td>
                                <td>
                                  <div className="inline-actions">
                                    <button className="btn small" onClick={() => moveStock(item, "in")}>+ Entrée</button>
                                    <button className="btn small" onClick={() => moveStock(item, "out")}>- Sortie</button>
                                    <button className="btn small" onClick={() => editItem(item)}>Modifier</button>
                                    <button className="btn small" onClick={() => editQuantity(item)}>Qté</button>
                                    <button className="btn small" onClick={() => editMinimum(item)}>Mini</button>
                                    <button className="btn small" onClick={() => editPrice(item)}>Prix</button>
                                    <button className="btn small danger-soft" onClick={() => archiveItem(item)}>Archiver</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
