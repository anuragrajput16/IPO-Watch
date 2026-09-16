import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth"><div className="card empty">Loading…</div></div>;
  return user ? <Dashboard /> : <Login />;
}

export default function App() {
  return <AuthProvider><Gate /></AuthProvider>;
}
