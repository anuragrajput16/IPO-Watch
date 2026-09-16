import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { Gmp as GmpCell } from "../components/bits";
import type { Ipo } from "../types";

type Run = {
  id: string; status: "running" | "ok" | "failed"; matchedCount: number;
  error: string | null; triggeredBy: string; startedAt: string; finishedAt: string | null;
};

export function Gmp() {
  const [ipos, setIpos] = useState<Ipo[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [override, setOverride] = useState<Record<string, { pct: string; rup: string }>>({});

  const load = useCallback(async () => {
    const [i, r] = await Promise.all([
      api.get<{ ipos: Ipo[] }>("/admin/ipos"),
      api.get<{ runs: Run[] }>("/admin/gmp/runs"),
    ]);
    setIpos(i.ipos); setRuns(r.runs);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ matched: number; stamp: string | null }>("/admin/gmp/refresh");
      setMsg({ tone: "ok", text: `Scraped ${r.matched} quotes${r.stamp ? ` · source stamp ${r.stamp}` : ""}.` });
      await load();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Scrape failed" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveOverride(ipo: Ipo) {
    const v = override[ipo.id];
    if (!v) return;
    setMsg(null);
    try {
      await api.post(`/admin/gmp/${ipo.id}`, {
        gmpPct: v.pct.trim() === "" ? null : Number(v.pct),
        gmpRupees: v.rup.trim() === "" ? null : Number(v.rup),
      });
      setOverride((o) => { const n = { ...o }; delete n[ipo.id]; return n; });
      setMsg({ tone: "ok", text: `Set ${ipo.name} by hand.` });
      await load();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    }
  }

  return (
    <>
      <div className="section">
        <h2>GMP control</h2>
        <span className="note">grey-market premium, scraped from ipowatch.in</span>
        <span className="right">
          <button className="btn primary" onClick={refresh} disabled={busy}>
            {busy ? "Scraping…" : "Run scrape now"}
          </button>
        </span>
      </div>
      {msg && <div className={msg.tone === "ok" ? "ok" : "error"}>{msg.text}</div>}

      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>IPO</th><th className="r">Latest</th><th className="c hide-sm">Captured</th>
            <th className="c hide-sm">Scrape key</th><th className="r">Override</th>
          </tr></thead>
          <tbody>
            {ipos.map((i) => {
              const ov = override[i.id];
              return (
                <tr key={i.id}>
                  <td className="name">{i.name}</td>
                  <td className="r"><GmpCell ipo={i} /></td>
                  <td className="c num hide-sm" style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {i.gmpAt ? new Date(i.gmpAt).toLocaleString(undefined,
                      { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never"}
                  </td>
                  <td className="c hide-sm pan">{i.scrapeKey ?? <span className="qmark">unset</span>}</td>
                  <td className="r" style={{ whiteSpace: "nowrap" }}>
                    {ov ? (
                      <span style={{ display: "inline-flex", gap: 5 }}>
                        <input style={{ width: 66 }} placeholder="%" value={ov.pct}
                               onChange={(e) => setOverride((o) => ({ ...o, [i.id]: { ...ov, pct: e.target.value } }))} />
                        <input style={{ width: 66 }} placeholder="₹" value={ov.rup}
                               onChange={(e) => setOverride((o) => ({ ...o, [i.id]: { ...ov, rup: e.target.value } }))} />
                        <button className="btn small primary" onClick={() => saveOverride(i)}>Set</button>
                      </span>
                    ) : (
                      <button className="linkbtn"
                              onClick={() => setOverride((o) => ({ ...o, [i.id]: { pct: "", rup: "" } }))}>
                        Set by hand
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="section"><h2>Run history</h2><span className="note">last {runs.length}</span></div>
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th className="c">Status</th><th>Started</th><th className="r">Matched</th>
            <th className="hide-sm">Triggered by</th><th>Error</th>
          </tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="c">
                  <span className={`pill ${r.status === "ok" ? "v-go" : r.status === "failed" ? "v-stop" : "v-wait"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="num" style={{ fontSize: 12 }}>
                  {new Date(r.startedAt).toLocaleString(undefined,
                    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </td>
                <td className="r num">{r.matchedCount}</td>
                <td className="hide-sm pan">{r.triggeredBy}</td>
                <td style={{ color: "var(--stop)", fontSize: 11.5 }}>{r.error ?? ""}</td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={5} className="empty">No runs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
