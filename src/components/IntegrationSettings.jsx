import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  connectGoogle,
  getGoogleIntegrationAccount,
  syncGmail,
} from "../services/integrations.js";

function getStoredUser() {
  try {
    const storedUser =
      localStorage.getItem("3dc_user");

    if (!storedUser) {
      return null;
    }

    return JSON.parse(storedUser);
  } catch (error) {
    console.error(
      "Impossible de lire l'utilisateur enregistré :",
      error
    );

    return null;
  }
}

function formatDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString("fr-FR");
}

export default function IntegrationSettings({
  user,
  setMessage,
}) {
  const [googleAccount, setGoogleAccount] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [connecting, setConnecting] =
    useState(false);

  const [syncing, setSyncing] =
    useState(false);

  const [lastSyncResult, setLastSyncResult] =
    useState(null);

  const [diagnosticError, setDiagnosticError] =
    useState("");

  const currentUser = useMemo(
    () => user || getStoredUser(),
    [user]
  );

  const currentUserId =
    currentUser?.id ||
    currentUser?.user_id ||
    currentUser?.employee_id ||
    currentUser?.employeeId ||
    null;

  const loadGoogleAccount = useCallback(
    async () => {
      console.log(
        "[IntegrationSettings] Chargement du compte Google"
      );

      console.log(
        "[IntegrationSettings] Utilisateur ERP :",
        currentUser
      );

      console.log(
        "[IntegrationSettings] ID ERP :",
        currentUserId
      );

      setDiagnosticError("");

      if (!currentUserId) {
        const errorMessage =
          "Aucun identifiant utilisateur ERP n'a été trouvé.";

        setGoogleAccount(null);
        setDiagnosticError(errorMessage);
        setMessage(errorMessage);

        return null;
      }

      try {
        setLoading(true);

        const account =
          await getGoogleIntegrationAccount(
            currentUserId
          );

        console.log(
          "[IntegrationSettings] Compte Google reçu :",
          account
        );

        setGoogleAccount(account);

        if (!account) {
          setDiagnosticError(
            "La fonction gmail-status a répondu, mais aucun compte Google n'a été trouvé pour cet utilisateur."
          );
        }

        return account;
      } catch (error) {
        console.error(
          "[IntegrationSettings] Erreur de chargement :",
          error
        );

        const errorMessage =
          error instanceof Error
            ? error.message
            : "Impossible de charger l'intégration Google.";

        setGoogleAccount(null);
        setDiagnosticError(errorMessage);
        setMessage(errorMessage);

        return null;
      } finally {
        setLoading(false);
      }
    },
    [
      currentUser,
      currentUserId,
      setMessage,
    ]
  );

  useEffect(() => {
    loadGoogleAccount();
  }, [loadGoogleAccount]);

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const integration =
      params.get("integration");

    const status =
      params.get("status");

    const email =
      params.get("email");

    const reason =
      params.get("reason");

    if (
      integration !== "google" ||
      !status
    ) {
      return;
    }

    async function handleOAuthReturn() {
      if (status === "success") {
        setMessage(
          email
            ? `Compte Google ${email} connecté avec succès.`
            : "Compte Google connecté avec succès."
        );

        await loadGoogleAccount();
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

      const remainingQuery =
        params.toString();

      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${
          remainingQuery
            ? `?${remainingQuery}`
            : ""
        }${window.location.hash}`
      );
    }

    handleOAuthReturn();
  }, [
    loadGoogleAccount,
    setMessage,
  ]);

  async function handleConnectGoogle() {
    try {
      setConnecting(true);
      setDiagnosticError("");

      if (!currentUserId) {
        throw new Error(
          "Impossible d'identifier l'utilisateur connecté."
        );
      }

      setMessage(
        "Redirection vers Google…"
      );

      await connectGoogle(currentUserId);
    } catch (error) {
      console.error(
        "Connexion Google :",
        error
      );

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Impossible de connecter Google.";

      setDiagnosticError(errorMessage);
      setMessage(errorMessage);
      setConnecting(false);
    }
  }

  async function handleSyncGmail() {
    try {
      setSyncing(true);
      setLastSyncResult(null);
      setDiagnosticError("");

      if (!currentUserId) {
        throw new Error(
          "Impossible d'identifier l'utilisateur connecté."
        );
      }

      if (
        googleAccount?.status !== "active"
      ) {
        throw new Error(
          "Le compte Google n'est pas reconnu comme actif."
        );
      }

      setMessage(
        "Synchronisation Gmail en cours…"
      );

      const result =
        await syncGmail(currentUserId);

      setLastSyncResult(result);

      setMessage(
        result?.message ||
        "Synchronisation Gmail terminée."
      );

      await loadGoogleAccount();
    } catch (error) {
      console.error(
        "Synchronisation Gmail :",
        error
      );

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Impossible de synchroniser Gmail.";

      setDiagnosticError(errorMessage);
      setMessage(errorMessage);
    } finally {
      setSyncing(false);
    }
  }

  const isGoogleConnected =
    googleAccount?.status === "active";

  const connectedAt =
    formatDate(
      googleAccount?.connected_at
    );

  const lastUsedAt =
    formatDate(
      googleAccount?.last_used_at
    );

  return (
    <div className="card integration-settings-card">
      <div className="integration-settings-head">
        <div>
          <h3>Intégrations</h3>

          <p>
            Connecte les services externes utilisés
            par ton compte ERP.
          </p>
        </div>

        <button
          type="button"
          className="btn small"
          onClick={loadGoogleAccount}
          disabled={
            loading ||
            !currentUserId
          }
        >
          {loading
            ? "Actualisation…"
            : "Actualiser"}
        </button>
      </div>

      <div
        style={{
          padding: "12px",
          marginBottom: "16px",
          border: "1px solid #d1d5db",
          borderRadius: "8px",
          background: "#f9fafb",
        }}
      >
        <strong>
          Diagnostic Google
        </strong>

        <p>
          Utilisateur ERP :{" "}
          {currentUserId ||
            "introuvable"}
        </p>

        <p>
          Statut reçu :{" "}
          {googleAccount?.status ||
            "aucun"}
        </p>

        <p>
          Compte Google :{" "}
          {googleAccount?.email ||
            "aucun"}
        </p>

        {diagnosticError && (
          <p
            style={{
              color: "#b91c1c",
              fontWeight: "600",
            }}
          >
            Erreur : {diagnosticError}
          </p>
        )}
      </div>

      <div className="integration-list">
        <div className="integration-row">
          <div className="integration-provider-icon">
            G
          </div>

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
                {loading
                  ? "Vérification…"
                  : isGoogleConnected
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

            {connectedAt && (
              <small>
                Connexion enregistrée le{" "}
                {connectedAt}
              </small>
            )}

            {lastUsedAt && (
              <small>
                Dernière utilisation le{" "}
                {lastUsedAt}
              </small>
            )}

            {lastSyncResult && (
              <p className="integration-sync-result">
                {lastSyncResult.message ||
                  `${lastSyncResult.threads_synced ?? 0} conversation(s) Gmail synchronisée(s).`}
              </p>
            )}
          </div>

          <div className="integration-provider-actions">
            <button
              type="button"
              className="btn primary"
              onClick={handleConnectGoogle}
              disabled={
                connecting ||
                syncing ||
                !currentUserId
              }
            >
              {connecting
                ? "Connexion…"
                : isGoogleConnected
                ? "Reconnecter"
                : "Connecter Google"}
            </button>

            <button
              type="button"
              className="btn"
              onClick={handleSyncGmail}
              disabled={
                syncing ||
                connecting ||
                loading ||
                !isGoogleConnected
              }
            >
              {syncing
                ? "Synchronisation…"
                : "Synchroniser Gmail"}
            </button>
          </div>
        </div>

        <div className="integration-row">
          <div className="integration-provider-icon">
            A
          </div>

          <div className="integration-provider-content">
            <div className="integration-provider-title">
              <strong>Allo</strong>

              <span className="integration-status connected">
                Opérationnel
              </span>
            </div>

            <small>
              Appels, SMS et conversations
              téléphoniques
            </small>
          </div>
        </div>

        <div className="integration-row">
          <div className="integration-provider-icon">
            C
          </div>

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