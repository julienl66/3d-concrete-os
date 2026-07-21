import { createClient } from "npm:@supabase/supabase-js@2";

type RequestBody = {
  user_id?: string;
};

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
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  try {
    const body = (await req.json()) as RequestBody;
    const userId = body.user_id?.trim();

    if (!userId) {
      return jsonResponse(
        {
          success: false,
          error:
            "L'identifiant de l'utilisateur ERP est manquant.",
        },
        400,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServerKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SECRET_KEY");

    if (!supabaseUrl || !supabaseServerKey) {
      throw new Error(
        "La configuration serveur Supabase est incomplète.",
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
      data: employee,
      error: employeeError,
    } = await supabaseAdmin
      .from("employees")
      .select("id, active")
      .eq("id", userId)
      .maybeSingle();

    if (employeeError) {
      throw new Error(
        `Vérification de l'utilisateur ERP impossible : ${employeeError.message}`,
      );
    }

    if (!employee) {
      return jsonResponse(
        {
          success: false,
          error:
            "L'utilisateur ERP demandé n'existe pas.",
        },
        404,
      );
    }

    if (employee.active === false) {
      return jsonResponse(
        {
          success: false,
          error:
            "Le compte utilisateur ERP est désactivé.",
        },
        403,
      );
    }

    const {
      data: account,
      error: accountError,
    } = await supabaseAdmin
      .from("integration_accounts")
      .select(`
        id,
        provider,
        email,
        display_name,
        status,
        connected_at,
        last_used_at,
        token_expires_at,
        scopes,
        metadata
      `)
      .eq("user_id", userId)
      .eq("provider", "google")
      .order("connected_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (accountError) {
      throw new Error(
        `Lecture de l'intégration Google impossible : ${accountError.message}`,
      );
    }

    return jsonResponse({
      success: true,
      account: account ?? null,
    });
  } catch (error) {
    console.error("gmail-status error:", error);

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue.",
      },
      500,
    );
  }
});