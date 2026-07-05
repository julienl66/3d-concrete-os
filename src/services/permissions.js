export function hasPermission(user, module, permission) {
  if (!user) return false;

  // L'admin a tous les droits
  if (user.role === "admin") return true;

  const permissions = user.permissions || {};

  if (!permissions[module]) return false;

  return permissions[module].includes(permission);
}

export function canView(user, module) {
  return hasPermission(user, module, "view");
}

export function canCreate(user, module) {
  return hasPermission(user, module, "create");
}

export function canEdit(user, module) {
  return hasPermission(user, module, "edit");
}

export function canDelete(user, module) {
  return hasPermission(user, module, "delete");
}

export function canValidate(user, module) {
  return hasPermission(user, module, "validate");
}

export function canArchive(user, module) {
  return hasPermission(user, module, "archive");
}