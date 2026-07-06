import { useEffect, useState } from "react";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Pointage from "./pages/Pointage.jsx";
import Employes from "./pages/Employes.jsx";
import Projets from "./pages/Projets.jsx";
import Planning from "./pages/Planning.jsx";
import Stock from "./pages/Stock.jsx";
import Administration from "./pages/Administration.jsx";
import Couts from "./pages/Couts.jsx";
import Chiffrage from "./pages/Chiffrage.jsx";
import CRM from "./pages/Crm.jsx";   // <-- CORRECTION ICI
import Sidebar from "./components/Sidebar.jsx";
import Header from "./components/Header.jsx";
import { canAccess, loadEmployeePermissions } from "./services/permissions.js";

const pages = {
  dashboard: Dashboard,
  pointage: Pointage,
  employes: Employes,
  projets: Projets,
  planning: Planning,
  stock: Stock,
  administration: Administration,
  couts: Couts,
  chiffrage: Chiffrage,
  crm: CRM,
};

function App() {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [page, setPage] = useState("dashboard");
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem("3dc_user");

    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      refreshPermissions(parsedUser);
    }
  }, []);

  async function refreshPermissions(employee) {
    if (!employee?.id) return;

    setLoadingPermissions(true);
    const rights = await loadEmployeePermissions(employee);
    setPermissions(rights);
    setLoadingPermissions(false);
  }

  async function handleLogin(employee) {
    localStorage.setItem("3dc_user", JSON.stringify(employee));
    setUser(employee);
    setPage("dashboard");
    await refreshPermissions(employee);
  }

  function handleLogout() {
    localStorage.removeItem("3dc_user");
    setUser(null);
    setPermissions({});
    setPage("dashboard");
  }

  function safeSetPage(nextPage) {
    if (canAccess(user, permissions, nextPage, "can_view")) {
      setPage(nextPage);
      return;
    }

    setPage("dashboard");
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const PageComponent = pages[page] || Dashboard;
  const hasPageAccess = canAccess(user, permissions, page, "can_view");

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        setPage={safeSetPage}
        user={user}
        permissions={permissions}
      />

      <main className="main">
        <Header user={user} onLogout={handleLogout} />

        {loadingPermissions ? (
          <section className="page">
            <div className="card">
              <p>Chargement des autorisations...</p>
            </div>
          </section>
        ) : hasPageAccess ? (
          <PageComponent user={user} permissions={permissions} />
        ) : (
          <section className="page">
            <div className="card">
              <h2>Accès refusé</h2>
              <p>Tu n'as pas l'autorisation de consulter cet onglet.</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;

.live-punch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

.live-punch-card {
  border-radius: 22px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  background: white;
}

.live-punch-card.working {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.live-punch-card.paused {
  border-color: #fed7aa;
  background: #fff7ed;
}

.live-punch-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.live-punch-head strong,
.live-punch-head small,
.live-punch-detail small,
.live-punch-segments small {
  display: block;
}

.live-punch-head small,
.live-punch-detail small,
.live-punch-segments small {
  margin-top: 4px;
  color: #64748b;
  font-weight: 800;
}

.live-punch-head span {
  border-radius: 999px;
  padding: 8px 10px;
  background: white;
  border: 1px solid #e5e7eb;
  font-weight: 1000;
}

.live-punch-detail {
  margin-top: 12px;
}

.live-punch-segments {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #e5e7eb;
}

.manual-punch-form {
  display: grid;
  grid-template-columns: 1fr 150px 220px 1fr 1fr 1fr auto;
  gap: 10px;
  align-items: end;
  margin-bottom: 18px;
}

@media (max-width: 1250px) {
  .manual-punch-form {
    grid-template-columns: 1fr;
  }
}
