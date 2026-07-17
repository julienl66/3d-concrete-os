const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(phone: unknown): string {
  const digits = String(phone || "").replace(/\D/g, "");

  if (!digits) {
    throw new Error("Numéro de téléphone absent.");
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      throw new Error("Méthode non autorisée.");
    }

    const apiKey = Deno.env.get("ALLO_API_KEY");

    if (!apiKey) {
      throw new Error("Le secret ALLO_API_KEY est absent.");
    }

    const body = await req.json();

    const contactNumber = normalizePhone(body?.phone);
    const alloNumber = normalizePhone(body?.allo_number);

    const url = new URL(
      "https://api.withallo.com/v2/api/conversations",
    );

    url.searchParams.set("allo_number", alloNumber);
    url.searchParams.set("page", "1");
    url.searchParams.set("size", "100");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let alloResponse: Response;

    try {
      alloResponse = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Api-Key ${apiKey}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const responseText = await alloResponse.text();

    let alloBody: any;

    try {
      alloBody = responseText
        ? JSON.parse(responseText)
        : null;
    } catch {
      alloBody = { raw: responseText };
    }

    if (!alloResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          status: alloResponse.status,
          details: alloBody,
        }),
        {
          status: alloResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const conversations = Array.isArray(alloBody?.data)
      ? alloBody.data
      : [];

    const matchedConversation =
      conversations.find(
        (conversation: Record<string, unknown>) =>
          normalizePhone(conversation.contact_number) === contactNumber,
      ) || null;

    const matchedContact =
      Array.isArray(matchedConversation?.contacts) &&
      matchedConversation.contacts.length > 0
        ? matchedConversation.contacts[0]
        : null;

    const params = new URLSearchParams();
    params.set("number", contactNumber);

    if (matchedContact?.id) {
      params.set("contactId", matchedContact.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        phone: contactNumber,
        allo_number: alloNumber,
        conversation_found: Boolean(matchedConversation),
        conversation_keys: matchedConversation
          ? Object.keys(matchedConversation)
          : [],
        matched_conversation: matchedConversation,
        contact_id: matchedContact?.id || null,
        allo_url:
          `https://web.withallo.com/?${params.toString()}`,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
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
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});