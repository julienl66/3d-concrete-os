import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

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
  return bytesToBase64Url(new TextEncoder().encode(value));
}

async function createSignedState(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const encodedPayload = textToBase64Url(JSON.stringify(payload));

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

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload),
  );

  const signature = bytesToBase64Url(
    new Uint8Array(signatureBuffer),
  );

  return `${encodedPayload}.${signature}`;
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
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleRedirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
    const googleScopes = Deno.env.get("GOOGLE_SCOPES");
    const googleStateSecret = Deno.env.get("GOOGLE_STATE_SECRET");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        "Les variables SUPABASE_URL ou SUPABASE_ANON_KEY sont absentes.",
      );
    }

    if (
      !googleClientId ||
      !googleRedirectUri ||
      !googleScopes ||
      !googleStateSecret
    ) {
      throw new Error(
        "La configuration OAuth Google est incomplète.",
      );
    }

    const authorizationHeader = req.headers.get("Authorization");

    if (!authorizationHeader?.startsWith("Bearer ")) {
      return jsonResponse(
        {
          success: false,
          error: "Utilisateur non authentifié.",
        },
        401,
      );
    }

    const accessToken = authorizationHeader.replace("Bearer ", "").trim();

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      console.error("Supabase authentication error:", userError);

      return jsonResponse(
        {
          success: false,
          error: "Session Supabase invalide ou expirée.",
        },
        401,
      );
    }

    const now = Math.floor(Date.now() / 1000);

    const state = await createSignedState(
      {
        user_id: user.id,
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
      "scope",
      googleScopes,
    );

    authorizationUrl.searchParams.set(
      "access_type",
      "offline",
    );

    authorizationUrl.searchParams.set(
      "prompt",
      "consent",
    );

    authorizationUrl.searchParams.set(
      "include_granted_scopes",
      "true",
    );

    authorizationUrl.searchParams.set(
      "state",
      state,
    );

    return jsonResponse({
      success: true,
      auth_url: authorizationUrl.toString(),
    });
  } catch (error) {
    console.error("gmail-auth error:", error);

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue lors de la création de l’URL Google.",
      },
      500,
    );
  }
});