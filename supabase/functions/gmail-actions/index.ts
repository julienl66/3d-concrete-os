import { createClient } from "npm:@supabase/supabase-js@2";

type Body = {
  user_id?: string;
  action?: "send" | "reply" | "star" | "trash" | "mark_read";
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  google_message_id?: string;
  google_thread_id?: string;
  starred?: boolean;
  in_reply_to?: string | null;
  references?: string | null;
};

type Account = {
  id: string;
  user_id: string;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sanitizeHeader(value = "") {
  return value.replace(/[\r\n]+/g, " ").trim();
}

async function refreshToken(account: Account, clientId: string, clientSecret: string) {
  if (!account.refresh_token) throw new Error("Aucun refresh token Google. Reconnecte le compte.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Renouvellement Google impossible.");
  return {
    accessToken: data.access_token as string,
    expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : null,
    tokenType: data.token_type || "Bearer",
  };
}

async function gmailFetch(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data?.error?.message || "Erreur Gmail.");
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as Body;
    const userId = body.user_id?.trim();
    if (!userId || !body.action) return json({ success: false, error: "Utilisateur ou action manquant." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) throw new Error("Configuration serveur incomplète.");

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: account, error } = await db
      .from("integration_accounts")
      .select("id,user_id,email,access_token,refresh_token,token_expires_at")
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("status", "active")
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!account) return json({ success: false, error: "Aucun compte Google actif." }, 404);

    let token = account.access_token;
    const expires = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
    if (!token || expires < Date.now() + 60_000) {
      const refreshed = await refreshToken(account as Account, clientId, clientSecret);
      token = refreshed.accessToken;
      await db.from("integration_accounts").update({ access_token: token, token_expires_at: refreshed.expiresAt, token_type: refreshed.tokenType, last_used_at: new Date().toISOString() }).eq("id", account.id);
    }
    if (!token) throw new Error("Jeton Google indisponible.");

    if (body.action === "send" || body.action === "reply") {
      if (!body.to?.trim() || !body.subject?.trim() || !body.body?.trim()) return json({ success: false, error: "Destinataire, objet et message obligatoires." }, 400);
      const headers = [
        `From: ${sanitizeHeader(account.email || "")}`,
        `To: ${sanitizeHeader(body.to)}`,
        body.cc?.trim() ? `Cc: ${sanitizeHeader(body.cc)}` : "",
        body.bcc?.trim() ? `Bcc: ${sanitizeHeader(body.bcc)}` : "",
        `Subject: ${sanitizeHeader(body.subject)}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
        body.in_reply_to ? `In-Reply-To: ${sanitizeHeader(body.in_reply_to)}` : "",
        body.references ? `References: ${sanitizeHeader(body.references)}` : "",
        "",
        body.body,
      ].filter(Boolean);
      const payload: Record<string, unknown> = { raw: encodeBase64Url(headers.join("\r\n")) };
      if (body.action === "reply" && body.google_thread_id) payload.threadId = body.google_thread_id;
      const result = await gmailFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", token, { method: "POST", body: JSON.stringify(payload) });
      return json({ success: true, message_id: result.id, thread_id: result.threadId });
    }

    if (body.action === "star") {
      if (!body.google_message_id) return json({ success: false, error: "Message Gmail manquant." }, 400);
      await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(body.google_message_id)}/modify`, token, {
        method: "POST",
        body: JSON.stringify(body.starred ? { addLabelIds: ["STARRED"], removeLabelIds: [] } : { addLabelIds: [], removeLabelIds: ["STARRED"] }),
      });
      await db.from("gmail_messages").update({ is_starred: !!body.starred }).eq("integration_account_id", account.id).eq("google_message_id", body.google_message_id);
      return json({ success: true });
    }

    if (!body.google_thread_id) return json({ success: false, error: "Conversation Gmail manquante." }, 400);

    if (body.action === "trash") {
      await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(body.google_thread_id)}/trash`, token, { method: "POST" });
      const { data: row } = await db.from("gmail_threads").select("labels").eq("integration_account_id", account.id).eq("google_thread_id", body.google_thread_id).maybeSingle();
      const labels = [...new Set([...(row?.labels || []).filter((label: string) => label !== "INBOX"), "TRASH"])];
      await db.from("gmail_threads").update({ labels }).eq("integration_account_id", account.id).eq("google_thread_id", body.google_thread_id);
      return json({ success: true });
    }

    if (body.action === "mark_read") {
      await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(body.google_thread_id)}/modify`, token, { method: "POST", body: JSON.stringify({ removeLabelIds: ["UNREAD"], addLabelIds: [] }) });
      await db.from("gmail_threads").update({ is_read: true }).eq("integration_account_id", account.id).eq("google_thread_id", body.google_thread_id);
      await db.from("gmail_messages").update({ is_read: true }).eq("integration_account_id", account.id).eq("google_thread_id", body.google_thread_id);
      return json({ success: true });
    }

    return json({ success: false, error: "Action non prise en charge." }, 400);
  } catch (error) {
    console.error(error);
    return json({ success: false, error: error instanceof Error ? error.message : "Erreur inconnue." }, 500);
  }
});
