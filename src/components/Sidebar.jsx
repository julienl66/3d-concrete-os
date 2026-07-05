import { canAccess } from "../services/permissions.js";

const items = [
  { id: "dashboard", label: "Tableau de bord", icon: "📊" },
  { id: "pointage", label: "Pointage", icon: "⏱️" },
  { id: "employes", label: "Employés", icon: "👷" },
  { id: "projets", label: "Projets", icon: "📁" },
  { id: "planning", label: "Planning", icon: "📅" },
  { id: "stock", label: "Stock", icon: "📦" },
  { id: "administration", label: "Administration", icon: "⚙️" },
];

export default function Sidebar({ page, setPage, user, permissions }) {
  const visibleItems = items.filter((item) =>
    canAccess(user, permissions, item.id, "can_view")
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <span>3D</span>
        <div>
          <strong>CONCRETE</strong>
          <small>OS interne</small>
        </div>
      </div>

      <nav>
        {visibleItems.map((item) => (
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
