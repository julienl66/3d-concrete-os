export default function Header({ user, onLogout }) {
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{today}</p>
        <h1>3D Concrete Time</h1>
      </div>

      <div className="user-zone">
        <div className="avatar">{user.name?.[0]?.toUpperCase()}</div>
        <div>
          <strong>{user.name}</strong>
          <span>{user.role === "admin" ? "Administrateur" : "Employé"}</span>
        </div>
        <button className="btn ghost danger-text" onClick={onLogout}>Déconnexion</button>
      </div>
    </header>
  );
}
