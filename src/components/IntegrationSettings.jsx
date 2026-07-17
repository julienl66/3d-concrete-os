import { useEffect, useState } from "react";
import {
  connectGoogle,
  getGoogleIntegrationAccount,
} from "../services/integrations.js";

export default function IntegrationSettings({ user, setMessage }) {
  const [googleAccount, setGoogleAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadGoogleAccount();
  }, [user?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const integration = params.get("integration");
    const status = params.get("status");
    const email = params.get("email");
    const reason = params.get("reason");

    if (integration !== "google" || !status) {
      return;
    }

    if (status === "success") {
      setMessage(
        email
          ? `Compte Google ${email} connecté avec succès.`
          : "Compte Google connecté avec succès."
      );

      loadGoogleAccount();
    } else {
      setMessage(
        reason
          ? `Connexion Google impossible : ${reason}`
          : "La connexion Google a échoué."
      );
    }

    params.delete("integration");
    params.delete("status");
    params.delete("email");
    params.delete("reason");

    const remainingQuery = params.toString();

    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${
        remainingQuery ? `?${remainingQuery}` : ""
      }${window.location.hash}`
    );
  }, []);

  async function loadGoogleAccount() {
    try {
      setLoading(true);

      const account = await getGoogleIntegrationAccount(user?.id);

      setGoogleAccount(account);
    } catch (error) {
      console.error("Chargement intégration Google :", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Impossible de charger les intégrations."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectGoogle() {
    try {
      setConnecting(true);
      setMessage("Redirection vers Google…");

      await connectGoogle();
    } catch (error) {
      console.error("Connexion Google :", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Impossible de connecter Google."
      );

      setConnecting(false);
    }
  }

  const isGoogleConnected =
    googleAccount?.status === "active";

  return (
    <div className="card integration-settings-card">
      <div className="integration-settings-head">
        <div>
          <h3>Intégrations</h3>
          <p>
            Connecte les services externes utilisés par ton compte ERP.
          </p>
        </div>

        <button
          type="button"
          className="btn small"
          onClick={loadGoogleAccount}
          disabled={loading}
        >
          {loading ? "Actualisation…" : "Actualiser"}
        </button>
      </div>

      <div className="integration-list">
        <div className="integration-row">
          <div className="integration-provider-icon">G</div>

          <div className="integration-provider-content">
            <div className="integration-provider-title">
              <strong>Google</strong>

              <span
                className={
                  isGoogleConnected
                    ? "integration-status connected"
                    : "integration-status disconnected"
                }
              >
                {isGoogleConnected
                  ? "Connecté"
                  : "Non connecté"}
              </span>
            </div>

            <small>
              Gmail et Google Calendar
            </small>

            {googleAccount?.email && (
              <p className="integration-account-email">
                {googleAccount.email}
              </p>
            )}

            {googleAccount?.connected_at && (
              <small>
                Connexion enregistrée le{" "}
                {new Date(
                  googleAccount.connected_at
                ).toLocaleString("fr-FR")}
              </small>
            )}
          </div>

          <div className="integration-provider-actions">
            <button
              type="button"
              className="btn primary"
              onClick={handleConnectGoogle}
              disabled={connecting}
            >
              {connecting
                ? "Connexion…"
                : isGoogleConnected
                ? "Reconnecter"
                : "Connecter Google"}
            </button>
          </div>
        </div>

        <div className="integration-row">
          <div className="integration-provider-icon">A</div>

          <div className="integration-provider-content">
            <div className="integration-provider-title">
              <strong>Allo</strong>

              <span className="integration-status connected">
                Opérationnel
              </span>
            </div>

            <small>
              Appels, SMS et conversations téléphoniques
            </small>
          </div>
        </div>

        <div className="integration-row">
          <div className="integration-provider-icon">C</div>

          <div className="integration-provider-content">
            <div className="integration-provider-title">
              <strong>Calendly</strong>

              <span className="integration-status planned">
                À venir
              </span>
            </div>

            <small>
              Rendez-vous et événements commerciaux
            </small>
          </div>
        </div>
      </div>
    </div>
  );
}