import { supabase } from "./supabase.js";

export async function connectGoogle() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session?.access_token) {
    throw new Error(
      "Ta session a expiré. Déconnecte-toi puis reconnecte-toi à l’ERP."
    );
  }

  const { data, error } = await supabase.functions.invoke("gmail-auth", {
    body: {
      return_url: `${window.location.origin}/administration`,
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    let message = error.message || "Impossible de lancer la connexion Google.";

    try {
      const errorBody = await error.context?.json();
      message =
        errorBody?.error ||
        errorBody?.message ||
        errorBody?.details ||
        message;
    } catch {
      // La réponse d’erreur ne contient pas forcément de JSON.
    }

    throw new Error(message);
  }

  const authorizationUrl =
    data?.url ||
    data?.authorization_url ||
    data?.authorizationUrl ||
    data?.oauth_url;

  if (!authorizationUrl) {
    console.error("Réponse gmail-auth inattendue :", data);

    throw new Error(
      "La fonction gmail-auth n’a pas renvoyé l’URL Google."
    );
  }

  window.location.assign(authorizationUrl);
}

export async function getGoogleIntegrationAccount(userId) {
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from("integration_accounts")
    .select(
      `
        id,
        provider,
        email,
        display_name,
        status,
        connected_at,
        token_expires_at,
        scopes,
        metadata
      `
    )
    .eq("user_id", userId)
    .eq("provider", "google")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}