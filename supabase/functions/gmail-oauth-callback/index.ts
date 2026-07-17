import { createClient } from "npm:@supabase/supabase-js@2";

type StatePayload = {
  user_id: string;
  nonce: string;
  issued_at: number;
  expires_at: number;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeBase64UrlText(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function verifySignedState(
  state: string,
  secret: string,
): Promise<StatePayload> {
  const [encodedPayload, encodedSignature, extraPart] = state.split(".");

  if (!encodedPayload || !encodedSignature || extraPart) {
    throw new Error("Paramètre state OAuth invalide.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );

  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(encodedPayload),
  );

  if (!isValid) {
    throw new Error("Signature OAuth invalide.");
  }

  let payload: StatePayload;

  try {
    payload = JSON.parse(
      decodeBase64UrlText(encodedPayload),
    ) as StatePayload;
  } catch {
    throw new Error("Contenu du state OAuth illisible.");
  }

  if (
    !payload.user_id ||
    !payload.nonce ||
    !payload.issued_at ||
    !payload.expires_at
  ) {
    throw new Error("Contenu du state OAuth incomplet.");
  }

  const now = Math.floor(Date.now() / 1000);

  if (payload.expires_at < now) {
    throw new Error("La demande de connexion Google a expiré.");
  }

  if (payload.issued_at > now + 60) {
    throw new Error("La date du state OAuth est invalide.");
  }

  return payload;
}

function buildErpRedirect(
  erpUrl: string,
  status: "success" | "error",
  details?: Record<string, string>,
): string {
  const redirectUrl = new URL(erpUrl);

  redirectUrl.searchParams.set("integration", "google");
  redirectUrl.searchParams.set("status", status);

  for (const [key, value] of Object.entries(details ?? {})) {
    redirectUrl.searchParams.set(key, value);
  }

  return redirectUrl.toString();
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const erpUrl =
    Deno.env.get("ERP_URL") ??
    "https://3d-concrete-os.vercel.app";

  try {
    if (req.method !== "GET") {
      return new Response("Method not allowed", {
        status: 405,
      });
    }

    const requestUrl = new URL(req.url);

    const oauthError = requestUrl.searchParams.get("error");
    const oauthErrorDescription =
      requestUrl.searchParams.get("error_description");

    if (oauthError) {
      console.error("Google OAuth refusal:", {
        oauthError,
        oauthErrorDescription,
      });

      return redirect(
        buildErpRedirect(erpUrl, "error", {
          reason: oauthError,
        }),
      );
    }

    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");

    if (!code || !state) {
      throw new Error(
        "Google n’a pas renvoyé le code ou le state OAuth.",
      );
    }

    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get(
      "GOOGLE_CLIENT_SECRET",
    );
    const googleRedirectUri = Deno.env.get(
      "GOOGLE_REDIRECT_URI",
    );
    const googleStateSecret = Deno.env.get(
      "GOOGLE_STATE_SECRET",
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    const supabaseServerKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SECRET_KEY");

    if (
      !googleClientId ||
      !googleClientSecret ||
      !googleRedirectUri ||
      !googleStateSecret
    ) {
      throw new Error(
        "Les secrets OAuth Google sont incomplets.",
      );
    }

    if (!supabaseUrl || !supabaseServerKey) {
      throw new Error(
        "La configuration serveur Supabase est incomplète.",
      );
    }

    const statePayload = await verifySignedState(
      state,
      googleStateSecret,
    );

    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: googleRedirectUri,
          grant_type: "authorization_code",
        }),
      },
    );

    const tokenData =
      (await tokenResponse.json()) as GoogleTokenResponse;

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Google token exchange failed:", tokenData);

      throw new Error(
        tokenData.error_description ??
          tokenData.error ??
          "Impossible de récupérer les jetons Google.",
      );
    }

    const userInfoResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      },
    );

    const googleUser =
      (await userInfoResponse.json()) as GoogleUserInfo;

    if (
      !userInfoResponse.ok ||
      !googleUser.sub ||
      !googleUser.email
    ) {
      console.error("Google userinfo failed:", googleUser);

      throw new Error(
        "Impossible d’identifier le compte Google connecté.",
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServerKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const {
      data: existingAccount,
      error: existingAccountError,
    } = await supabaseAdmin
      .from("integration_accounts")
      .select("id, refresh_token")
      .eq("user_id", statePayload.user_id)
      .eq("provider", "google")
      .eq("external_account_id", googleUser.sub)
      .maybeSingle();

    if (existingAccountError) {
      throw new Error(
        `Recherche du compte existant impossible : ${existingAccountError.message}`,
      );
    }

    const expiresAt = tokenData.expires_in
      ? new Date(
          Date.now() + tokenData.expires_in * 1000,
        ).toISOString()
      : null;

    const scopes = tokenData.scope
      ? tokenData.scope.split(/\s+/).filter(Boolean)
      : [];

    const accountValues = {
      user_id: statePayload.user_id,
      provider: "google",
      external_account_id: googleUser.sub,
      email: googleUser.email,
      display_name: googleUser.name ?? googleUser.email,
      access_token: tokenData.access_token,
      refresh_token:
        tokenData.refresh_token ??
        existingAccount?.refresh_token ??
        null,
      token_type: tokenData.token_type ?? "Bearer",
      token_expires_at: expiresAt,
      scopes,
      status: "active",
      connected_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      metadata: {
        email_verified: googleUser.email_verified ?? false,
        picture: googleUser.picture ?? null,
        given_name: googleUser.given_name ?? null,
        family_name: googleUser.family_name ?? null,
      },
    };

    let accountId: string;

    if (existingAccount?.id) {
      const { data, error } = await supabaseAdmin
        .from("integration_accounts")
        .update(accountValues)
        .eq("id", existingAccount.id)
        .select("id")
        .single();

      if (error) {
        throw new Error(
          `Mise à jour du compte Google impossible : ${error.message}`,
        );
      }

      accountId = data.id;
    } else {
      const { data, error } = await supabaseAdmin
        .from("integration_accounts")
        .insert(accountValues)
        .select("id")
        .single();

      if (error) {
        throw new Error(
          `Enregistrement du compte Google impossible : ${error.message}`,
        );
      }

      accountId = data.id;
    }

    const { error: syncStateError } = await supabaseAdmin
      .from("integration_sync_state")
      .upsert(
        {
          integration_account_id: accountId,
          resource_type: "gmail",
          last_error: null,
          consecutive_errors: 0,
          metadata: {
            initial_sync_pending: true,
          },
        },
        {
          onConflict:
            "integration_account_id,resource_type",
        },
      );

    if (syncStateError) {
      console.warn(
        "Création de l’état de synchronisation impossible:",
        syncStateError,
      );
    }

    console.log("Google account connected:", {
      accountId,
      userId: statePayload.user_id,
      email: googleUser.email,
      hasRefreshToken: Boolean(
        tokenData.refresh_token ??
          existingAccount?.refresh_token,
      ),
    });

    return redirect(
      buildErpRedirect(erpUrl, "success", {
        email: googleUser.email,
      }),
    );
  } catch (error) {
    console.error("gmail-oauth-callback error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Erreur inconnue";

    return redirect(
      buildErpRedirect(erpUrl, "error", {
        reason: message.slice(0, 180),
      }),
    );
  }
});