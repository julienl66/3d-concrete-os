import { supabase } from "./supabase.js";

async function readFunctionError(error, fallbackMessage) {
  let message = error?.message || fallbackMessage;

  try {
    const errorBody = await error?.context?.json();

    message =
      errorBody?.error ||
      errorBody?.message ||
      errorBody?.details ||
      message;
  } catch {
    // Ignore si pas de JSON
  }

  return message;
}

export async function connectGoogle(userId) {
  if (!userId) {
    throw new Error(
      "Impossible d'identifier l'utilisateur connecté."
    );
  }

  const { data: employee, error: employeeError } =
    await supabase
      .from("employees")
      .select("id, name, email, active")
      .eq("id", userId)
      .maybeSingle();

  if (employeeError) {
    throw new Error(
      `Impossible de vérifier l'utilisateur ERP : ${employeeError.message}`
    );
  }

  if (!employee) {
    throw new Error(
      `L'utilisateur ERP ${userId} n'existe pas dans la table employees.`
    );
  }

  if (employee.active === false) {
    throw new Error(
      "Ce compte utilisateur ERP est désactivé."
    );
  }

  const { data, error } =
    await supabase.functions.invoke("gmail-auth", {
      body: {
        user_id: employee.id,
        return_url: `${window.location.origin}/administration`,
      },
    });

  if (error) {
    throw new Error(
      await readFunctionError(
        error,
        "Impossible de lancer la connexion Google."
      )
    );
  }

  const authorizationUrl =
    data?.url ||
    data?.authorization_url ||
    data?.authorizationUrl ||
    data?.oauth_url;

  if (!authorizationUrl) {
    throw new Error(
      "La fonction gmail-auth n'a pas renvoyé l'URL Google."
    );
  }

  window.location.assign(authorizationUrl);
}

export async function getGoogleIntegrationAccount(userId) {
  if (!userId) {
    return null;
  }

  // On passe par l'Edge Function car la RLS empêche
  // le front de lire integration_accounts.
  const { data, error } =
    await supabase.functions.invoke(
      "gmail-status",
      {
        body: {
          user_id: userId,
        },
      }
    );

  if (error) {
    throw new Error(
      await readFunctionError(
        error,
        "Impossible de récupérer le statut Google."
      )
    );
  }

  if (data?.success === false) {
    throw new Error(
      data.error ||
        "Impossible de récupérer le statut Google."
    );
  }

  return data?.account ?? null;
}

export async function syncGmail(userId) {
  if (!userId) {
    throw new Error(
      "Impossible d'identifier l'utilisateur connecté."
    );
  }

  const { data, error } =
    await supabase.functions.invoke(
      "gmail-sync",
      {
        body: {
          user_id: userId,
        },
      }
    );

  if (error) {
    throw new Error(
      await readFunctionError(
        error,
        "Impossible de synchroniser Gmail."
      )
    );
  }

  if (data?.success === false) {
    throw new Error(
      data.error ||
        "Impossible de synchroniser Gmail."
    );
  }

  return data;
}