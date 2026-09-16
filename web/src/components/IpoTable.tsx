import type { Applicant, Application, Ipo } from "../types";
import { Expired, Gmp, Rank, Stars, band, money, windowLabel } from "./bits";

/** IPOs grouped by their application window, newest batch last — same as the original page. */
export function IpoTable({ ipos, applications, onApply, onRecord }: {
  ipos: Ipo[];
  applications: Application[];
  onApply: (ipo: Ipo) => void;
  onRecord: (app: Application, value: string) => void;
}) {
  const groups = new Map<string, Ipo[]>();
  for (const ipo of ipos) {
    const key = windowLabel(ipo);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(ipo);
  }

  return (
    <>
      {[...groups].map(([label, rows]) => {
        const expired = rows[0]?.isExpired ?? false;
        const applied = applications.filter((a) => rows.some((r) => r.id === a.ipoId));
        const total = applied.reduce((s, a) => s + a.amount, 0);
        const potential = rows.reduce((s, r) => s + (r.lotAmount ?? 0), 0);

        return (
          <div key={label}>
            <div className="section">
              <h2>{label}</h2>
              <span className="note">{rows.length} {expired ? "expired" : "live"}</span>
              <span className="right">
                applied <b className="num" style={{ color: "var(--text)" }}>{money(total)}</b>
                {!expired && <> of {money(potential)} if all apply once</>}
              </span>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th className="c">Applied</th>
                    <th>IPO</th>
                    <th className="r">GMP&nbsp;%</th>
                    <th className="r hide-sm">Price band</th>
                    <th className="r">1 lot&nbsp;₹</th>
                    <th className="c hide-sm" title="Retail quota">Quota</th>
                    <th className="c hide-sm" title="Fundamentals">Fund.</th>
                    <th className="c hide-sm" title="Valuation">Val.</th>
                    <th className="c hide-sm" title="Long-term potential">Long</th>
                    <th className="c hide-sm" title="Listing potential">List.</th>
                    <th>Verdict</th>
                    <th className="c">Allotment</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((ipo) => {
                    const mine = applications.filter((a) => a.ipoId === ipo.id);
                    const sum = mine.reduce((s, a) => s + a.amount, 0);
                    return (
                      <tr key={ipo.id}>
                        <td className="c">
                          <button className="btn small" onClick={() => onApply(ipo)}
                                  title={mine.length ? mine.map((m) => m.applicantName).join(", ") : "Choose who is applying"}>
                            {mine.length ? `${mine.length} ▾` : ipo.isExpired ? "+ Late" : "+ Apply"}
                          </button>
                          {sum > 0 && <div className="sub-amt num">{money(sum)}</div>}
                        </td>
                        <td className="name">
                          <Rank value={ipo.rank} />{ipo.name}<Expired ipo={ipo} />
                        </td>
                        <td className="r"><Gmp ipo={ipo} /></td>
                        <td className="r num hide-sm">{band(ipo)}</td>
                        <td className="r num">{ipo.lotAmount ? money(ipo.lotAmount) : <span className="qmark">TBD</span>}</td>
                        <td className="c hide-sm">{ipo.retailQuota}{ipo.quotaIndicative && "*"}</td>
                        <td className="c hide-sm"><Stars value={ipo.fundamentals} /></td>
                        <td className="c hide-sm"><Stars value={ipo.valuation} /></td>
                        <td className="c hide-sm"><Stars value={ipo.longTerm} /></td>
                        <td className="c hide-sm"><Stars value={ipo.listing} /></td>
                        <td><span className={`pill v-${ipo.verdictTone}`}>{ipo.verdict}</span></td>
                        <td className="c">
                          {!mine.length ? <span className="qmark">—</span>
                            : !ipo.isExpired ? <span className="qmark">Not out yet</span>
                            : mine.map((a) => (
                                <div key={a.id} style={{ marginBottom: 3 }}>
                                  <select className="num" style={{ width: "auto", fontSize: 11.5, padding: "3px 7px" }}
                                          value={a.allotment} onChange={(e) => onRecord(a, e.target.value)}
                                          title={a.applicantName}>
                                    <option value="pending">Pending</option>
                                    <option value="allotted">Allotted</option>
                                    <option value="not_allotted">Not allotted</option>
                                  </select>
                                </div>
                              ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}
