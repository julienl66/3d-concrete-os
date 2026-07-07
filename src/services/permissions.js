import { supabase } from "./supabase.js";

export const MODULES = [
  { key: "dashboard", label: "Tableau de bord" },
  { key: "pointage", label: "Pointage" },
  { key: "employes", label: "Employés / droits" },
  { key: "projets", label: "Projets" },
  { key: "chiffrage", label: "Chiffrage" },
  { key: "crm", label: "CRM" },
  { key: "bi", label: "Business Intelligence" },
  { key: "weekly", label: "Points hebdomadaires" },
  { key: "planning", label: "Planning" },
  { key: "stock", label: "Stock" },
  { key: "couts", label: "Coûts & marges" },
  { key: "administration", label: "Administration" },
];

export const ACTIONS = [
  { key: "can_view", label: "Consulter" },
  { key: "can_create", label: "Créer" },
  { key: "can_edit", label: "Modifier" },
  { key: "can_delete", label: "Supprimer" },
  { key: "can_validate", label: "Valider" },
  { key: "can_archive", label: "Archiver" },
  { key: "can_restore", label: "Restaurer" },
  { key: "can_export", label: "Exporter" },
];

function emptyPermissions(canView = false) {
  return {
    can_view: canView,
    can_create: false,
    can_edit: false,
    can_delete: false,
    can_validate: false,
    can_archive: false,
    can_restore: false,
    can_export: false,
  };
}

function fullPermissions() {
  return {
    can_view: true,
    can_create: true,
    can_edit: true,
    can_delete: true,
    can_validate: true,
    can_archive: true,
    can_restore: true,
    can_export: true,
  };
}

export function defaultPermissions(role = "employee") {
  const permissions = {};

  MODULES.forEach((module) => {
    permissions[module.key] = emptyPermissions(
      module.key === "dashboard" || module.key === "pointage"
    );
  });

  if (role === "admin") {
    MODULES.forEach((module) => {
      permissions[module.key] = fullPermissions();
    });
  }

  if (role === "direction") {

    [
      "dashboard",
      "pointage",
      "projets",
      "chiffrage",
      "crm",
      "bi",
      "weekly",
      "planning",
      "stock",
      "couts",
      "administration"
    ].forEach((module) => {

      permissions[module] = {

        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: true,
        can_validate: true,
        can_archive: true,
        can_restore: true,
        can_export: true,

      };

    });

  }

  if (role === "commercial") {

    permissions.dashboard = fullPermissions();

    permissions.crm = {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: true,
      can_validate: true,
      can_archive: false,
      can_restore: false,
      can_export: true,
    };

    permissions.chiffrage = {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: false,
      can_validate: true,
      can_archive: false,
      can_restore: false,
      can_export: true,
    };

    permissions.projets = {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: false,
      can_validate: true,
      can_archive: false,
      can_restore: false,
      can_export: true,
    };

    permissions.weekly = {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: false,
      can_validate: true,
      can_archive: false,
      can_restore: false,
      can_export: false,
    };

    permissions.bi.can_view = true;

  }

  if (role === "atelier") {

    permissions.dashboard.can_view = true;
    permissions.pointage.can_view = true;
    permissions.pointage.can_edit = true;

    permissions.planning.can_view = true;

    permissions.stock.can_view = true;
    permissions.stock.can_edit = true;

    permissions.projets.can_view = true;

    permissions.weekly = {
      can_view: true,
      can_create: false,
      can_edit: false,
      can_delete: false,
      can_validate: true,
      can_archive: false,
      can_restore: false,
      can_export: false,
    };

  }

  return permissions;
}

export async function loadEmployeePermissions(employee) {

  if (!employee?.id)
    return {};

  if (employee.role === "admin")
    return defaultPermissions("admin");

  const { data, error } = await supabase
    .from("employee_permissions")
    .select("*")
    .eq("employee_id", employee.id);

  if (error) {

    console.error(error);

    return defaultPermissions(employee.role);

  }

  const permissions = defaultPermissions(employee.role);

  (data || []).forEach((row) => {

    permissions[row.module_key] = {

      can_view: row.can_view,
      can_create: row.can_create,
      can_edit: row.can_edit,
      can_delete: row.can_delete,
      can_validate: row.can_validate,
      can_archive: row.can_archive,
      can_restore: row.can_restore,
      can_export: row.can_export,

    };

  });

  return permissions;

}

export function canAccess(user, permissions, moduleKey, action = "can_view") {

  if (!user)
    return false;

  if (user.role === "admin")
    return true;

  return !!permissions?.[moduleKey]?.[action];

}