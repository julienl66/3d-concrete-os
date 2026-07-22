import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getGmailThread,
  listGmailThreads,
  markGmailThreadRead,
  refreshGmail,
  replyGmailMessage,
  sendGmailMessage,
  setGmailStar,
  trashGmailThread,
} from "../services/gmail.js";

const folders = [
  ["inbox", "Boîte de réception", "📥"],
  ["sent", "Envoyés", "📤"],
  ["starred", "Favoris", "⭐"],
  ["drafts", "Brouillons", "📝"],
  ["trash", "Corbeille", "🗑️"],
  ["all", "Tous les messages", "✉️"],
];

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function addressLabel(value) {
  if (!value) return "Expéditeur inconnu";
  return value.replace(/<[^>]+>/g, "").replace(/^"|"$/g, "").trim() || value;
}

function ComposeModal({ mode, thread, messages, onClose, onSubmit, busy }) {
  const last = messages?.[messages.length - 1];
  const defaultTo = mode === "reply"
    ? (last?.reply_to_emails?.[0] || last?.sender_email || "")
    : "";
  const [form, setForm] = useState({
    to: defaultTo,
    cc: "",
    subject: mode === "reply"
      ? `Re: ${(thread?.subject || "").replace(/^Re:\s*/i, "")}`
      : "",
    body: "",
  });

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="mail-modal-backdrop" onMouseDown={onClose}>
      <form className="mail-compose" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
        <div className="mail-compose-head">
          <strong>{mode === "reply" ? "Répondre" : "Nouveau message"}</strong>
          <button type="button" className="mail-icon-btn" onClick={onClose}>✕</button>
        </div>
        <input required placeholder="Destinataire" value={form.to} onChange={(e) => update("to", e.target.value)} />
        <input placeholder="Copie (CC)" value={form.cc} onChange={(e) => update("cc", e.target.value)} />
        <input required placeholder="Objet" value={form.subject} onChange={(e) => update("subject", e.target.value)} />
        <textarea required autoFocus placeholder="Votre message…" value={form.body} onChange={(e) => update("body", e.target.value)} />
        <div className="mail-compose-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn secondary" disabled={busy}>{busy ? "Envoi…" : "Envoyer"}</button>
        </div>
      </form>
    </div>
  );
}

