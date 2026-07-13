import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Allo webhook actif",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const payload = await req.json();

    if (payload?.topic !== "call.completed") {
      return new Response(
        JSON.stringify({
          success: true,
          ignored: true,
          topic: payload?.topic || null,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const data = payload.data || {};

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Configuration Supabase absente.");
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
    );

    const externalPhone =
      data.type === "OUTBOUND"
        ? data.to
        : data.from_number;

    const {
      data: matchedContacts,
      error: matchedContactError,
    } = await supabase.rpc(
      "find_crm_contact_by_phone",
      {
        search_phone: externalPhone,
      },
    );

    if (matchedContactError) {
      throw matchedContactError;
    }

    const matchedContact =
      Array.isArray(matchedContacts) && matchedContacts.length > 0
        ? matchedContacts[0]
        : null;

    const durationSeconds = Math.round(
      Number(data.length_in_minutes || 0) * 60,
    );

    const transcript =
      data.concatenated_transcript ||
      (
        Array.isArray(data.transcriptions)
          ? data.transcriptions
              .map((item: Record<string, unknown>) => {
                const speaker =
                  item.source === "USER"
                    ? "Équipe"
                    : "Interlocuteur";

                const text = String(item.text || "").trim();

                return text
                  ? `${speaker}: ${text}`
                  : "";
              })
              .filter(Boolean)
              .join("\n")
          : ""
      );

    const {
      data: savedCall,
      error: alloCallError,
    } = await supabase
      .from("allo_calls")
      .upsert(
        {
          allo_call_id: data.id,
          crm_contact_id: matchedContact?.id || null,
          direction: data.type || null,
          result: data.result || null,
          from_number: data.from_number || null,
          to_number: data.to || null,
          user_email: data.user_email || null,
          started_at:
            data.start_date ||
            payload.timestamp ||
            null,
          duration_seconds: durationSeconds,
          recording_url: data.recording_url || null,
          summary: data.summary || null,
          transcript: transcript || null,
          tags: data.tags || [],
          raw_payload: data,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "allo_call_id",
        },
      )
      .select()
      .single();

    if (alloCallError) {
      throw alloCallError;
    }

    if (matchedContact?.id) {
      const {
        data: existingInteraction,
        error: existingInteractionError,
      } = await supabase
        .from("crm_interactions")
        .select("id")
        .eq("contact_id", matchedContact.id)
        .eq(
          "subject",
          data.type === "INBOUND"
            ? "Appel entrant Allo"
            : "Appel sortant Allo",
        )
        .eq(
          "interaction_date",
          data.start_date ||
            payload.timestamp ||
            "",
        )
        .maybeSingle();

      if (existingInteractionError) {
        console.error(
          "Erreur vérification interaction CRM :",
          existingInteractionError.message,
        );
      }

      if (!existingInteraction) {
        const { error: interactionError } = await supabase
          .from("crm_interactions")
          .insert({
            contact_id: matchedContact.id,
            interaction_type: "appel",
            subject:
              data.type === "INBOUND"
                ? "Appel entrant Allo"
                : "Appel sortant Allo",
            notes: data.summary || null,
            call_duration_seconds: durationSeconds,
            call_status: data.result || null,
            done: true,
            interaction_date:
              data.start_date ||
              payload.timestamp ||
              new Date().toISOString(),
          });

        if (interactionError) {
          console.error(
            "Erreur création interaction CRM :",
            interactionError.message,
          );
        }
      }
    }

    console.log(
      "Appel Allo enregistré :",
      savedCall?.allo_call_id || data.id,
    );

    console.log(
      "Contact CRM associé :",
      matchedContact?.company_name ||
        "aucun contact trouvé",
    );

    return new Response(
      JSON.stringify({
        success: true,
        allo_call_id:
          savedCall?.allo_call_id ||
          data.id,
        crm_contact_id:
          matchedContact?.id ||
          null,
        matched_company:
          matchedContact?.company_name ||
          null,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error(
      "Erreur webhook Allo :",
      error,
    );

    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
});