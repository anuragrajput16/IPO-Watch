import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Applicant, Application, Ipo, Lookup as LookupT } from "../types";
import { money } from "./bits";

const TONE: Record<string, string> = {
  allotted: "v-go", not_allotted: "v-stop",
  unchecked: "v-wait", not_out_yet: "v-wait", not_applied: "v-none",
};
const HEAD: Record<string, string> = {
  allotted: "Allotted", not_allotted: "Not allotted", unchecked: "Not checked yet",
  not_out_yet: "Not out yet", not_applied: "Didn’t apply",
};

/** "Is this PAN allotted for this IPO?" — answered from what's been recorded. */
export function Lookup({ people, ipos, applications, onChanged }:
  { people: Applicant[]; ipos: Ipo[]; applications: Application[]; onChanged: () => void }) {
  const [pid, setPid] = useState("");
  const [ipoId, setIpoId] = useState("");
  const [res, setRes] = useState<LookupT | null>(null);

  // People and IPOs arrive a tick after the first render, so the pickers are seeded
  // here rather than in useState — and only when the current choice is no longer valid,
  // so a reload of the lists doesn't yank the selection out from under the user.
  useEffect(() => {
    if (!people.length || !ipos.length) return;
    const person = people.find((p) => p.id === pid) ?? people[0]!;
    setPid(person.id);
    setIpoId((cur) => {
      if (cur && ipos.some((i) => i.id === cur)) return cur;
      // Open on the thing actually worth looking at: their first closed IPO
      // whose result nobody has recorded.
      const mine = applications.filter((a) => a.applicantId === person.id);
      const unchecked = mine.find(
        (a) => a.allotment === "pending" && ipos.find((i) => i.id === a.ipoId)?.isExpired);
      return unchecked?.ipoId ?? mine[0]?.ipoId ?? ipos[0]!.id;
    });
  }, [people, ipos, applications, pid]);

  useEffect(() => {
    if (!pid || !ipoId) return;
    void api.get<LookupT>(`/applications/lookup/${pid}/${ipoId}`).then(setRes).catch(() => setRes(null));
  }, [pid, ipoId]);

  if (!people.length || !ipos.length) return null;
  const ipo = ipos.find((i) => i.id === ipoId);
  const person = people.find((p) => p.id === pid);

  async function record(value: string) {
    if (!res?.application || !value) return;
    await api.patch(`/applications/${res.application.id}`, { allotment: value });
    setRes(await api.get<LookupT>(`/applications/lookup/${pid}/${ipoId}`));
    onChanged();
  }

  const say = () => {
    if (!res || !ipo || !person) return null;
    const amt = res.application ? money(res.application.amount) : "";
    switch (res.state) {
      case "allotted":
        return <>Recorded as allotted for <b>{person.name}</b> — <b className="num">{amt}</b> applied.</>;
      case "not_allotted":
        return <>Recorded as not allotted for <b>{person.name}</b>. The blocked <b className="num">{amt}</b> should have been released.</>;
      case "unchecked":
        return <><b>{ipo.name}</b> has closed and <b>{person.name}</b> applied <b className="num">{amt}</b>, but the result isn’t recorded. Check it on the registrar site, then set it here.</>;
      case "not_out_yet":
        return <><b>{ipo.name}</b> is still open — applications close <b>{ipo.closeDate}</b>. Allotment is usually out about two working days later.</>;
      default:
        return <><b>{person.name}</b> has no application recorded for <b>{ipo.name}</b>.</>;
    }
  };

  return (
    <>
      <div className="section">
        <h2>Is it allotted?</h2>
        <span className="note">pick a PAN and an IPO</span>
      </div>
      <div className="card">
        <div className="lk-controls">
          <label className="field">
            <span>PAN</span>
            <select value={pid} onChange={(e) => setPid(e.target.value)}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name} · •••••{p.panLast4}</option>)}
            </select>
          </label>
          <label className="field">
            <span>IPO</span>
            <select value={ipoId} onChange={(e) => setIpoId(e.target.value)}>
              {ipos.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
        </div>
        {res && (
          <div className="lk-out">
            <span className={`lk-verdict pill ${TONE[res.state]}`}>{HEAD[res.state]}</span>
            <span className="lk-say">{say()}</span>
            {res.state === "unchecked" && (
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {ipo?.registrarUrl && (
                  <a className="btn small" href={ipo.registrarUrl} target="_blank" rel="noreferrer">
                    Check @ {ipo.registrarName} ↗
                  </a>
                )}
                <select style={{ width: "auto" }} defaultValue=""
                        onChange={(e) => record(e.target.value)}>
                  <option value="">Pending</option>
                  <option value="allotted">Allotted</option>
                  <option value="not_allotted">Not allotted</option>
                </select>
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}
