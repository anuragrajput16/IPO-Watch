import { useState } from "react";
import { api, ApiError } from "../api/client";
import type { Applicant } from "../types";
import { Modal } from "./bits";

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function PeopleModal({ people, onClose, onChanged }:
  { people: Applicant[]; onClose: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState<Applicant | null>(null);
  const [adding, setAdding] = useState(people.length === 0);
  const [name, setName] = useState("");
  const [pan, setPan] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startEdit = (p: Applicant) => {
    setEditing(p); setAdding(true); setName(p.name); setPan(""); setError(null);
  };
  const startAdd = () => {
    setEditing(null); setAdding(true); setName(""); setPan(""); setError(null);
  };

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Name is required");
    // Editing without retyping the PAN keeps the stored one.
    if (pan && !PAN_RE.test(pan.toUpperCase())) return setError("PAN looks like ABCDE1234F");
    if (!editing && !pan) return setError("PAN is required");

    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (pan) body.pan = pan.toUpperCase();
      if (!editing && people.length === 0) body.isSelf = true;

      if (editing) await api.patch(`/applicants/${editing.id}`, body);
      else await api.post("/applicants", body);

      setAdding(false); setEditing(null); setName(""); setPan("");
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    }
  }

  async function remove(p: Applicant) {
    if (!confirm(`Remove ${p.name}? Their applications go too.`)) return;
    await api.del(`/applicants/${p.id}`);
    onChanged();
  }

  async function makeSelf(p: Applicant) {
    await api.patch(`/applicants/${p.id}`, { isSelf: true });
    onChanged();
  }

  return (
    <Modal title="People you apply for"
           lead="Each person applies with their own PAN. PANs are encrypted before they're stored."
           onClose={onClose}>
      {people.length > 0 && (
        <div className="tablewrap">
          <table style={{ minWidth: 0 }}>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="name">
                    {p.name} {p.isSelf && <span className="pill v-go" style={{ fontSize: 9.5 }}>YOU</span>}
                    <div className="pan num">•••••{p.panLast4}</div>
                  </td>
                  <td className="r" style={{ whiteSpace: "nowrap" }}>
                    {!p.isSelf && <button className="linkbtn" onClick={() => makeSelf(p)}>This is me</button>}
                    <button className="linkbtn" onClick={() => startEdit(p)}>Edit</button>
                    <button className="linkbtn" style={{ color: "var(--stop)" }}
                            onClick={() => remove(p)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <div style={{ marginTop: 16 }}>
          {error && <div className="error">{error}</div>}
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>PAN {editing && <em style={{ fontWeight: 400 }}>— leave blank to keep the current one</em>}</span>
            <input value={pan} maxLength={10} placeholder="ABCDE1234F"
                   onChange={(e) => setPan(e.target.value.toUpperCase())} />
          </label>
          <div className="modal-actions">
            <button className="btn" onClick={() => { setAdding(false); setEditing(null); }}>Cancel</button>
            <button className="btn primary" onClick={save}>{editing ? "Save changes" : "Add person"}</button>
          </div>
        </div>
      ) : (
        <div className="modal-actions">
          <button className="btn" onClick={startAdd}>+ Add person</button>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      )}
    </Modal>
  );
}
