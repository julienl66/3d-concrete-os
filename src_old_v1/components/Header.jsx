export default function Header({ user, onLogout }) {
  return (
    <header className="topbar">
      <div>
        <h1>3D Concrete Time</h1>
        <p>Connecté : <strong>{user.name}</strong> · {user.role}</p>
      </div>
      <button className="btn danger" onClick={onLogout}>Déconnexion</button>
    </header>
  );
}
