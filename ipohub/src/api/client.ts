import * as Keychain from "react-native-keychain";
import { API_URL } from "../config";

const BASE = API_URL;
const REFRESH_SERVICE = "com.ipohub.refresh";

// Keychain on iOS, Keystore on Android. The refresh token is a long-lived
// credential, so it does not belong in AsyncStorage, which is plain files.
const store = {
  async get(): Promise<string | null> {
    try {
      const c = await Keychain.getGenericPassword({ service: REFRESH_SERVICE });
      return c ? c.password : null;
    } catch {
      return null;
    }
  },
  async set(value: string): Promise<void> {
    await Keychain.setGenericPassword("refresh", value, { service: REFRESH_SERVICE });
  },
  async del(): Promise<void> {
    await Keychain.resetGenericPassword({ service: REFRESH_SERVICE });
  },
};

// The access token stays in memory; only the refresh token is persisted, and
// only in secure storage.
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getRefreshToken = () => store.get();
export const saveRefreshToken = (t: string) => store.set(t);
export const clearRefreshToken = () => store.del();

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      // Tells the API this is a native client, so the refresh token comes back
      // in the body instead of an httpOnly cookie the app could never read.
      "X-Client": "mobile",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await tryRefresh()) return request<T>(path, init, false);
  }
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw new ApiError(res.status, body.error ?? "Request failed");
  return body as T;
}

let refreshing: Promise<boolean> | null = null;
/** Collapses parallel 401s into one refresh call. */
export function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const token = await getRefreshToken();
      if (!token) return false;
      try {
        const res = await fetch(BASE + "/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Client": "mobile" },
          body: JSON.stringify({ refreshToken: token }),
        });
        if (!res.ok) { await clearRefreshToken(); setAccessToken(null); return false; }
        const data = await res.json();
        setAccessToken(data.accessToken);
        if (data.refreshToken) await saveRefreshToken(data.refreshToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body: unknown) =>
    request<T>(p, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};
