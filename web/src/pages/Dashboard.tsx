import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ApplyModal } from "../components/ApplyModal";
import { IpoTable } from "../components/IpoTable";
import { Lookup } from "../components/Lookup";
import { PeopleModal } from "../components/PeopleModal";
import { money } from "../components/bits";
import type { Applicant, Application, Ipo, PersonSummary } from "../types";

export function Dashboard() {
  const { user, logout } = useAuth();
  const [ipos, setIpos] = useState<Ipo[]>([]);
  const [people, setPeople] = useState<Applicant[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [summary, setSummary] = useState<PersonSummary[]>([]);
  const [showPeople, setShowPeople] = useState(false);
  const [applyTo, setApplyTo] = useState<Ipo | null>(null);
  const [filter, setFilter] = useState<"all" | "go" | "wait" | "stop">("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [i, p, a, s] = await Promise.all([
      api.get<{ ipos: Ipo[] }>("/ipos"),
      api.get<{ applicants: Applicant[] }>("/applicants"),
      api.get<{ applications: Application[] }>("/applications"),
      api.get<{ people: PersonSummary[] }>("/applications/summary/by-person"),
    ]);
    setIpos(i.ipos); setPeople(p.applicants); setApps(a.applications); setSummary(s.people);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const blocked = apps.reduce((s, a) => s + a.amount, 0);
  const shown = filter === "all" ? ipos : ipos.filter((i) => i.verdictTone === filter);

  async function record(app: Application, value: string) {
    await api.patch(`/applications/${app.id}`, { allotment: value });
    await load();
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div>
            <h1>IPO Watch</h1>
            <p className="sub">Multi-applicant tracker · Indian primary market</p>
          </div>
          <div className="right">
            <div>
              <div className="who">Money blocked across all applications</div>
              <div style={{ fontSize: 25, fontWeight: 750 }} className="num">{money(blocked)}</div>
              <div className="who">
                {apps.length} application{apps.length === 1 ? "" : "s"} · {people.length} {people.length === 1 ? "person" : "people"}
              </div>
            </div>
            <div>
              <div className="who" style={{ marginBottom: 6 }}>{user?.name}</div>
              <button className="btn small" onClick={() => void logout()}>Sign out</button>
            </div>
          </div>
        </div>
      </header>

      <div className="wrap">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {([["all", "All"], ["go", "Apply"], ["wait", "Wait / Watch"], ["stop", "Skip"]] as const).map(([k, label]) => (
            <button key={k} className={`btn small ${filter === k ? "primary" : ""}`} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
          <span style={{ marginLeft: "auto" }}>
            <button className="btn small" onClick={() => setShowPeople(true)}>Manage people</button>
          </span>
        </div>

        {loading ? (
          <div className="card empty">Loading…</div>
        ) : people.length === 0 ? (
          <div className="card empty">
            <p>Add the people you apply for to get started.</p>
            <button className="btn primary" onClick={() => setShowPeople(true)}>+ Add a person</button>
          </div>
        ) : null}

        {!loading && (
          <IpoTable ipos={shown} applications={apps}
                    onApply={setApplyTo} onRecord={record} />
        )}

        {summary.some((p) => p.ipos > 0) && (
          <>
            <div className="section"><h2>Contribution by person</h2>
              <span className="note">{summary.length} people</span></div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Person</th><th className="hide-sm">PAN</th><th className="r">In their name</th>
                    <th className="r">Blocked</th><th className="c">Allotted</th>
                    <th className="c">Not allotted</th><th className="c">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((p) => (
                    <tr key={p.id}>
                      <td className="name">{p.name}{p.isSelf && <span className="pill v-go" style={{ marginLeft: 7, fontSize: 9.5 }}>YOU</span>}</td>
                      <td className="pan num hide-sm">•••••{p.panLast4}</td>
                      <td className="r num">{p.ipos}</td>
                      <td className="r num" style={{ fontWeight: 700 }}>{money(p.blocked)}</td>
                      <td className="c num" style={{ color: "var(--go)", fontWeight: 700 }}>{p.allotted || "—"}</td>
                      <td className="c num" style={{ color: "var(--stop)", fontWeight: 700 }}>{p.notAllotted || "—"}</td>
                      <td className="c num" style={{ fontWeight: 700 }}>{p.pending || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <Lookup people={people} ipos={ipos} applications={apps} onChanged={load} />
      </div>

      {showPeople && (
        <PeopleModal people={people} onClose={() => setShowPeople(false)} onChanged={load} />
      )}
      {applyTo && (
        <ApplyModal ipo={applyTo} people={people}
                    existing={apps.filter((a) => a.ipoId === applyTo.id)}
                    onClose={() => setApplyTo(null)} onChanged={load} />
      )}
    </>
  );
}
