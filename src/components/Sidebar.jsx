import { canAccess } from "../services/permissions.js";

const items = [
  { id: "dashboard", label: "Tableau de bord", icon: "🏠" },
  { id: "bi", label: "Business Intelligence", icon: "📊" },
  { id: "pointage", label: "Pointage", icon: "⏱️" },
  { id: "employes", label: "Employés", icon: "👷" },
  { id: "projets", label: "Projets", icon: "📁" },
  { id: "chiffrage", label: "Chiffrage", icon: "🧮" },
  { id: "crm", label: "CRM", icon: "🤝" },
  { id: "planning", label: "Planning", icon: "📅" },
  { id: "stock", label: "Stock", icon: "📦" },
  { id: "couts", label: "Coûts & marges", icon: "💰" },
  { id: "administration", label: "Administration", icon: "⚙️" },
];

export default function Sidebar({ page, setPage, user, permissions }) {
  const visibleItems = items.filter((item) =>
    canAccess(user, permissions, item.id, "can_view")
  );

  return (
    <aside className="sidebar premium-sidebar">
      <div className="premium-logo-wrap">
        <img src="/logo-3d-concrete.jpg" alt="3D Concrete" />
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

      <div className="sidebar-version">
        <strong>3D Concrete ERP</strong>
        <small>Version 1.0</small>
      </div>
    </aside>
  );
}
