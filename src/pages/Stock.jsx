import { useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";

export default function Stock({ user }) {
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const [form, setForm] = useState({
    reference: "",
    name: "",
    category_id: "",
    unit: "unité",
    minimum_quantity: 0,
  });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    await Promise.all([loadStock(), loadProjects(), loadCategories()]);
  }

  async function loadStock() {
    const { data, error } = await supabase
      .from("stock_items")
      .select("*, stock_categories(name)")
      .eq("active", true)
      .order("name");

    if (error) {
      setMessage(error.message);
      return;
    }

    setItems(data || []);
  }

  async function loadProjects() {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("active", true)
      .order("name");

    setProjects(data || []);
  }

  async function loadCategories() {
    const { data, error } = await supabase
      .from("stock_categories")
      .select("*")
      .eq("active", true)
      .order("name");

    if (error) {
      setMessage(error.message);
      return;
    }

    setCategories(data || []);

    if (data?.length && !form.category_id) {
      setForm((current) => ({
        ...current,
        category_id: data[0].id,
      }));
    }
  }

  async function createCategory() {
    const name = window.prompt("Nom de la nouvelle sous-catégorie ?");

    if (!name) return;

    const { error } = await supabase.from("stock_categories").insert({
      name,
      active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Sous-catégorie ajoutée.");
    await loadCategories();
  }

  async function deleteCategory(category) {
    const linkedItems = items.filter((item) => item.category_id === category.id).length;

    const ok = window.confirm(
      linkedItems > 0
        ? `Supprimer la sous-catégorie "${category.name}" ? ${linkedItems} article(s) seront mis sans sous-catégorie.`
        : `Supprimer la sous-catégorie "${category.name}" ?`
    );

    if (!ok) return;

    if (linkedItems > 0) {
      const { error: unlinkError } = await supabase
        .from("stock_items")
        .update({ category_id: null })
        .eq("category_id", category.id);

      if (unlinkError) {
        setMessage(unlinkError.message);
        return;
      }
    }

    const { error } = await supabase
      .from("stock_categories")
      .update({ active: false })
      .eq("id", category.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (selectedCategory === category.id) {
      setSelectedCategory("all");
    }

    setMessage("Sous-catégorie supprimée.");
    await loadAll();
  }

  async function createItem(e) {
    e.preventDefault();
    setMessage("");

    if (!form.name) {
      setMessage("Désignation obligatoire.");
      return;
    }

    const { error } = await supabase.from("stock_items").insert({
      reference: form.reference || null,
      name: form.name,
      category: "Stock",
      category_id: form.category_id || null,
      unit: form.unit,
      minimum_quantity: Number(form.minimum_quantity || 0),
      current_quantity: 0,
      active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setForm({
      reference: "",
      name: "",
      category_id: form.category_id,
      unit: "unité",
      minimum_quantity: 0,
    });

    setMessage("Article ajouté.");
    await loadStock();
  }

  async function moveStock(item, type) {
    const qty = Number(
      window.prompt(`Quantité à ${type === "in" ? "ajouter" : "sortir"} ?`)
    );

    if (!qty || qty <= 0) return;

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

    await supabase.from("stock_movements").insert({
      item_id: item.id,
      project_id: null,
      movement_type: type,
      quantity: qty,
      comment: type === "in" ? "Entrée stock" : "Sortie stock",
      created_by: user?.id || null,
    });

    setMessage("Stock mis à jour.");
    await loadStock();
  }

  async function editQuantity(item) {
    const value = Number(
      window.prompt("Nouvelle quantité actuelle ?", item.current_quantity)
    );

    if (Number.isNaN(value)) return;

    const { error } = await supabase
      .from("stock_items")
      .update({ current_quantity: value })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await supabase.from("stock_movements").insert({
      item_id: item.id,
      project_id: null,
      movement_type: "adjustment",
      quantity: value,
      comment: "Ajustement manuel quantité",
      created_by: user?.id || null,
    });

    setMessage("Quantité modifiée.");
    await loadStock();
  }

  async function editMinimum(item) {
    const value = Number(
      window.prompt("Nouveau stock mini ?", item.minimum_quantity)
    );

    if (Number.isNaN(value)) return;

    const { error } = await supabase
      .from("stock_items")
      .update({ minimum_quantity: value })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Stock mini modifié.");
    await loadStock();
  }

  async function editReference(item) {
    const value = window.prompt("Nouvelle référence ?", item.reference || "");

    if (value === null) return;

    const { error } = await supabase
      .from("stock_items")
      .update({ reference: value || null })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Référence modifiée.");
    await loadStock();
  }

  async function editSubCategory(item) {
    if (!categories.length) {
      setMessage("Aucune sous-catégorie disponible.");
      return;
    }

    const list = categories.map((cat, index) => `${index + 1}. ${cat.name}`).join("\n");
    const choice = Number(window.prompt(`Choisis une sous-catégorie :\n${list}`));

    if (!choice || choice < 1 || choice > categories.length) return;

    const selected = categories[choice - 1];

    const { error } = await supabase
      .from("stock_items")
      .update({ category_id: selected.id })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Sous-catégorie modifiée.");
    await loadStock();
  }

  async function deleteItem(item) {
    const ok = window.confirm(
      `Retirer l'article "${item.reference || ""} ${item.name}" de l'inventaire ?`
    );

    if (!ok) return;

    const { error } = await supabase
      .from("stock_items")
      .update({ active: false })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Article retiré de l'inventaire.");
    await loadStock();
  }

  const criticalItems = items.filter((item) => {
    const current = Number(item.current_quantity || 0);
    const minimum = Number(item.minimum_quantity || 0);

    return minimum > 0 && current < minimum;
  });

  const filteredItems = items.filter((item) => {
    const query = search.toLowerCase();

    const matchesSearch =
      (item.reference || "").toLowerCase().includes(query) ||
      (item.name || "").toLowerCase().includes(query) ||
      (item.stock_categories?.name || "").toLowerCase().includes(query);

    const matchesCategory =
      selectedCategory === "all" || item.category_id === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  function exportMissingProducts() {
    const rows = [
      [
        "Référence",
        "Désignation",
        "Sous-catégorie",
        "Stock actuel",
        "Stock mini",
        "Quantité à commander",
        "Unité",
      ],
      ...criticalItems.map((item) => {
        const current = Number(item.current_quantity || 0);
        const minimum = Number(item.minimum_quantity || 0);

        return [
          item.reference || "",
          item.name || "",
          item.stock_categories?.name || "",
          current,
          minimum,
          Math.max(0, minimum - current),
          item.unit || "",
        ];
      }),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(";")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "produits-manquants.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Stock</p>
          <h2>Gestion simple du stock</h2>
          <p>Articles classés uniquement par sous-catégories.</p>
        </div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="stats-grid">
        <div className="stat-card">
          <span>Articles</span>
          <strong>{items.length}</strong>
        </div>

        <div className="stat-card accent">
          <span>Alertes stock mini</span>
          <strong>{criticalItems.length}</strong>
        </div>

        <div className="stat-card">
          <span>Projets actifs</span>
          <strong>{projects.length}</strong>
        </div>
      </div>

      <div className="card">
        <h3>Sous-catégories</h3>

        <div className="category-tabs">
          <button
            className={selectedCategory === "all" ? "active" : ""}
            onClick={() => setSelectedCategory("all")}
          >
            Toutes
          </button>

          {categories.map((category) => (
            <div className="category-tab" key={category.id}>
              <button
                className={selectedCategory === category.id ? "active" : ""}
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.name}
              </button>

              <button
                className="category-delete"
                onClick={() => deleteCategory(category)}
                title="Supprimer la sous-catégorie"
              >
                ×
              </button>
            </div>
          ))}

          <button className="add-tab" onClick={createCategory}>
            + Ajouter
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Ajouter un article</h3>

        <form onSubmit={createItem} className="grid">
          <div>
            <label>Référence</label>
            <input
              placeholder="Ex : X-0001"
              value={form.reference}
              onChange={(e) =>
                setForm({ ...form, reference: e.target.value })
              }
            />
          </div>

          <div>
            <label>Désignation</label>
            <input
              placeholder="Ex : Ciment, buse, durite..."
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label>Sous-catégorie</label>
            <select
              value={form.category_id}
              onChange={(e) =>
                setForm({ ...form, category_id: e.target.value })
              }
            >
              <option value="">Sans sous-catégorie</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Unité</label>
            <input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </div>

          <div>
            <label>Stock mini</label>
            <input
              type="number"
              value={form.minimum_quantity}
              onChange={(e) =>
                setForm({ ...form, minimum_quantity: e.target.value })
              }
            />
          </div>

          <div className="align-end">
            <button className="btn primary">Ajouter</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Inventaire</h3>

        <div className="stock-toolbar">
          <input
            placeholder="Rechercher par référence, désignation ou sous-catégorie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button className="btn primary" onClick={exportMissingProducts}>
            Export manquants
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Référence</th>
              <th>Désignation</th>
              <th>Sous-catégorie</th>
              <th>Stock</th>
              <th>Mini</th>
              <th>Alerte</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredItems.map((item) => {
              const current = Number(item.current_quantity || 0);
              const minimum = Number(item.minimum_quantity || 0);
             const isCritical = minimum > 0 && current < minimum;

              return (
                <tr key={item.id}>
                  <td>
                    <strong>{item.reference || "-"}</strong>
                  </td>

                  <td>{item.name}</td>

                  <td>{item.stock_categories?.name || "-"}</td>

                  <td>
                    {item.current_quantity} {item.unit}
                  </td>

                  <td>
                    {item.minimum_quantity} {item.unit}
                  </td>

                  <td>
                    {isCritical ? (
                      <span className="status-pill refused">Stock bas</span>
                    ) : (
                      <span className="status-pill validated">OK</span>
                    )}
                  </td>

                  <td>
                    <div className="inline-actions">
                      <button
                        className="btn small"
                        onClick={() => moveStock(item, "in")}
                      >
                        + Entrée
                      </button>

                      <button
                        className="btn small"
                        onClick={() => moveStock(item, "out")}
                      >
                        - Sortie
                      </button>

                      <button
                        className="btn small"
                        onClick={() => editQuantity(item)}
                      >
                        Modifier qté
                      </button>

                      <button
                        className="btn small"
                        onClick={() => editMinimum(item)}
                      >
                        Modifier mini
                      </button>

                      <button
                        className="btn small"
                        onClick={() => editReference(item)}
                      >
                        Modifier réf.
                      </button>

                      <button
                        className="btn small"
                        onClick={() => editSubCategory(item)}
                      >
                        Sous-cat.
                      </button>

                      <button
                        className="btn small danger-soft"
                        onClick={() => deleteItem(item)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
