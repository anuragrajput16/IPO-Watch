import React, { createContext, useContext, useEffect, useState } from "react";
import { api, clearRefreshToken, saveRefreshToken, setAccessToken, tryRefresh } from "../api/client";
import type { User } from "../types";

type AuthValue = {
  user: User | null;
  booting: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthValue | null>(null);

type AuthResponse = { user: User; accessToken: string; refreshToken?: string };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  // A stored refresh token means the last session can be resumed without the
  // person signing in again — the point of persisting it at all.
  useEffect(() => {
    void (async () => {
      if (await tryRefresh()) {
        try {
          setUser((await api.get<{ user: User }>("/auth/me")).user);
        } catch { /* fall through to the sign-in screen */ }
      }
      setBooting(false);
    })();
  }, []);

  const accept = async (r: AuthResponse) => {
    setAccessToken(r.accessToken);
    if (r.refreshToken) await saveRefreshToken(r.refreshToken);
    setUser(r.user);
  };

  const value: AuthValue = {
    user, booting,
    login: async (email, password) =>
      accept(await api.post<AuthResponse>("/auth/login", { email, password })),
    register: async (name, email, password) =>
      accept(await api.post<AuthResponse>("/auth/register", { name, email, password })),
    logout: async () => {
      await api.post("/auth/logout").catch(() => {});
      await clearRefreshToken();
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
