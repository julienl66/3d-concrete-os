const items = [
  { id: "dashboard", label: "Tableau de bord" },
  { id: "pointage", label: "Pointage" },
  { id: "employes", label: "Employés", adminOnly: true },
  { id: "projets", label: "Projets", adminOnly: true },
];

export default function Sidebar({ page, setPage, user }) {
  return (
    <aside className="sidebar">
      <div className="brand"><span>3D</span><strong>CONCRETE</strong></div>
      <nav>
        {items.filter(i => !i.adminOnly || user.role === "admin").map(item => (
          <button
            key={item.id}
            className={page === item.id ? "active" : ""}
            onClick={() => setPage(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
