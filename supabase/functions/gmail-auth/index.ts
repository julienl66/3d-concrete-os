type RequestBody = {
  user_id?: string;
  return_url?: string;
};

type StatePayload = {
  user_id: string;
  nonce: string;
  issued_at: number;
  expires_at: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function textToBase64Url(value: string): string {
  return bytesToBase64Url(
    new TextEncoder().encode(value),
  );
}

async function createSignedState(
  payload: StatePayload,
  secret: string,
): Promise<string> {
  const encodedPayload = textToBase64Url(
    JSON.stringify(payload),
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload),
  );

  const encodedSignature = bytesToBase64Url(
    new Uint8Array(signature),
  );

  return `${encodedPayload}.${encodedSignature}`;
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed",
      },
      405,
    );
  }

  try {
    const {
      user_id: userId,
    } = (await req.json()) as RequestBody;

    if (!userId || typeof userId !== "string") {
      return jsonResponse(
        {
          error:
            "L’identifiant de l’utilisateur ERP est manquant.",
        },
        400,
      );
    }

    const googleClientId = Deno.env.get(
      "GOOGLE_CLIENT_ID",
    );

    const googleRedirectUri = Deno.env.get(
      "GOOGLE_REDIRECT_URI",
    );

    const googleStateSecret = Deno.env.get(
      "GOOGLE_STATE_SECRET",
    );

    if (
      !googleClientId ||
      !googleRedirectUri ||
      !googleStateSecret
    ) {
      console.error("Configuration OAuth incomplète", {
        hasGoogleClientId: Boolean(googleClientId),
        hasGoogleRedirectUri: Boolean(
          googleRedirectUri,
        ),
        hasGoogleStateSecret: Boolean(
          googleStateSecret,
        ),
      });

      return jsonResponse(
        {
          error:
            "La configuration OAuth Google est incomplète.",
        },
        500,
      );
    }

    const now = Math.floor(Date.now() / 1000);

    const state = await createSignedState(
      {
        user_id: userId,
        nonce: crypto.randomUUID(),
        issued_at: now,
        expires_at: now + 10 * 60,
      },
      googleStateSecret,
    );

    const authorizationUrl = new URL(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );

    authorizationUrl.searchParams.set(
      "client_id",
      googleClientId,
    );

    authorizationUrl.searchParams.set(
      "redirect_uri",
      googleRedirectUri,
    );

    authorizationUrl.searchParams.set(
      "response_type",
      "code",
    );

    authorizationUrl.searchParams.set(
      "access_type",
      "offline",
    );

    /*
     * Force l’écran de consentement Google.
     * Cela permet d’obtenir un nouveau refresh_token
     * et d’accepter les nouvelles autorisations Gmail.
     */
    authorizationUrl.searchParams.set(
      "prompt",
      "consent",
    );

    /*
     * Conserve les autorisations déjà accordées
     * et ajoute les nouvelles autorisations demandées.
     */
    authorizationUrl.searchParams.set(
      "include_granted_scopes",
      "true",
    );

    /*
     * Autorisations demandées :
     *
     * - openid, email, profile :
     *   identification du compte Google connecté.
     *
     * - gmail.readonly :
     *   lecture des messages et des conversations.
     *
     * - gmail.send :
     *   envoi d’e-mails depuis l’ERP.
     *
     * - gmail.modify :
     *   gestion des messages et libellés Gmail.
     */
    authorizationUrl.searchParams.set(
      "scope",
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
      ].join(" "),
    );

    authorizationUrl.searchParams.set(
      "state",
      state,
    );

    return jsonResponse({
      url: authorizationUrl.toString(),
    });
  } catch (error) {
    console.error("gmail-auth error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Erreur inconnue";

    return jsonResponse(
      {
        error: message,
      },
      500,
    );
  }
});