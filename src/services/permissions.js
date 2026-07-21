import { supabase } from "./supabase.js";

export const MODULES = [
  { key: "dashboard", label: "Tableau de bord" },
  { key: "activity", label: "Activity Center" },
  { key: "pointage", label: "Pointage" },
  { key: "employes", label: "Employés / droits" },
  { key: "projets", label: "Projets" },
  { key: "chiffrage", label: "Chiffrage" },
  { key: "crm", label: "CRM" },
  { key: "messagerie", label: "Messagerie" },
  { key: "bi", label: "Business Intelligence" },
  { key: "weekly", label: "Points hebdo" },
  { key: "planning", label: "Planning" },
  { key: "stock", label: "Stock" },
  { key: "couts", label: "Coûts & marges" },
  { key: "administration", label: "Administration" },
];

export const ACTIONS = [
  { key: "can_view", label: "Consulter" },
  { key: "can_create", label: "Ajouter" },
  { key: "can_edit", label: "Modifier" },
  { key: "can_delete", label: "Supprimer" },
  { key: "can_validate", label: "Valider" },
  { key: "can_archive", label: "Archiver" },
  { key: "can_restore", label: "Restaurer" },
  { key: "can_export", label: "Exporter" },
];

function emptyRight(canView = false) {
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

function fullRight() {
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
  const rights = {};

  MODULES.forEach((module) => {
    rights[module.key] = emptyRight(
      module.key === "dashboard" ||
      module.key === "activity" ||
      module.key === "pointage"
    );
  });

  if (role === "admin") {
    MODULES.forEach((module) => {
      rights[module.key] = fullRight();
    });
  }

  if (role === "direction") {
    [
      "dashboard",
      "activity",
      "projets",
      "chiffrage",
      "crm",
      "messagerie",
      "bi",
      "weekly",
      "planning",
      "stock",
      "couts",
      "pointage",
      "administration",
    ].forEach((key) => {
      rights[key] = {
        ...emptyRight(true),
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

  if (role === "atelier") {
    [
      "dashboard",
      "activity",
      "pointage",
      "planning",
      "stock",
      "projets",
      "weekly",
    ].forEach((key) => {
      rights[key] = {
        ...emptyRight(true),
        can_create: key !== "dashboard" && key !== "activity",
        can_edit: key !== "dashboard" && key !== "activity",
        can_delete: false,
        can_validate: key === "weekly",
        can_archive: false,
        can_restore: false,
        can_export: true,
      };
    });
  }

  if (role === "commercial") {
    [
      "dashboard",
      "activity",
      "projets",
      "chiffrage",
      "crm",
      "messagerie",
      "bi",
      "weekly",
      "planning",
    ].forEach((key) => {
      rights[key] = {
        ...emptyRight(true),
        can_create:
          key === "projets" ||
          key === "chiffrage" ||
          key === "crm" ||
          key === "weekly" ||
          key === "activity",
        can_edit:
          key === "projets" ||
          key === "chiffrage" ||
          key === "crm" ||
          key === "weekly",
        can_delete: key === "crm",
        can_validate: key === "chiffrage" || key === "weekly",
        can_archive: false,
        can_restore: false,
        can_export: true,
      };
    });
  }

  return rights;
}

export async function loadEmployeePermissions(employee) {
  if (!employee?.id) return {};

  if (employee.role === "admin") {
    return defaultPermissions("admin");
  }

  const { data, error } = await supabase
    .from("employee_permissions")
    .select("*")
    .eq("employee_id", employee.id);

  if (error) {
    console.error(error);
    return defaultPermissions(employee.role || "employee");
  }

  const rights = defaultPermissions(employee.role || "employee");

  (data || []).forEach((row) => {
    rights[row.module_key] = {
      can_view: !!row.can_view,
      can_create: !!row.can_create,
      can_edit: !!row.can_edit,
      can_delete: !!row.can_delete,
      can_validate: !!row.can_validate,
      can_archive: !!row.can_archive,
      can_restore: !!row.can_restore,
      can_export: !!row.can_export,
    };
  });

  return rights;
}

export function canAccess(user, permissions, moduleKey, action = "can_view") {
  if (!user) return false;
  if (user.role === "admin") return true;

  return !!permissions?.[moduleKey]?.[action];
}