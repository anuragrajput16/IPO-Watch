import { useEffect, useState } from "react";
import { api } from "../api/client";
import { money } from "../components/bits";

type Stats = {
  totals: { users: number; activeUsers: number; ipos: number; applications: number;
            moneyTracked: number; allotted: number; notAllotted: number; hitRate: number | null };
  perIpo: { id: string; name: string; closeDate: string | null; applications: number;
            money: number; allotted: number; notAllotted: number }[];
  signups: { day: string; count: number }[];
};

export function Stats() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { void api.get<Stats>("/admin/stats").then(setS); }, []);
  if (!s) return <div className="card empty">Loading…</div>;

  // The API returns only days that had signups. Charting those alone stretches a
  // single day across the full width, which reads as "every day" — so fill the
  // whole 30-day window and let the empty days show.
  const byDay = new Map(s.signups.map((d) => [d.day, d.count]));
  const days: { day: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, count: byDay.get(key) ?? 0 });
  }
  const peak = Math.max(1, ...days.map((d) => d.count));
  const totalSignups = s.signups.reduce((t, d) => t + d.count, 0);

  return (
    <>
      <div className="section"><h2>Overview</h2><span className="note">across all users</span></div>
      <div className="tiles">
        <div className="card tile"><div className="k">Users</div>
          <div className="v num">{s.totals.users}</div>
          <div className="k">{s.totals.activeUsers} active</div></div>
        <div className="card tile"><div className="k">IPOs tracked</div>
          <div className="v num">{s.totals.ipos}</div></div>
        <div className="card tile"><div className="k">Applications</div>
          <div className="v num">{s.totals.applications}</div></div>
        <div className="card tile"><div className="k">Money tracked</div>
          <div className="v num">{money(s.totals.moneyTracked)}</div></div>
        <div className="card tile"><div className="k">Allotment hit rate</div>
          <div className="v num go">{s.totals.hitRate === null ? "—" : `${s.totals.hitRate}%`}</div>
          <div className="k">{s.totals.allotted} allotted · {s.totals.notAllotted} not</div></div>
      </div>

      <div className="section"><h2>Signups</h2><span className="note">last 30 days</span></div>
      <div className="card" style={{ padding: "18px 17px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90 }}>
          {days.map((d) => (
            <div key={d.day} title={`${d.day}: ${d.count} signup${d.count === 1 ? "" : "s"}`}
                 style={{
                   flex: 1, minWidth: 4, borderRadius: "3px 3px 0 0",
                   background: d.count ? "var(--accent)" : "var(--line)",
                   height: d.count ? `${(d.count / peak) * 100}%` : "3px",
                 }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8,
                      fontSize: 11, color: "var(--muted)" }}>
          <span>{days[0]!.day}</span>
          <span>{totalSignups} signup{totalSignups === 1 ? "" : "s"} · peak {peak}/day</span>
          <span>today</span>
        </div>
      </div>

      <div className="section"><h2>By IPO</h2><span className="note">busiest first</span></div>
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>IPO</th><th className="c hide-sm">Closes</th><th className="r">Applications</th>
            <th className="r">Money</th><th className="c">Allotted</th><th className="c">Not allotted</th>
          </tr></thead>
          <tbody>
            {s.perIpo.filter((i) => i.applications > 0).map((i) => (
              <tr key={i.id}>
                <td className="name">{i.name}</td>
                <td className="c num hide-sm">{i.closeDate ?? "—"}</td>
                <td className="r num">{i.applications}</td>
                <td className="r num" style={{ fontWeight: 700 }}>{money(i.money)}</td>
                <td className="c num" style={{ color: "var(--go)" }}>{i.allotted || "—"}</td>
                <td className="c num" style={{ color: "var(--stop)" }}>{i.notAllotted || "—"}</td>
              </tr>
            ))}
            {!s.perIpo.some((i) => i.applications > 0) && (
              <tr><td colSpan={6} className="empty">No applications recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
