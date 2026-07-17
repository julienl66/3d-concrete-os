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

  if (digits.length === 10 && digits.startsWith("0")) {
    return `+33${digits.slice(1)}`;
  }

  if (digits.startsWith("0033")) {
    return `+33${digits.slice(4)}`;
  }

  if (digits.startsWith("33")) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

export async function openAlloCall(phone) {
  const normalizedPhone = normalizePhoneForAllo(phone);

  // On ouvre immédiatement une fenêtre vide pour éviter
  // que Chrome bloque la pop-up après l'appel asynchrone.
  const alloWindow = window.open(
    "about:blank",
    "allo-call",
    "width=480,height=820,resizable=yes,scrollbars=yes"
  );

  if (!alloWindow) {
    throw new Error(
      "Chrome a bloqué l'ouverture d'Allo. Autorise les pop-ups pour l'ERP."
    );
  }

  alloWindow.document.title = "Ouverture d'Allo...";
  alloWindow.document.body.innerHTML =
    "<p style='font-family:Arial;padding:20px'>Recherche du contact dans Allo...</p>";

  const { data, error } = await supabase.functions.invoke(
    "allo-open-contact",
    {
      body: {
        phone: normalizedPhone,
        allo_number: "+33745804549",
      },
    }
  );

  if (error) {
    alloWindow.close();
    throw error;
  }

  if (!data?.success || !data?.allo_url) {
    alloWindow.close();
    throw new Error(
      data?.error || "Allo n'a pas retourné d'URL pour ce contact."
    );
  }

  alloWindow.location.href = data.allo_url;
  alloWindow.focus();

  return data;
}