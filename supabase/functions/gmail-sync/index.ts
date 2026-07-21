import { createClient } from "npm:@supabase/supabase-js@2";

type RequestBody = {
  user_id?: string;
  reset_initial_sync?: boolean;
};

type IntegrationAccount = {
  id: string;
  user_id: string;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
};

type SyncState = {
  cursor_value: string | null;
  history_id: string | null;
  metadata: Record<string, unknown> | null;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailBody = {
  size?: number;
  data?: string;
  attachmentId?: string;
};

type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailBody;
  parts?: GmailPart[];
};

type GmailMessage = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailPart;
  sizeEstimate?: number;
};

type GmailThread = {
  id?: string;
  historyId?: string;
  messages?: GmailMessage[];
};

type GmailThreadListResponse = {
  threads?: Array<{ id: string; historyId?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type GmailHistoryRecord = {
  id?: string;
  messages?: GmailMessage[];
  messagesAdded?: Array<{ message?: GmailMessage }>;
  messagesDeleted?: Array<{ message?: GmailMessage }>;
  labelsAdded?: Array<{ message?: GmailMessage }>;
  labelsRemoved?: Array<{ message?: GmailMessage }>;
};

type GmailHistoryListResponse = {
  history?: GmailHistoryRecord[];
  nextPageToken?: string;
  historyId?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INITIAL_PAGES_PER_RUN = 1;
const INITIAL_PAGE_SIZE = 10;
const HISTORY_PAGES_PER_RUN = 1;
const HISTORY_PAGE_SIZE = 20;

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

function getHeader(
  headers: GmailHeader[] | undefined,
  name: string,
): string | null {
  const header = headers?.find(
    (item) =>
      item.name?.toLowerCase() === name.toLowerCase(),
  );

  return header?.value?.trim() || null;
}

function decodeBase64Url(value?: string): string {
  if (!value) return "";

  try {
    const normalized = value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");

    const binary = atob(normalized);
    const bytes = Uint8Array.from(
      binary,
      (character) => character.charCodeAt(0),
    );

    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitAddresses(value: string | null): string[] {
  if (!value) return [];

  const matches = value.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  );

  return [...new Set((matches ?? []).map((email) => email.toLowerCase()))];
}

function parseName(value: string | null): string | null {
  if (!value) return null;

  const beforeEmail = value
    .replace(/<[^>]+>/g, "")
    .replace(/^"|"$/g, "")
    .trim();

  return beforeEmail || null;
}

function collectMessageContent(payload?: GmailPart): {
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: Array<Record<string, unknown>>;
} {
  let bodyText = "";
  let bodyHtml = "";
  const attachments: Array<Record<string, unknown>> = [];

  function walk(part?: GmailPart): void {
    if (!part) return;

    const mimeType = part.mimeType ?? "";
    const filename = part.filename?.trim() ?? "";
    const attachmentId = part.body?.attachmentId;

    if (filename || attachmentId) {
      attachments.push({
        filename: filename || null,
        mime_type: mimeType || null,
        attachment_id: attachmentId || null,
        size: part.body?.size ?? null,
        part_id: part.partId ?? null,
      });
    } else if (mimeType === "text/plain" && part.body?.data) {
      bodyText += `${decodeBase64Url(part.body.data)}\n`;
    } else if (mimeType === "text/html" && part.body?.data) {
      bodyHtml += `${decodeBase64Url(part.body.data)}\n`;
    }

    for (const child of part.parts ?? []) {
      walk(child);
    }
  }

  walk(payload);

  const normalizedHtml = bodyHtml.trim() || null;
  const normalizedText =
    bodyText.trim() ||
    (normalizedHtml ? htmlToText(normalizedHtml) : "") ||
    null;

  return {
    bodyText: normalizedText,
    bodyHtml: normalizedHtml,
    attachments,
  };
}

function timestampFromMessage(message: GmailMessage): string | null {
  if (!message.internalDate) return null;

  const timestamp = Number(message.internalDate);

  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : null;
}

function maxHistoryId(
  current: string | null,
  candidate?: string | null,
): string | null {
  if (!candidate) return current;
  if (!current) return candidate;

  try {
    return BigInt(candidate) > BigInt(current)
      ? candidate
      : current;
  } catch {
    return candidate;
  }
}

async function googleFetch<T>(
  url: string,
  accessToken: string,
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data?.error?.message ??
        "Erreur lors de l'appel à l'API Gmail.",
    ) as Error & { status?: number };

    error.status = response.status;
    throw error;
  }

  return data as T;
}

async function refreshGoogleAccessToken(
  account: IntegrationAccount,
  clientId: string,
  clientSecret: string,
): Promise<{
  accessToken: string;
  expiresAt: string | null;
  tokenType: string;
}> {
  if (!account.refresh_token) {
    throw new Error(
      "Aucun refresh token Google n'est enregistré. Reconnecte le compte Google.",
    );
  }

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: account.refresh_token,
        grant_type: "refresh_token",
      }),
    },
  );

  const data =
    (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ??
        data.error ??
        "Impossible de renouveler l'accès Google.",
    );
  }

  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in
      ? new Date(
          Date.now() + data.expires_in * 1000,
        ).toISOString()
      : null,
    tokenType: data.token_type ?? "Bearer",
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const startedAt = new Date().toISOString();
  let accountId: string | null = null;
  let supabaseAdmin: ReturnType<typeof createClient> | null = null;

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
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get(
      "GOOGLE_CLIENT_SECRET",
    );

    if (!supabaseUrl || !supabaseServerKey) {
      throw new Error(
        "La configuration serveur Supabase est incomplète.",
      );
    }

    if (!googleClientId || !googleClientSecret) {
      throw new Error(
        "La configuration OAuth Google est incomplète.",
      );
    }

    supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServerKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: account, error: accountError } =
      await supabaseAdmin
        .from("integration_accounts")
        .select(`
          id,
          user_id,
          email,
          access_token,
          refresh_token,
          token_expires_at
        `)
        .eq("user_id", userId)
        .eq("provider", "google")
        .eq("status", "active")
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (accountError) {
      throw new Error(
        `Lecture du compte Google impossible : ${accountError.message}`,
      );
    }

    if (!account) {
      return jsonResponse(
        {
          success: false,
          error:
            "Aucun compte Google actif n'est connecté pour cet utilisateur.",
        },
        404,
      );
    }

    accountId = account.id;

    let accessToken = account.access_token;
    const expiry = account.token_expires_at
      ? new Date(account.token_expires_at).getTime()
      : 0;

    if (
      !accessToken ||
      !expiry ||
      expiry < Date.now() + 60_000
    ) {
      const refreshed = await refreshGoogleAccessToken(
        account as IntegrationAccount,
        googleClientId,
        googleClientSecret,
      );

      accessToken = refreshed.accessToken;

      const { error: updateTokenError } =
        await supabaseAdmin
          .from("integration_accounts")
          .update({
            access_token: refreshed.accessToken,
            token_type: refreshed.tokenType,
            token_expires_at: refreshed.expiresAt,
            status: "active",
            last_used_at: startedAt,
          })
          .eq("id", account.id);

      if (updateTokenError) {
        throw new Error(
          `Mise à jour du jeton Google impossible : ${updateTokenError.message}`,
        );
      }
    }

    if (!accessToken) {
      throw new Error(
        "Aucun jeton d'accès Google disponible.",
      );
    }

    const { data: existingState, error: stateReadError } =
      await supabaseAdmin
        .from("integration_sync_state")
        .select("cursor_value, history_id, metadata")
        .eq("integration_account_id", account.id)
        .eq("resource_type", "gmail")
        .maybeSingle();

    if (stateReadError) {
      throw new Error(
        `Lecture de l'état de synchronisation impossible : ${stateReadError.message}`,
      );
    }

    let syncState: SyncState = {
      cursor_value: existingState?.cursor_value ?? null,
      history_id: existingState?.history_id ?? null,
      metadata: existingState?.metadata ?? null,
    };

    if (body.reset_initial_sync === true) {
      syncState = {
        cursor_value: null,
        history_id: null,
        metadata: {
          initial_sync_pending: true,
        },
      };
    }

    const initialSyncPending =
      body.reset_initial_sync === true ||
      !syncState.history_id ||
      syncState.metadata?.initial_sync_pending === true;

    const { error: startStateError } =
      await supabaseAdmin
        .from("integration_sync_state")
        .upsert(
          {
            integration_account_id: account.id,
            resource_type: "gmail",
            last_sync_started_at: startedAt,
            last_error: null,
            metadata: {
              ...(syncState.metadata ?? {}),
              initial_sync_pending: initialSyncPending,
              sync_status: "running",
              sync_started_at: startedAt,
            },
          },
          {
            onConflict:
              "integration_account_id,resource_type",
          },
        );

    if (startStateError) {
      throw new Error(
        `Initialisation de la synchronisation impossible : ${startStateError.message}`,
      );
    }

    const threadIds = new Set<string>();
    let nextCursor: string | null = null;
    let latestHistoryId = syncState.history_id;
    let mode: "initial" | "incremental" = initialSyncPending
      ? "initial"
      : "incremental";

    if (mode === "initial") {
      let pageToken = syncState.cursor_value;

      for (
        let pageIndex = 0;
        pageIndex < INITIAL_PAGES_PER_RUN;
        pageIndex += 1
      ) {
        const params = new URLSearchParams({
          maxResults: String(INITIAL_PAGE_SIZE),
        });

        if (pageToken) {
          params.set("pageToken", pageToken);
        }

        const list = await googleFetch<GmailThreadListResponse>(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads?${params.toString()}`,
          accessToken,
        );

        for (const thread of list.threads ?? []) {
          if (thread.id) threadIds.add(thread.id);
          latestHistoryId = maxHistoryId(
            latestHistoryId,
            thread.historyId,
          );
        }

        pageToken = list.nextPageToken ?? null;
        nextCursor = pageToken;

        if (!pageToken) break;
      }
    } else {
      let pageToken: string | null = null;

      try {
        for (
          let pageIndex = 0;
          pageIndex < HISTORY_PAGES_PER_RUN;
          pageIndex += 1
        ) {
          const params = new URLSearchParams({
            startHistoryId: syncState.history_id as string,
            maxResults: String(HISTORY_PAGE_SIZE),
          });

          if (pageToken) {
            params.set("pageToken", pageToken);
          }

          const history =
            await googleFetch<GmailHistoryListResponse>(
              `https://gmail.googleapis.com/gmail/v1/users/me/history?${params.toString()}`,
              accessToken,
            );

          for (const record of history.history ?? []) {
            latestHistoryId = maxHistoryId(
              latestHistoryId,
              record.id,
            );

            const possibleMessages = [
              ...(record.messages ?? []),
              ...(record.messagesAdded ?? []).map(
                (entry) => entry.message,
              ),
              ...(record.messagesDeleted ?? []).map(
                (entry) => entry.message,
              ),
              ...(record.labelsAdded ?? []).map(
                (entry) => entry.message,
              ),
              ...(record.labelsRemoved ?? []).map(
                (entry) => entry.message,
              ),
            ];

            for (const message of possibleMessages) {
              if (message?.threadId) {
                threadIds.add(message.threadId);
              }
            }
          }

          latestHistoryId = maxHistoryId(
            latestHistoryId,
            history.historyId,
          );

          pageToken = history.nextPageToken ?? null;

          if (!pageToken) break;
        }
      } catch (error) {
        const status =
          error instanceof Error &&
          "status" in error
            ? Number(
                (error as Error & { status?: number }).status,
              )
            : null;

        if (status !== 404) {
          throw error;
        }

        mode = "initial";
        syncState.cursor_value = null;
        syncState.history_id = null;

        const list =
          await googleFetch<GmailThreadListResponse>(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=${INITIAL_PAGE_SIZE}`,
            accessToken,
          );

        for (const thread of list.threads ?? []) {
          if (thread.id) threadIds.add(thread.id);
          latestHistoryId = maxHistoryId(
            latestHistoryId,
            thread.historyId,
          );
        }

        nextCursor = list.nextPageToken ?? null;
      }
    }

    let threadsSynced = 0;
    let messagesSynced = 0;

    for (const googleThreadId of threadIds) {
      const thread = await googleFetch<GmailThread>(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(
          googleThreadId,
        )}?format=full`,
        accessToken,
      );

      const messages = thread.messages ?? [];

      if (!thread.id || messages.length === 0) {
        continue;
      }

      latestHistoryId = maxHistoryId(
        latestHistoryId,
        thread.historyId,
      );

      const firstMessage = messages[0];
      const lastMessage = messages[messages.length - 1];
      const firstHeaders = firstMessage.payload?.headers;
      const lastHeaders = lastMessage.payload?.headers;

      const subject =
        getHeader(lastHeaders, "Subject") ??
        getHeader(firstHeaders, "Subject") ??
        "(Sans objet)";

      const labels = [
        ...new Set(
          messages.flatMap(
            (message) => message.labelIds ?? [],
          ),
        ),
      ];

      const lastMessageAt =
        timestampFromMessage(lastMessage);

      const { data: storedThread, error: threadError } =
        await supabaseAdmin
          .from("gmail_threads")
          .upsert(
            {
              user_id: userId,
              integration_account_id: account.id,
              google_thread_id: thread.id,
              subject,
              snippet:
                lastMessage.snippet ??
                firstMessage.snippet ??
                null,
              last_message_at: lastMessageAt,
              message_count: messages.length,
              is_read: !labels.includes("UNREAD"),
              labels,
              metadata: {
                gmail_history_id:
                  thread.historyId ?? null,
                first_message_id:
                  firstMessage.id ?? null,
                last_message_id:
                  lastMessage.id ?? null,
                from: getHeader(lastHeaders, "From"),
                to: getHeader(lastHeaders, "To"),
                cc: getHeader(lastHeaders, "Cc"),
              },
            },
            {
              onConflict:
                "integration_account_id,google_thread_id",
            },
          )
          .select("id")
          .single();

      if (threadError || !storedThread) {
        throw new Error(
          `Enregistrement de la conversation ${thread.id} impossible : ${
            threadError?.message ?? "identifiant local absent"
          }`,
        );
      }

      const messageRows: Array<Record<string, unknown>> = [];

      for (const message of messages) {
        if (!message.id || !message.threadId) continue;

        latestHistoryId = maxHistoryId(
          latestHistoryId,
          message.historyId,
        );

        const headers = message.payload?.headers ?? [];
        const fromHeader = getHeader(headers, "From");
        const toHeader = getHeader(headers, "To");
        const ccHeader = getHeader(headers, "Cc");
        const bccHeader = getHeader(headers, "Bcc");
        const replyToHeader = getHeader(
          headers,
          "Reply-To",
        );

        const senderEmails = splitAddresses(fromHeader);
        const senderEmail = senderEmails[0] ?? null;
        const accountEmail =
          account.email?.toLowerCase() ?? null;

        const direction =
          accountEmail &&
          senderEmail?.toLowerCase() === accountEmail
            ? "outgoing"
            : "incoming";

        const sentOrReceivedAt =
          timestampFromMessage(message);
        const messageContent = collectMessageContent(
          message.payload,
        );

        messageRows.push({
          user_id: userId,
          integration_account_id: account.id,
          thread_id: storedThread.id,
          google_message_id: message.id,
          google_thread_id: message.threadId,
          direction,
          sender_name: parseName(fromHeader),
          sender_email: senderEmail,
          to_emails: splitAddresses(toHeader),
          cc_emails: splitAddresses(ccHeader),
          bcc_emails: splitAddresses(bccHeader),
          reply_to_emails:
            splitAddresses(replyToHeader),
          subject:
            getHeader(headers, "Subject") ??
            subject,
          snippet: message.snippet ?? null,
          body_text: messageContent.bodyText,
          body_html: messageContent.bodyHtml,
          sent_at:
            direction === "outgoing"
              ? sentOrReceivedAt
              : null,
          received_at:
            direction === "incoming"
              ? sentOrReceivedAt
              : null,
          is_read: !(
            message.labelIds ?? []
          ).includes("UNREAD"),
          is_starred: (
            message.labelIds ?? []
          ).includes("STARRED"),
          labels: message.labelIds ?? [],
          has_attachments:
            messageContent.attachments.length > 0,
          attachments: messageContent.attachments,
          headers: Object.fromEntries(
            headers
              .filter(
                (header) =>
                  header.name &&
                  header.value,
              )
              .map((header) => [
                header.name as string,
                header.value as string,
              ]),
          ),
          metadata: {
            gmail_history_id:
              message.historyId ?? null,
            size_estimate:
              message.sizeEstimate ?? null,
          },
        });
      }

      if (messageRows.length > 0) {
        const { error: messageError } =
          await supabaseAdmin
            .from("gmail_messages")
            .upsert(
              messageRows,
              {
                onConflict:
                  "integration_account_id,google_message_id",
              },
            );

        if (messageError) {
          throw new Error(
            `Enregistrement des messages de la conversation ${thread.id} impossible : ${messageError.message}`,
          );
        }

        messagesSynced += messageRows.length;
      }

      threadsSynced += 1;
    }

    const completedAt = new Date().toISOString();
    const initialStillPending =
      mode === "initial" && Boolean(nextCursor);

    const { error: finishStateError } =
      await supabaseAdmin
        .from("integration_sync_state")
        .upsert(
          {
            integration_account_id: account.id,
            resource_type: "gmail",
            cursor_value: initialStillPending
              ? nextCursor
              : null,
            history_id: latestHistoryId,
            last_sync_completed_at: completedAt,
            last_success_at: completedAt,
            last_error: null,
            consecutive_errors: 0,
            metadata: {
              initial_sync_pending:
                initialStillPending,
              sync_status: "success",
              sync_mode: mode,
              sync_finished_at: completedAt,
              threads_synced: threadsSynced,
              messages_synced: messagesSynced,
              more_initial_data_available:
                initialStillPending,
            },
          },
          {
            onConflict:
              "integration_account_id,resource_type",
          },
        );

    if (finishStateError) {
      throw new Error(
        `Mise à jour finale de la synchronisation impossible : ${finishStateError.message}`,
      );
    }

    await supabaseAdmin
      .from("integration_accounts")
      .update({
        status: "active",
        last_used_at: completedAt,
      })
      .eq("id", account.id);

    return jsonResponse({
      success: true,
      mode,
      account_email: account.email,
      threads_synced: threadsSynced,
      messages_synced: messagesSynced,
      initial_sync_pending: initialStillPending,
      message: initialStillPending
        ? `${threadsSynced} conversation(s) et ${messagesSynced} message(s) synchronisés. Une nouvelle synchronisation continuera l'import initial.`
        : `${threadsSynced} conversation(s) et ${messagesSynced} message(s) synchronisés.`,
    });
  } catch (error) {
    console.error("gmail-sync error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Erreur inconnue";

    if (supabaseAdmin && accountId) {
      const failedAt = new Date().toISOString();

      const { data: currentState } =
        await supabaseAdmin
          .from("integration_sync_state")
          .select("consecutive_errors, metadata")
          .eq("integration_account_id", accountId)
          .eq("resource_type", "gmail")
          .maybeSingle();

      await supabaseAdmin
        .from("integration_sync_state")
        .upsert(
          {
            integration_account_id: accountId,
            resource_type: "gmail",
            last_sync_completed_at: failedAt,
            last_error: message,
            consecutive_errors:
              (currentState?.consecutive_errors ?? 0) + 1,
            metadata: {
              ...(currentState?.metadata ?? {}),
              sync_status: "error",
              sync_failed_at: failedAt,
            },
          },
          {
            onConflict:
              "integration_account_id,resource_type",
          },
        );
    }

    return jsonResponse(
      {
        success: false,
        error: message,
      },
      500,
    );
  }
});