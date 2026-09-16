import { useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Gmp } from "./pages/Gmp";
import { Ipos } from "./pages/Ipos";
import { Login } from "./pages/Login";
import { Stats } from "./pages/Stats";
import { Users } from "./pages/Users";

const TABS = [
  ["stats", "Dashboard"], ["ipos", "IPOs"], ["users", "Users"], ["gmp", "GMP"],
] as const;
type Tab = (typeof TABS)[number][0];

function Console() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("stats");

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div>
            <h1>IPO Watch · Admin</h1>
            <p className="sub">Master data, users and GMP</p>
          </div>
          <nav className="nav">
            {TABS.map(([k, label]) => (
              <a key={k} href="#" className={tab === k ? "on" : ""}
                 onClick={(e) => { e.preventDefault(); setTab(k); }}>{label}</a>
            ))}
          </nav>
          <div className="right">
            <span className="who">{user?.email}</span>
            <button className="btn small" onClick={() => void logout()}>Sign out</button>
          </div>
        </div>
      </header>
      <div className="wrap">
        {tab === "stats" && <Stats />}
        {tab === "ipos" && <Ipos />}
        {tab === "users" && <Users />}
        {tab === "gmp" && <Gmp />}
      </div>
    </>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth"><div className="card empty">Loading…</div></div>;
  return user ? <Console /> : <Login adminConsole />;
}

export default function App() {
  // requireRole keeps a plain user from getting a console shell even if they sign in.
  return <AuthProvider requireRole="admin"><Gate /></AuthProvider>;
}
