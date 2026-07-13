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

export function openAlloCall(phone) {
  if (!phone) {
    throw new Error("Aucun numéro de téléphone n'est renseigné.");
  }

  const normalizedPhone = String(phone).replace(/\s+/g, "");

  window.location.href = `tel:${normalizedPhone}`;
}