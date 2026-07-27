export function dateToYmd(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addRecurrence(date, type, interval = 1) {
  const next = new Date(date);
  const step = Math.max(1, Number(interval || 1));
  if (type === "daily") next.setDate(next.getDate() + step);
  if (type === "weekly") next.setDate(next.getDate() + 7 * step);
  if (type === "monthly") next.setMonth(next.getMonth() + step);
  if (type === "yearly") next.setFullYear(next.getFullYear() + step);
  return next;
}

export function maintenanceOccurrences(activity, rangeStart, rangeEnd) {
  const start = parseLocalDate(activity?.scheduled_date);
  if (!start) return [];

  const from = parseLocalDate(rangeStart) || start;
  const to = parseLocalDate(rangeEnd) || start;
  const recurrenceEnd = parseLocalDate(activity?.recurrence_end_date);
  const hardEnd = recurrenceEnd && recurrenceEnd < to ? recurrenceEnd : to;
  const recurrenceType = activity?.recurrence_type || "none";

  if (recurrenceType === "none") {
    return start >= from && start <= hardEnd ? [dateToYmd(start)] : [];
  }

  const rows = [];
  let cursor = new Date(start);
  let safety = 0;

  // Saute rapidement les occurrences nettement antérieures à la fenêtre.
  while (cursor < from && safety < 5000) {
    cursor = addRecurrence(cursor, recurrenceType, activity?.recurrence_interval || 1);
    safety += 1;
  }

  while (cursor <= hardEnd && safety < 5000) {
    rows.push(dateToYmd(cursor));
    cursor = addRecurrence(cursor, recurrenceType, activity?.recurrence_interval || 1);
    safety += 1;
  }

  return rows;
}

export function recurrenceLabel(activity) {
  const type = activity?.recurrence_type || "none";
  const interval = Math.max(1, Number(activity?.recurrence_interval || 1));
  if (type === "none") return "Ponctuelle";
  const labels = {
    daily: ["jour", "jours"],
    weekly: ["semaine", "semaines"],
    monthly: ["mois", "mois"],
    yearly: ["an", "ans"],
  };
  const label = labels[type] || ["période", "périodes"];
  return interval === 1 ? `Chaque ${label[0]}` : `Tous les ${interval} ${label[1]}`;
}
