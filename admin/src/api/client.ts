const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

// The access token lives in memory only: localStorage would expose it to any XSS
// on the page. The refresh token is an httpOnly cookie the JS can't read at all.
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string[]>) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });

  // One silent refresh-and-retry, so a 15-minute token never interrupts the user.
  if (res.status === 401 && retry && path !== "/auth/refresh" && path !== "/auth/login") {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, init, false);
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw new ApiError(res.status, body.error ?? "Request failed", body.fields);
  return body as T;
}

let refreshing: Promise<boolean> | null = null;
/** Collapses parallel 401s into a single refresh call. */
export function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(BASE + "/auth/refresh", { method: "POST", credentials: "include" })
      .then(async (r) => {
        if (!r.ok) { setAccessToken(null); return false; }
        const data = await r.json();
        setAccessToken(data.accessToken);
        return true;
      })
      .catch(() => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export const api = {
  get:  <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body: unknown) =>
    request<T>(p, { method: "PATCH", body: JSON.stringify(body) }),
  del:  <T>(p: string) => request<T>(p, { method: "DELETE" }),
};
