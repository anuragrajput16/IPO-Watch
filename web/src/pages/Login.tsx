import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";

export function Login({ adminConsole = false }: { adminConsole?: boolean }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="card" onSubmit={submit}>
        <h1>IPO Watch{adminConsole ? " · Admin" : ""}</h1>
        <p className="lead">
          {adminConsole
            ? "Sign in with an admin account."
            : mode === "login" ? "Sign in to your tracker." : "Create an account to start tracking."}
        </p>

        {error && <div className="error">{error}</div>}

        {mode === "register" && (
          <label className="field">
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                 required minLength={8} />
        </label>

        <button className="btn primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        {!adminConsole && (
          <div className="swap">
            {mode === "login" ? "No account yet? " : "Already registered? "}
            <button type="button" className="linkbtn"
                    onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </div>
        )}

        {/* <div className="hint">
          <b>Seeded accounts</b><br />
          {adminConsole
            ? "admin@ipowatch.local · admin12345"
            : "demo@ipowatch.local · demo12345"}
        </div> */}
      </form>
    </div>
  );
}
