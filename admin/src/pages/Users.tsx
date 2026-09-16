import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

type AdminUser = {
  id: string; email: string; name: string; role: "user" | "admin";
  isActive: boolean; createdAt: string; lastLoginAt: string | null;
  applicants: number; applications: number;
};

export function Users() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.get<{ users: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(q)}`);
    setUsers(r.users);
  }, [q]);

  useEffect(() => { void load(); }, [load]);

  async function update(u: AdminUser, patch: Record<string, unknown>) {
    setError(null);
    try {
      await api.patch(`/admin/users/${u.id}`, patch);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update");
    }
  }

  return (
    <>
      <div className="section">
        <h2>Users</h2><span className="note">{users.length} shown</span>
        <span className="right" style={{ minWidth: 230 }}>
          <input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </span>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>User</th><th className="c">Role</th><th className="c hide-sm">PANs</th>
            <th className="c hide-sm">Applications</th><th className="c hide-sm">Last login</th>
            <th className="c">Active</th>
          </tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="name">{u.name}
                  <div className="pan">{u.email}</div></td>
                <td className="c">
                  <select style={{ width: "auto" }} value={u.role}
                          onChange={(e) => update(u, { role: e.target.value })}>
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="c num hide-sm">{u.applicants}</td>
                <td className="c num hide-sm">{u.applications}</td>
                <td className="c num hide-sm" style={{ fontSize: 11.5, color: "var(--muted)" }}>
                  {u.lastLoginAt ? u.lastLoginAt.slice(0, 10) : "never"}
                </td>
                <td className="c">
                  <button className={`btn small ${u.isActive ? "" : "danger"}`}
                          onClick={() => update(u, { isActive: !u.isActive })}>
                    {u.isActive ? "Active" : "Deactivated"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 12, color: "var(--muted)", fontSize: 12 }}>
        PANs are never shown here — they're encrypted per user and only that user's session can decrypt them.
        Deactivating or demoting someone revokes their live sessions immediately.
      </p>
    </>
  );
}