export default function Messagerie({ user }) {
  const userId = user?.id;
  const [folder, setFolder] = useState("inbox");
  const [search, setSearch] = useState("");
  const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [composeMode, setComposeMode] = useState(null);
  const [sending, setSending] = useState(false);
  const syncInProgressRef = useRef(false);

  const selectedThread = useMemo(
    () => threads.find((item) => item.id === selectedId) || conversation?.thread || null,
    [threads, selectedId, conversation]
  );

  const loadThreads = useCallback(async (preferredId = null) => {
    if (!userId) return;
    setLoading(true);
    setMessage("");
    try {
      const rows = await listGmailThreads(userId, folder, search);
      setThreads(rows);
      const nextId = preferredId || (rows.some((item) => item.id === selectedId) ? selectedId : rows[0]?.id) || null;
      setSelectedId(nextId);
      if (!nextId) setConversation(null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [userId, folder, search, selectedId]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadThreads(), 250);
    return () => window.clearTimeout(timer);
  }, [folder, search, loadThreads]);

  /*
   * Synchronisation automatique :
   * - immédiatement à l'ouverture de la messagerie ;
   * - ensuite toutes les 60 secondes tant que la page reste ouverte.
   */
  useEffect(() => {
    if (!userId) return undefined;

    const firstSyncTimer = window.setTimeout(() => {
      synchronize({ silent: true });
    }, 300);

    const interval = window.setInterval(() => {
      synchronize({ silent: true });
    }, 60_000);

    return () => {
      window.clearTimeout(firstSyncTimer);
      window.clearInterval(interval);
    };
  }, [userId, synchronize]);

  useEffect(() => {
    if (!selectedId || !userId) return;
    let cancelled = false;
    getGmailThread(userId, selectedId)
      .then(async (data) => {
        if (cancelled) return;
        setConversation(data);
        if (!data.thread.is_read) {
          try {
            await markGmailThreadRead(userId, data.thread.google_thread_id);
            setThreads((items) => items.map((item) => item.id === selectedId ? { ...item, is_read: true } : item));
          } catch {
            // La lecture reste possible même si Gmail refuse le marquage.
          }
        }
      })
      .catch((error) => !cancelled && setMessage(error.message));
    return () => { cancelled = true; };
  }, [selectedId, userId]);

  const synchronize = useCallback(async ({ silent = false } = {}) => {
    if (!userId || syncInProgressRef.current) return;

    syncInProgressRef.current = true;
    setSyncing(true);

    if (!silent) {
      setMessage("");
    }

    try {
      const result = await refreshGmail(userId);

      if (!silent) {
        setMessage(
          `${result?.threads_synced ?? 0} conversation(s) et ` +
          `${result?.messages_synced ?? 0} message(s) synchronisés.`
        );
      }

      await loadThreads(selectedId);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "La synchronisation Gmail a échoué."
      );
    } finally {
      syncInProgressRef.current = false;
      setSyncing(false);
    }
  }, [userId, loadThreads, selectedId]);

  async function submitCompose(form) {
    setSending(true);
    setMessage("");
    try {
      const payload = {
        to: form.to,
        cc: form.cc,
        subject: form.subject,
        body: form.body,
      };
      if (composeMode === "reply") {
        const last = conversation?.messages?.[conversation.messages.length - 1];
        await replyGmailMessage(userId, {
          ...payload,
          google_thread_id: conversation.thread.google_thread_id,
          in_reply_to: last?.headers?.message_id || last?.metadata?.message_id || null,
          references: last?.headers?.references || null,
        });
      } else {
        await sendGmailMessage(userId, payload);
      }
      setComposeMode(null);
      setMessage("Message envoyé.");
      await synchronize();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  async function toggleStar(messageRow) {
    try {
      await setGmailStar(userId, messageRow.google_message_id, !messageRow.is_starred);
      setConversation((current) => ({
        ...current,
        messages: current.messages.map((item) => item.id === messageRow.id ? { ...item, is_starred: !item.is_starred } : item),
      }));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function trashSelected() {
    if (!selectedThread || !window.confirm("Placer cette conversation dans la corbeille ?")) return;
    try {
      await trashGmailThread(userId, selectedThread.google_thread_id);
      setConversation(null);
      setSelectedId(null);
      await loadThreads();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="page mail-page">
      <div className="page-head mail-page-head">
        <div>
          <p className="eyebrow">Communication</p>
          <h2>Messagerie</h2>
          <p>{user?.email ? `Compte de ${user.email}` : "Gmail intégré à l'ERP"}</p>
        </div>
        <div className="actions mail-head-actions">
          <button className="btn primary" onClick={() => setComposeMode("new")}>＋ Nouveau message</button>
          <button className="btn ghost" onClick={() => synchronize()} disabled={syncing}>{syncing ? "Synchronisation…" : "↻ Synchroniser"}</button>
        </div>
      </div>

      {message && <div className="alert info">{message}</div>}

      <div className="mail-shell">
        <aside className="mail-folders">
          <button className="btn primary mail-compose-mobile" onClick={() => setComposeMode("new")}>＋ Écrire</button>
          {folders.map(([id, label, icon]) => (
            <button key={id} className={folder === id ? "active" : ""} onClick={() => { setFolder(id); setSelectedId(null); }}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </aside>

        <div className="mail-list-panel">
          <div className="mail-search"><input placeholder="Rechercher dans les messages…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="mail-list">
            {loading ? <div className="mail-empty">Chargement…</div> : threads.length === 0 ? <div className="mail-empty">Aucun message dans ce dossier.</div> : threads.map((thread) => (
              <button key={thread.id} className={`mail-row ${selectedId === thread.id ? "selected" : ""} ${thread.is_read ? "" : "unread"}`} onClick={() => setSelectedId(thread.id)}>
                <div className="mail-row-top"><strong>{addressLabel(thread.metadata?.from)}</strong><time>{formatDate(thread.last_message_at)}</time></div>
                <div className="mail-row-subject">{thread.subject || "(Sans objet)"}</div>
                <div className="mail-row-snippet">{thread.snippet || ""}</div>
              </button>
            ))}
          </div>
        </div>

        <article className="mail-viewer">
          {!conversation ? <div className="mail-empty mail-empty-large">Sélectionnez une conversation.</div> : (
            <>
              <header className="mail-viewer-head">
                <div><h3>{conversation.thread.subject || "(Sans objet)"}</h3><small>{conversation.messages.length} message(s)</small></div>
                <div className="actions">
                  <button className="btn small" onClick={() => setComposeMode("reply")}>↩ Répondre</button>
                  <button className="btn small danger-text" onClick={trashSelected}>🗑 Supprimer</button>
                </div>
              </header>
              <div className="mail-messages">
                {conversation.messages.map((mail) => (
                  <section className="mail-message" key={mail.id}>
                    <div className="mail-message-head">
                      <div><strong>{mail.direction === "outgoing" ? "Moi" : (mail.sender_name || mail.sender_email || "Expéditeur")}</strong><small>À : {(mail.to_emails || []).join(", ") || "—"}</small></div>
                      <div><button className="mail-icon-btn" title="Favori" onClick={() => toggleStar(mail)}>{mail.is_starred ? "★" : "☆"}</button><time>{new Date(mail.received_at || mail.sent_at || mail.created_at).toLocaleString("fr-FR")}</time></div>
                    </div>
                    {mail.body_html ? <div className="mail-body" dangerouslySetInnerHTML={{ __html: mail.body_html }} /> : <div className="mail-body mail-body-text">{mail.body_text || mail.snippet || ""}</div>}
                    {mail.has_attachments && <div className="mail-attachments">📎 {(mail.attachments || []).map((item) => item.filename || "Pièce jointe").join(", ")}</div>}
                  </section>
                ))}
              </div>
            </>
          )}
        </article>
      </div>

      {composeMode && <ComposeModal mode={composeMode} thread={conversation?.thread} messages={conversation?.messages} onClose={() => setComposeMode(null)} onSubmit={submitCompose} busy={sending} />}
    </section>
  );
}
