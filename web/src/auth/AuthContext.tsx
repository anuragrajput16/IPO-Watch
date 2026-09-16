import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setAccessToken, tryRefresh } from "../api/client";
import type { Role, User } from "../types";

type AuthValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children, requireRole }: { children: ReactNode; requireRole?: Role }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On load the access token is gone (memory only) but the refresh cookie may
  // still be good — so try once before deciding the visitor is signed out.
  useEffect(() => {
    void (async () => {
      if (await tryRefresh()) {
        try {
          const { user } = await api.get<{ user: User }>("/auth/me");
          if (!requireRole || user.role === requireRole) setUser(user);
        } catch { /* stay signed out */ }
      }
      setLoading(false);
    })();
  }, [requireRole]);

  const accept = (u: User) => {
    if (requireRole && u.role !== requireRole) throw new Error("This console is for admins only");
    setUser(u);
  };

  const value: AuthValue = {
    user, loading,
    login: async (email, password) => {
      const r = await api.post<{ user: User; accessToken: string }>("/auth/login", { email, password });
      setAccessToken(r.accessToken);
      accept(r.user);
    },
    register: async (name, email, password) => {
      const r = await api.post<{ user: User; accessToken: string }>("/auth/register", { name, email, password });
      setAccessToken(r.accessToken);
      accept(r.user);
    },
    logout: async () => {
      await api.post("/auth/logout").catch(() => {});
      setAccessToken(null);
      setUser(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
