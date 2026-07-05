export default function Header({ user, onLogout }) {
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="header premium-header">
      <div>
        <p className="eyebrow">{today}</p>
        <h1>3D Concrete ERP</h1>
        <p>Atelier, production, projets & rentabilité</p>
      </div>

      <div className="header-user-zone">
        <div className="user-avatar">
          {(user?.name || "U").slice(0, 1).toUpperCase()}
        </div>

        <div>
          <strong>{user?.name || "Utilisateur"}</strong>
          <br />
          <small>{user?.role || "-"}</small>
        </div>

        <button className="btn small danger-soft" onClick={onLogout}>
          Déconnexion
        </button>
      </div>
    </header>
  );
}
