import { useEffect, useState } from "react";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Pointage from "./pages/Pointage.jsx";
import Employes from "./pages/Employes.jsx";
import Projets from "./pages/Projets.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Header from "./components/Header.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");

  useEffect(() => {
    const saved = localStorage.getItem("3dc_user");
    if (saved) setUser(JSON.parse(saved));
  }, []);

  function handleLogin(employee) {
    localStorage.setItem("3dc_user", JSON.stringify(employee));
    setUser(employee);
    setPage("dashboard");
  }

  function handleLogout() {
    localStorage.removeItem("3dc_user");
    setUser(null);
  }

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} user={user} />
      <main className="main">
        <Header user={user} onLogout={handleLogout} />
        {page === "dashboard" && <Dashboard user={user} />}
        {page === "pointage" && <Pointage user={user} />}
        {page === "employes" && <Employes user={user} />}
        {page === "projets" && <Projets user={user} />}
      </main>
    </div>
  );
}
