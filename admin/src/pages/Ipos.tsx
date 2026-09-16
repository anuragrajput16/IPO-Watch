import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { Expired, Gmp, Modal, Rank, Stars, band, money } from "../components/bits";
import type { Ipo } from "../types";

const BLANK = {
  name: "", openDate: "", closeDate: "", priceMin: "", priceMax: "", lotAmount: "",
  retailQuota: "35%", quotaIndicative: false, rank: "",
  fundamentals: "", valuation: "", longTerm: "", listing: "",
  verdict: "Wait", verdictTone: "wait", registrarName: "", registrarUrl: "", scrapeKey: "",
};
type Form = typeof BLANK;

const toForm = (i: Ipo): Form => ({
  name: i.name, openDate: i.openDate ?? "", closeDate: i.closeDate ?? "",
  priceMin: i.priceMin?.toString() ?? "", priceMax: i.priceMax?.toString() ?? "",
  lotAmount: i.lotAmount?.toString() ?? "", retailQuota: i.retailQuota ?? "",
  quotaIndicative: i.quotaIndicative, rank: i.rank?.toString() ?? "",
  fundamentals: i.fundamentals?.toString() ?? "", valuation: i.valuation?.toString() ?? "",
  longTerm: i.longTerm?.toString() ?? "", listing: i.listing?.toString() ?? "",
  verdict: i.verdict, verdictTone: i.verdictTone,
  registrarName: i.registrarName ?? "", registrarUrl: i.registrarUrl ?? "",
  scrapeKey: i.scrapeKey ?? "",
});

// Empty strings mean "not set" and must go to the API as null, not 0 or "".
const num = (v: string) => (v.trim() === "" ? null : Number(v));
const str = (v: string) => (v.trim() === "" ? null : v.trim());

