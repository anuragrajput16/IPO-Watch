import { useState } from "react";
import { api } from "../api/client";
import type { Applicant, Application, Ipo } from "../types";
import { Modal, money } from "./bits";

/** Tick who applied for this IPO and what each put in. */
export function ApplyModal({ ipo, people, existing, onClose, onChanged }: {
  ipo: Ipo; people: Applicant[]; existing: Application[];
  onClose: () => void; onChanged: () => void;
}) {
  const initial = new Map(existing.map((a) => [a.applicantId, a.amount]));
  const [picked, setPicked] = useState<Map<string, number>>(initial);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    const next = new Map(picked);
    if (next.has(id)) next.delete(id);
    else next.set(id, ipo.lotAmount ?? 0);
    setPicked(next);
  };
  const setAmount = (id: string, v: string) => {
    const next = new Map(picked);
    next.set(id, Number(v.replace(/[^0-9]/g, "")) || 0);
    setPicked(next);
  };

  const total = [...picked.values()].reduce((s, v) => s + v, 0);

  async function save() {
    setBusy(true);
    try {
      // Anything unticked that used to be there is a removal.
      for (const a of existing) if (!picked.has(a.applicantId)) await api.del(`/applications/${a.id}`);
      for (const [applicantId, amount] of picked)
        await api.post("/applications", { ipoId: ipo.id, applicantId, amount });
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Who is applying for ${ipo.name}?`}
           lead={`One lot at cut-off is ${ipo.lotAmount ? money(ipo.lotAmount) : "not announced yet"}.`}
           onClose={onClose}>
      {people.length === 0 && <div className="empty">Add a person first.</div>}

      {people.map((p) => {
        const on = picked.has(p.id);
        return (
          <div key={p.id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "9px 0",
            borderBottom: "1px solid var(--line)",
          }}>
            <input type="checkbox" checked={on} onChange={() => toggle(p.id)}
                   style={{ width: 17, height: 17, flex: "0 0 auto" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 650 }}>{p.name}</div>
              <div className="pan num">•••••{p.panLast4}</div>
            </div>
            {on && (
              <input className="num" style={{ width: 120, textAlign: "right" }}
                     value={picked.get(p.id) ?? 0}
                     onChange={(e) => setAmount(p.id, e.target.value)} />
            )}
          </div>
        );
      })}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 15, fontWeight: 700 }}>
        <span>{picked.size} applying</span>
        <span className="num">{money(total)}</span>
      </div>

      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy || people.length === 0}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
