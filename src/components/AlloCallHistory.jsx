import { useEffect, useState } from "react";
import {
  loadAlloCallsForContact,
  openAlloCall,
} from "../services/allo.js";

function formatDuration(seconds) {
  const totalSeconds = Number(seconds || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes} min ${remainingSeconds} s`;
}

function callDirectionLabel(direction) {
  return direction === "INBOUND"
    ? "Appel entrant"
    : "Appel sortant";
}

export default function AlloCallHistory({ contact }) {
  const [calls, setCalls] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (contact?.id) {
      loadCalls();
    } else {
      setCalls([]);
    }
  }, [contact?.id]);

  async function loadCalls() {
    if (!contact?.id) return;

    try {
      setLoading(true);
      setMessage("");

      const data = await loadAlloCallsForContact(contact.id);
      setCalls(data);
    } catch (error) {
      setMessage(
        error?.message ||
          "Impossible de charger l'historique Allo.",
      );
    } finally {
      setLoading(false);
    }
  }

  function callContact() {
    try {
      openAlloCall(contact?.phone);
    } catch (error) {
      setMessage(error?.message || "Impossible de lancer l'appel.");
    }
  }

  return (
    <section className="allo-panel">
      <div className="allo-panel-head">
        <div>
          <p className="eyebrow">Téléphonie</p>
          <h3>Allo</h3>
          <p>
            Appels, durée, résumé, enregistrement et transcription.
          </p>
        </div>

        <div className="inline-actions">
          <button
            type="button"
            className="btn primary"
            onClick={callContact}
            disabled={!contact?.phone}
          >
            ☎ Appeler
          </button>

          <button
            type="button"
            className="btn small"
            onClick={loadCalls}
          >
            Actualiser
          </button>
        </div>
      </div>

      {message && (
        <div className="alert info">
          {message}
        </div>
      )}

      {loading ? (
        <p>Chargement des appels...</p>
      ) : calls.length === 0 ? (
        <div className="allo-empty">
          <strong>Aucun appel Allo associé à ce contact.</strong>
          <small>
            Les prochains appels seront automatiquement rattachés
            grâce au numéro de téléphone.
          </small>
        </div>
      ) : (
        <div className="allo-call-list">
          {calls.map((call) => (
            <article className="allo-call-card" key={call.id}>
              <div className="allo-call-card-head">
                <div>
                  <strong>
                    {call.direction === "INBOUND" ? "📥" : "📤"}{" "}
                    {callDirectionLabel(call.direction)}
                  </strong>

                  <small>
                    {call.started_at
                      ? new Date(call.started_at).toLocaleString("fr-FR")
                      : "-"}
                    {" · "}
                    {formatDuration(call.duration_seconds)}
                    {" · "}
                    {call.result || "-"}
                  </small>
                </div>

                {call.recording_url && (
                  <a
                    className="btn small"
                    href={call.recording_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ▶ Écouter
                  </a>
                )}
              </div>

              {call.summary && (
                <div className="allo-call-summary">
                  <strong>Résumé</strong>
                  <p>{call.summary}</p>
                </div>
              )}

              {call.transcript && (
                <details className="allo-transcript">
                  <summary>Voir la transcription</summary>
                  <pre>{call.transcript}</pre>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}