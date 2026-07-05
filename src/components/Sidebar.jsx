const items = [
  { id: "dashboard", label: "Tableau de bord", icon: "📊" },
  { id: "pointage", label: "Pointage", icon: "⏱️" },
  { id: "employes", label: "Employés", icon: "👷", adminOnly: true },
  { id: "projets", label: "Projets", icon: "📁", adminOnly: true },
  { id: "planning", label: "Planning", icon: "📅", adminOnly: true },
  { id: "stock", label: "Stock", icon: "📦", adminOnly: true },
];

export default function Sidebar({ page, setPage, user }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span>3D</span>
        <div>
          <strong>CONCRETE</strong>
          <small>ERP interne</small>
        </div>
      </div>

      <nav>
        {items.filter(i => !i.adminOnly || user.role === "admin").map(item => (
          <button
            key={item.id}
            className={page === item.id ? "active" : ""}
            onClick={() => setPage(item.id)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
