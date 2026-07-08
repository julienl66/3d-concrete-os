import { supabase } from "./supabase.js";

export async function emitEvent({
  event_type,
  entity_type = null,
  entity_id = null,
  title,
  description = null,
  payload = {},
  user = null,
}) {
  if (!event_type || !title) {
    return { error: null };
  }

  return await supabase
    .from("erp_events")
    .insert({
      event_type,
      entity_type,
      entity_id,
      title,
      description,
      payload,
      created_by: user?.id || null,
    });
}