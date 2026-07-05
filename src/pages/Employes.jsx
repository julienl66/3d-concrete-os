import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.js";
import { ACTIONS, MODULES, defaultPermissions } from "../services/permissions.js";

const ROLES = [
  { value: "admin", label: "Administrateur" },
  { value: "direction", label: "Direction" },
  { value: "atelier", label: "Chef d'atelier" },
  { value: "commercial", label: "Commercial" },
  { value: "employee", label: "Employé" },
];

export default function Employes({ user }) {
  const [employees, setEmployees] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    pin: "",
    role: "employee",
    active: true,
  });

  const [permissionForm, setPermissionForm] = useState(defaultPermissions("employee"));

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    const [{ data: employeesData, error: employeesError }, { data: permissionsData, error: permissionsError }] =
      await Promise.all([
        supabase.from("employees").select("*").order("name"),
        supabase.from("employee_permissions").select("*"),
      ]);

    if (employeesError || permissionsError) {
      setMessage((employeesError || permissionsError).message);
      return;
    }

    setEmployees(employeesData || []);
    setPermissions(permissionsData || []);
  }

  function roleLabel(role) {
    return ROLES.find((item) => item.value === role)?.label || role || "-";
  }

  function permissionsForEmployee(employee) {
    if (employee.role === "admin") {
      return defaultPermissions("admin");
    }

    const result = defaultPermissions(employee.role || "employee");

    permissions
      .filter((permission) => permission.employee_id === employee.id)
      .forEach((permission) => {
        result[permission.module_key] = {
          can_view: !!permission.can_view,
          can_create: !!permission.can_create,
          can_edit: !!permission.can_edit,
          can_delete: !!permission.can_delete,
        };
      });

    return result;
  }

  function openCreateModal() {
    setEditingEmployee(null);
    setForm({
      name: "",
      email: "",
      pin: "",
      role: "employee",
      active: true,
    });
    setPermissionForm(defaultPermissions("employee"));
    setModalOpen(true);
  }

  function openEditModal(employee) {
    setEditingEmployee(employee);
    setForm({
      name: employee.name || "",
      email: employee.email || "",
      pin: "",
      role: employee.role || "employee",
      active: employee.active !== false,
    });
    setPermissionForm(permissionsForEmployee(employee));
    setModalOpen(true);
  }

  function applyRolePreset(role) {
    setForm((current) => ({
      ...current,
      role,
    }));

    setPermissionForm(defaultPermissions(role));
  }

  function updatePermission(moduleKey, actionKey, value) {
    setPermissionForm((current) => ({
      ...current,
      [moduleKey]: {
        ...current[moduleKey],
        [actionKey]: value,
      },
    }));
  }

  async function saveEmployeePermissions(employeeId) {
    const rows = MODULES.map((module) => ({
      employee_id: employeeId,
      module_key: module.key,
      can_view: !!permissionForm[module.key]?.can_view,
      can_create: !!permissionForm[module.key]?.can_create,
      can_edit: !!permissionForm[module.key]?.can_edit,
      can_delete: !!permissionForm[module.key]?.can_delete,
      can_validate: !!permissionForm[module.key]?.can_validate,
      can_archive: !!permissionForm[module.key]?.can_archive,
      can_restore: !!permissionForm[module.key]?.can_restore,
      can_export: !!permissionForm[module.key]?.can_export,
    }));

    const { error } = await supabase
      .from("employee_permissions")
      .upsert(rows, {
        onConflict: "employee_id,module_key",
      });

    if (error) {
      throw error;
    }
  }

  async function saveEmployee() {
    if (!form.name) {
      setMessage("Nom obligatoire.");
      return;
    }

    if (!editingEmployee && !form.pin) {
      setMessage("Code PIN obligatoire pour un nouvel employé.");
      return;
    }

    const payload = {
      name: form.name,
      email: form.email || null,
      role: form.role,
      active: form.active,
    };

    if (form.pin) {
      payload.pin = form.pin;
    }

    const request = editingEmployee
      ? supabase.from("employees").update(payload).eq("id", editingEmployee.id).select().single()
      : supabase.from("employees").insert(payload).select().single();

    const { data, error } = await request;

    if (error) {
      setMessage(error.message);
      return;
    }

    try {
      await saveEmployeePermissions(data.id);
    } catch (permissionError) {
      setMessage(permissionError.message);
      return;
    }

    setMessage(editingEmployee ? "Employé et autorisations modifiés." : "Employé ajouté.");
    setModalOpen(false);
    setEditingEmployee(null);
    loadEmployees();
  }

  async function toggleEmployeeActive(employee) {
    const { error } = await supabase
      .from("employees")
      .update({ active: employee.active === false })
      .eq("id", employee.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(employee.active === false ? "Employé réactivé." : "Employé désactivé.");
    loadEmployees();
  }

  async function deleteEmployee(employee) {
    const ok = window.confirm(
      `Supprimer définitivement "${employee.name}" ? Je conseille plutôt de désactiver l'employé.`
    );

    if (!ok) return;

    const { error } = await supabase.from("employees").delete().eq("id", employee.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Employé supprimé.");
    loadEmployees();
  }

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const query = search.toLowerCase();

      const matchesSearch =
        (employee.name || "").toLowerCase().includes(query) ||
        (employee.email || "").toLowerCase().includes(query) ||
        (employee.role || "").toLowerCase().includes(query);

      const matchesActive = showInactive ? true : employee.active !== false;

      return matchesSearch && matchesActive;
    });
  }, [employees, search, showInactive]);

  const activeCount = employees.filter((employee) => employee.active !== false).length;
  const inactiveCount = employees.filter((employee) => employee.active === false).length;
  const adminCount = employees.filter((employee) => employee.role === "admin").length;

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
          <h2>Employés & autorisations</h2>
          <p>Droits indépendants par onglet : consulter, ajouter, modifier, supprimer.</p>
        </div>

        <button className="btn primary" onClick={openCreateModal}>
          + Ajouter employé
        </button>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="stats-grid">
        <div className="stat-card">
          <span>Employés actifs</span>
          <strong>{activeCount}</strong>
        </div>

        <div className="stat-card">
          <span>Désactivés</span>
          <strong>{inactiveCount}</strong>
        </div>

        <div className="stat-card accent">
          <span>Administrateurs</span>
          <strong>{adminCount}</strong>
        </div>
      </div>

      <div className="card">
        <div className="employees-toolbar">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un employé, email ou rôle..."
          />

          <label className="employees-checkbox">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Afficher désactivés
          </label>
        </div>

        {filteredEmployees.length === 0 ? (
          <p>Aucun employé trouvé.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employé</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Accès principaux</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredEmployees.map((employee) => {
                const employeeRights = permissionsForEmployee(employee);
                const visibleModules = MODULES.filter(
                  (module) => employeeRights[module.key]?.can_view
                );

                return (
                  <tr key={employee.id}>
                    <td>
                      <strong>{employee.name}</strong>
                      <br />
                      <small>{employee.email || "-"}</small>
                    </td>

                    <td>{roleLabel(employee.role)}</td>

                    <td>
                      {employee.active !== false ? (
                        <span className="status-pill validated">Actif</span>
                      ) : (
                        <span className="status-pill refused">Désactivé</span>
                      )}
                    </td>

                    <td>
                      <div className="permission-badges">
                        {visibleModules.length === 0 ? (
                          <span>Aucun accès</span>
                        ) : (
                          visibleModules.slice(0, 5).map((module) => (
                            <span key={module.key}>{module.label}</span>
                          ))
                        )}
                        {visibleModules.length > 5 && <span>+{visibleModules.length - 5}</span>}
                      </div>
                    </td>

                    <td>
                      <div className="inline-actions">
                        <button className="btn small" onClick={() => openEditModal(employee)}>
                          Modifier droits
                        </button>

                        <button className="btn small" onClick={() => toggleEmployeeActive(employee)}>
                          {employee.active === false ? "Réactiver" : "Désactiver"}
                        </button>

                        <button className="btn small danger-soft" onClick={() => deleteEmployee(employee)}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="modal-backdrop">
          <div className="employee-modal employee-modal-large">
            <div className="page-head">
              <div>
                <p className="eyebrow">Employé</p>
                <h3>{editingEmployee ? "Modifier l'employé" : "Nouvel employé"}</h3>
              </div>

              <button className="btn small" onClick={() => setModalOpen(false)}>
                Fermer
              </button>
            </div>

            <div className="grid">
              <div>
                <label>Nom</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex : William"
                />
              </div>

              <div>
                <label>Email</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@3dconcrete.fr"
                />
              </div>

              <div>
                <label>{editingEmployee ? "Nouveau code PIN optionnel" : "Code PIN"}</label>
                <input
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value })}
                  placeholder={editingEmployee ? "Laisser vide pour ne pas changer" : "Ex : 1234"}
                />
              </div>

              <div>
                <label>Rôle</label>
                <select value={form.role} onChange={(e) => applyRolePreset(e.target.value)}>
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label className="employees-checkbox">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Employé actif
                </label>
              </div>
            </div>

            <div className="permissions-card">
              <h4>Droits par onglet</h4>
              <p>Chaque onglet peut être réglé indépendamment.</p>

              <div className="permissions-table">
                <div className="permissions-header">
                  <strong>Onglet</strong>
                  {ACTIONS.map((action) => (
                    <strong key={action.key}>{action.label}</strong>
                  ))}
                </div>

                {MODULES.map((module) => (
                  <div className="permissions-row" key={module.key}>
                    <strong>{module.label}</strong>

                    {ACTIONS.map((action) => (
                      <label key={`${module.key}-${action.key}`}>
                        <input
                          type="checkbox"
                          checked={!!permissionForm[module.key]?.[action.key]}
                          onChange={(e) =>
                            updatePermission(module.key, action.key, e.target.checked)
                          }
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="planning-modal-actions">
              <button className="btn secondary" onClick={() => setModalOpen(false)}>
                Annuler
              </button>

              <button className="btn primary" onClick={saveEmployee}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
