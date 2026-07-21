import { supabase } from "./supabase.js";
import { syncGmail } from "./integrations.js";

async function readFunctionError(error, fallbackMessage) {
  let message = error?.message || fallbackMessage;
  try {
    const body = await error?.context?.json();
    message = body?.error || body?.message || body?.details || message;
  } catch {
    // La réponse n'est pas forcément du JSON.
  }
  return message;
}

export async function listGmailThreads(userId, folder = "inbox", search = "") {
  let query = supabase
    .from("gmail_threads")
    .select("*")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (folder === "inbox") query = query.contains("labels", ["INBOX"]);
  if (folder === "sent") query = query.contains("labels", ["SENT"]);
  if (folder === "starred") query = query.contains("labels", ["STARRED"]);
  if (folder === "trash") query = query.contains("labels", ["TRASH"]);
  if (folder === "drafts") query = query.contains("labels", ["DRAFT"]);

  if (search.trim()) {
    const safe = search.trim().replace(/[,%()]/g, " ");
    query = query.or(`subject.ilike.%${safe}%,snippet.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getGmailThread(userId, threadId) {
  const [{ data: thread, error: threadError }, { data: messages, error: messagesError }] =
    await Promise.all([
      supabase
        .from("gmail_threads")
        .select("*")
        .eq("id", threadId)
        .eq("user_id", userId)
        .single(),
      supabase
        .from("gmail_messages")
        .select("*")
        .eq("thread_id", threadId)
        .eq("user_id", userId)
        .order("received_at", { ascending: true, nullsFirst: false })
        .order("sent_at", { ascending: true, nullsFirst: false }),
    ]);

  if (threadError) throw new Error(threadError.message);
  if (messagesError) throw new Error(messagesError.message);
  return { thread, messages: messages || [] };
}


export async function listGmailMessagesForContact(userId, email, limit = 500) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!userId || !normalizedEmail) return [];

  const { data, error } = await supabase
    .from("gmail_messages")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data || [])
    .filter((message) => {
      const sender = String(message.sender_email || "").trim().toLowerCase();
      const recipients = [
        ...(Array.isArray(message.to_emails) ? message.to_emails : []),
        ...(Array.isArray(message.cc_emails) ? message.cc_emails : []),
        ...(Array.isArray(message.bcc_emails) ? message.bcc_emails : []),
      ].map((value) => String(value || "").trim().toLowerCase());

      return sender === normalizedEmail || recipients.includes(normalizedEmail);
    })
    .sort((a, b) => {
      const aDate = new Date(a.received_at || a.sent_at || a.created_at || 0).getTime();
      const bDate = new Date(b.received_at || b.sent_at || b.created_at || 0).getTime();
      return bDate - aDate;
    });
}

export async function runGmailAction(userId, action, payload = {}) {
  const { data, error } = await supabase.functions.invoke("gmail-actions", {
    body: { user_id: userId, action, ...payload },
  });

  if (error) {
    throw new Error(await readFunctionError(error, "L'action Gmail a échoué."));
  }
  if (data?.success === false) throw new Error(data.error || "L'action Gmail a échoué.");
  return data;
}

export const sendGmailMessage = (userId, payload) =>
  runGmailAction(userId, "send", payload);
export const replyGmailMessage = (userId, payload) =>
  runGmailAction(userId, "reply", payload);
export const setGmailStar = (userId, googleMessageId, starred) =>
  runGmailAction(userId, "star", { google_message_id: googleMessageId, starred });
export const trashGmailThread = (userId, googleThreadId) =>
  runGmailAction(userId, "trash", { google_thread_id: googleThreadId });
export const markGmailThreadRead = (userId, googleThreadId) =>
  runGmailAction(userId, "mark_read", { google_thread_id: googleThreadId });
export const refreshGmail = (userId) => syncGmail(userId);
