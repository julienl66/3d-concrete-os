import { supabase } from "./supabase.js";

export async function loadAlloCallsForContact(contactId) {
  if (!contactId) return [];

  const { data, error } = await supabase
    .from("allo_calls")
    .select(`
      id,
      allo_call_id,
      crm_contact_id,
      direction,
      result,
      from_number,
      to_number,
      user_email,
      started_at,
      duration_seconds,
      recording_url,
      summary,
      transcript,
      tags
    `)
    .eq("crm_contact_id", contactId)
    .order("started_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

function normalizePhoneForAllo(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (!digits) {
    throw new Error("Aucun numéro de téléphone n'est renseigné.");
  }

  // 06XXXXXXXX → +336XXXXXXXX
  if (digits.length === 10 && digits.startsWith("0")) {
    return `+33${digits.slice(1)}`;
  }

  // 336XXXXXXXX → +336XXXXXXXX
  if (digits.startsWith("33")) {
    return `+${digits}`;
  }

  // Numéro déjà international sans le +
  return `+${digits}`;
}

export function openAlloCall(phone) {
  const normalizedPhone = normalizePhoneForAllo(phone);

  const alloUrl =
    `https://web.withallo.com/?number=${encodeURIComponent(normalizedPhone)}`;

  const alloWindow = window.open(
    alloUrl,
    "allo-call",
    "width=480,height=820,resizable=yes,scrollbars=yes"
  );

  if (!alloWindow) {
    throw new Error(
      "Le navigateur a bloqué l'ouverture d'Allo. Autorise les fenêtres pop-up pour cet ERP."
    );
  }

  alloWindow.focus();
}