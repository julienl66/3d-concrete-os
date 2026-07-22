import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listGmailMessagesForContact,
  refreshGmail,
  sendGmailMessage,
} from "../services/gmail.js";
import { supabase } from "../services/supabase.js";
import { emitEvent } from "../services/events.js";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EmailComposer({ contact, onClose, onSent, user }) {
  const [form, setForm] = useState({
    to: contact?.email || "",
    cc: "",
    subject: "",
    body: "",
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!user?.id) {
      setError("Utilisateur non identifié.");
      return;
    }

    setSending(true);
    setError("");

    try {
      await sendGmailMessage(user.id, form);

      const { data: createdInteraction, error: interactionError } = await supabase
        .from("crm_interactions")
        .insert({
          contact_id: contact.id,
          interaction_type: "email",
          subject: form.subject || "Email envoyé",
          notes: form.body || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (interactionError) throw interactionError;

      await emitEvent({
        event_type: "CRM_EMAIL_SENT",
        entity_type: "crm",
        entity_id: contact.id,
        title: `Email envoyé à ${contact.company_name || contact.contact_name || contact.email}`,
        description: form.subject || null,
        payload: {
          contact_id: contact.id,
          interaction_id: createdInteraction?.id || null,
          recipient: form.to,
          subject: form.subject || null,
        },
        user,
      });

      await onSent?.();
      onClose();
    } catch (sendError) {
      setError(sendError?.message || "Impossible d'envoyer l'email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mail-modal-backdrop" onMouseDown={onClose}>
      <form
        className="mail-compose crm-mail-compose"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="mail-compose-head">
          <div>
            <strong>Nouvel email</strong>
            <small>{contact?.company_name || contact?.contact_name || contact?.email}</small>
          </div>
          <button type="button" className="mail-icon-btn" onClick={onClose}>✕</button>
        </div>

        {error && <div className="alert info">{error}</div>}

        <input required type="email" placeholder="Destinataire" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} />
        <input placeholder="Copie (CC)" value={form.cc} onChange={(event) => setForm({ ...form, cc: event.target.value })} />
        <input required placeholder="Objet" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
        <textarea required autoFocus placeholder="Votre message…" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />

        <div className="mail-compose-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={sending}>{sending ? "Envoi…" : "Envoyer depuis Gmail"}</button>
        </div>
      </form>
    </div>
  );
}

export default function CrmEmailPanel({ contact, user, onActivityCreated }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const loadMessages = useCallback(async () => {
    if (!user?.id || !contact?.email) {
      setMessages([]);
      return;
    }

    setLoading(true);
    setStatus("");
    try {
      const rows = await listGmailMessagesForContact(user.id, contact.email);
      setMessages(rows);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id, contact?.email]);

  useEffect(() => {
    setComposerOpen(false);
    setExpandedId(null);
    loadMessages();
  }, [loadMessages]);

  const latestMessage = useMemo(() => messages[0] || null, [messages]);
  const incomingCount = useMemo(() => messages.filter((message) => message.direction !== "outgoing").length, [messages]);
  const outgoingCount = messages.length - incomingCount;

  async function synchronize() {
    if (!user?.id) return;
    setSyncing(true);
    setStatus("");
    try {
      await refreshGmail(user.id);
      await loadMessages();
      setStatus("Emails synchronisés.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSent() {
    setStatus("Email envoyé et ajouté à l'historique CRM.");
    await loadMessages();
    onActivityCreated?.();
  }

  if (!contact?.email) {
    return <div className="crm-email-panel crm-email-panel-empty"><p>Ajoute une adresse email à ce contact pour envoyer et retrouver ses échanges.</p></div>;
  }

  return (
    <div className="crm-email-panel">
      <div className="crm-email-panel-head">
        <div>
          <p className="eyebrow">Conversation Gmail</p>
          <h4>Échanges avec {contact.contact_name || contact.company_name}</h4>
          <p>{messages.length} message(s) · {incomingCount} reçu(s) · {outgoingCount} envoyé(s){latestMessage ? ` · dernier échange ${formatDate(latestMessage.received_at || latestMessage.sent_at || latestMessage.created_at)}` : ""}</p>
        </div>
        <div className="actions">
          <button className="btn small" type="button" onClick={synchronize} disabled={syncing}>{syncing ? "Synchronisation…" : "↻ Synchroniser"}</button>
          <button className="btn primary" type="button" onClick={() => setComposerOpen(true)}>＋ Nouvel email</button>
        </div>
      </div>

      {status && <div className="alert info">{status}</div>}

      <div className="crm-email-legend" aria-label="Légende des messages">
        <span><i className="incoming" /> Reçu du client</span>
        <span><i className="outgoing" /> Envoyé par 3D Concrete</span>
      </div>

      <div className="crm-email-conversation">
        {loading ? (
          <div className="crm-email-state">Chargement des emails…</div>
        ) : messages.length === 0 ? (
          <div className="crm-email-state">Aucun échange Gmail trouvé avec {contact.email}.</div>
        ) : (
          [...messages].reverse().map((message) => {
            const outgoing = message.direction === "outgoing";
            const body = message.body_text || message.snippet || "";
            const expanded = expandedId === message.id;
            return (
              <article className={`crm-email-bubble ${outgoing ? "outgoing" : "incoming"}`} key={message.id}>
                <div className="crm-email-bubble-meta">
                  <span className={`crm-email-direction ${outgoing ? "outgoing" : "incoming"}`}>{outgoing ? "ENVOYÉ" : "REÇU"}</span>
                  <time>{formatDate(message.received_at || message.sent_at || message.created_at)}</time>
                </div>
                <strong className="crm-email-subject">{message.subject || "(Sans objet)"}</strong>
                <small>{outgoing ? `À : ${(message.to_emails || []).join(", ") || contact.email}` : `De : ${message.sender_name || message.sender_email || contact.email}`}</small>
                <div className={`crm-email-body ${expanded ? "expanded" : ""}`}>{body}</div>
                {body.length > 240 && (
                  <button type="button" className="crm-email-expand" onClick={() => setExpandedId(expanded ? null : message.id)}>{expanded ? "Réduire" : "Lire le message complet"}</button>
                )}
              </article>
            );
          })
        )}
      </div>

      {composerOpen && <EmailComposer contact={contact} user={user} onClose={() => setComposerOpen(false)} onSent={handleSent} />}
    </div>
  );
}
