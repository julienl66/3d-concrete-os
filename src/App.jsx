import { useEffect, useState } from "react";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import BusinessIntelligence from "./pages/BusinessIntelligence.jsx";
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
  bi: BusinessIntelligence,
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