export function Ipos() {
  const [ipos, setIpos] = useState<Ipo[]>([]);
  const [editing, setEditing] = useState<Ipo | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIpos((await api.get<{ ipos: Ipo[] }>("/admin/ipos")).ipos);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function save() {
    if (!form) return;
    setError(null);
    const body = {
      name: form.name.trim(),
      openDate: str(form.openDate), closeDate: str(form.closeDate),
      priceMin: num(form.priceMin), priceMax: num(form.priceMax), lotAmount: num(form.lotAmount),
      retailQuota: str(form.retailQuota), quotaIndicative: form.quotaIndicative,
      rank: num(form.rank), fundamentals: num(form.fundamentals), valuation: num(form.valuation),
      longTerm: num(form.longTerm), listing: num(form.listing),
      verdict: form.verdict, verdictTone: form.verdictTone,
      registrarName: str(form.registrarName), registrarUrl: str(form.registrarUrl),
      scrapeKey: str(form.scrapeKey),
    };
    try {
      if (editing) await api.patch(`/admin/ipos/${editing.id}`, body);
      else await api.post("/admin/ipos", body);
      setForm(null); setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    }
  }

  async function remove(ipo: Ipo) {
    if (!confirm(`Delete ${ipo.name}?`)) return;
    setError(null);
    try {
      await api.del(`/admin/ipos/${ipo.id}`);
      await load();
    } catch (e) {
      // The API refuses when real applications reference it, unless forced.
      if (e instanceof ApiError && e.status === 409) {
        if (confirm(`${e.message}\n\nDelete the IPO and those applications?`)) {
          await api.del(`/admin/ipos/${ipo.id}?force=1`);
          await load();
        }
      } else setError((e as Error).message);
    }
  }

  return (
    <>
      <div className="section">
        <h2>IPO master data</h2><span className="note">{ipos.length} records</span>
        <span className="right">
          <button className="btn primary" onClick={() => { setEditing(null); setForm({ ...BLANK }); }}>
            + New IPO
          </button>
        </span>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>IPO</th><th className="c hide-sm">Window</th><th className="r">GMP</th>
            <th className="r hide-sm">Band</th><th className="r">1 lot</th>
            <th className="c hide-sm">F</th><th className="c hide-sm">V</th>
            <th className="c hide-sm">L-T</th><th className="c hide-sm">List</th>
            <th>Verdict</th><th className="r">Edit</th>
          </tr></thead>
          <tbody>
            {ipos.map((i) => (
              <tr key={i.id}>
                <td className="name"><Rank value={i.rank} />{i.name}<Expired ipo={i} /></td>
                <td className="c num hide-sm" style={{ fontSize: 11.5 }}>
                  {i.openDate ?? "?"} → {i.closeDate ?? "?"}
                </td>
                <td className="r"><Gmp ipo={i} /></td>
                <td className="r num hide-sm">{band(i)}</td>
                <td className="r num">{i.lotAmount ? money(i.lotAmount) : <span className="qmark">TBD</span>}</td>
                <td className="c hide-sm"><Stars value={i.fundamentals} /></td>
                <td className="c hide-sm"><Stars value={i.valuation} /></td>
                <td className="c hide-sm"><Stars value={i.longTerm} /></td>
                <td className="c hide-sm"><Stars value={i.listing} /></td>
                <td><span className={`pill v-${i.verdictTone}`}>{i.verdict}</span></td>
                <td className="r" style={{ whiteSpace: "nowrap" }}>
                  <button className="linkbtn" onClick={() => { setEditing(i); setForm(toForm(i)); }}>Edit</button>
                  <button className="linkbtn" style={{ color: "var(--stop)" }} onClick={() => remove(i)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={editing ? `Edit ${editing.name}` : "New IPO"}
               lead="This is what every user's dashboard reads."
               onClose={() => { setForm(null); setEditing(null); }}>
          {error && <div className="error">{error}</div>}
          <label className="field"><span>Name</span>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} /></label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="field"><span>Opens</span>
              <input type="date" value={form.openDate} onChange={(e) => set("openDate", e.target.value)} /></label>
            <label className="field"><span>Closes</span>
              <input type="date" value={form.closeDate} onChange={(e) => set("closeDate", e.target.value)} /></label>
            <label className="field"><span>Price min</span>
              <input value={form.priceMin} onChange={(e) => set("priceMin", e.target.value)} /></label>
            <label className="field"><span>Price max</span>
              <input value={form.priceMax} onChange={(e) => set("priceMax", e.target.value)} /></label>
            <label className="field"><span>1 lot at cut-off ₹</span>
              <input value={form.lotAmount} onChange={(e) => set("lotAmount", e.target.value)} /></label>
            <label className="field"><span>Retail quota</span>
              <input value={form.retailQuota} onChange={(e) => set("retailQuota", e.target.value)} /></label>
          </div>

          <label className="field" style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <input type="checkbox" style={{ width: 16, height: 16 }} checked={form.quotaIndicative}
                   onChange={(e) => set("quotaIndicative", e.target.checked)} />
            <span style={{ margin: 0 }}>Quota is indicative (shows the * asterisk)</span>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {([["fundamentals", "Fund."], ["valuation", "Val."], ["longTerm", "Long-term"], ["listing", "Listing"]] as const)
              .map(([k, label]) => (
                <label className="field" key={k}><span>{label}</span>
                  <input placeholder="0–5" value={form[k]} onChange={(e) => set(k, e.target.value)} /></label>
              ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
            <label className="field"><span>Verdict</span>
              <input value={form.verdict} onChange={(e) => set("verdict", e.target.value)} /></label>
            <label className="field"><span>Tone</span>
              <select value={form.verdictTone} onChange={(e) => set("verdictTone", e.target.value)}>
                <option value="go">go</option><option value="wait">wait</option><option value="stop">stop</option>
              </select></label>
            <label className="field"><span>Rank</span>
              <input value={form.rank} onChange={(e) => set("rank", e.target.value)} /></label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label className="field"><span>Registrar</span>
              <input value={form.registrarName} onChange={(e) => set("registrarName", e.target.value)} /></label>
            <label className="field"><span>Registrar URL</span>
              <input value={form.registrarUrl} onChange={(e) => set("registrarUrl", e.target.value)} /></label>
          </div>
          <label className="field"><span>Scrape key — lowercase text matched against the GMP source</span>
            <input value={form.scrapeKey} onChange={(e) => set("scrapeKey", e.target.value)} /></label>

          <div className="modal-actions">
            <button className="btn" onClick={() => { setForm(null); setEditing(null); }}>Cancel</button>
            <button className="btn primary" onClick={save}>{editing ? "Save changes" : "Create IPO"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
