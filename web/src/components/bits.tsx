import type { Ipo } from "../types";

export const money = (n: number | null | undefined) =>
  "₹" + (n ?? 0).toLocaleString("en-IN");

/** Ratings come in half steps, so the middle star is painted half-filled. */
export function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="qmark">?</span>;
  return (
    <span className="stars" title={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= value ? "star-on" : i - 0.5 <= value ? "star-half" : "star-off"}>★</span>
      ))}
    </span>
  );
}

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function Rank({ value }: { value: number | null }) {
  if (!value) return null;
  const medal = MEDALS[value];
  return (
    <span className={medal ? "rank top" : "rank"} title={`Rank ${value}`}>
      {medal ?? `#${value}`}
    </span>
  );
}

export function Expired({ ipo }: { ipo: Ipo }) {
  if (!ipo.isExpired) return null;
  const when = ipo.closeDate
    ? new Date(ipo.closeDate + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : "";
  return <span className="expired" title={`Applications closed ${when} — allotment only`}>Expired</span>;
}

export function Gmp({ ipo }: { ipo: Ipo }) {
  if (ipo.gmpPct === null && ipo.gmpRupees === null)
    return <span className="gmp tbd num">TBD</span>;
  const cls = !ipo.gmpPct ? "zero" : "pos";
  return (
    <>
      <span className={`gmp ${cls} num`}>{ipo.gmpPct ?? 0}%</span>
      {ipo.gmpRupees !== null && <div className="sub-amt num">₹{ipo.gmpRupees}</div>}
    </>
  );
}

export function band(ipo: Ipo): string {
  if (ipo.priceMin === null || ipo.priceMax === null) return "TBD";
  return `₹${ipo.priceMin.toLocaleString("en-IN")}–${ipo.priceMax.toLocaleString("en-IN")}`;
}

/** "16–18 Sep" — the window label the IPOs are grouped under. */
export function windowLabel(ipo: Ipo): string {
  if (!ipo.openDate || !ipo.closeDate) return "Dates TBD";
  const o = new Date(ipo.openDate + "T00:00:00");
  const c = new Date(ipo.closeDate + "T00:00:00");
  const mon = c.toLocaleDateString(undefined, { month: "short" });
  return o.getMonth() === c.getMonth()
    ? `${o.getDate()}–${c.getDate()} ${mon}`
    : `${o.getDate()} ${o.toLocaleDateString(undefined, { month: "short" })} – ${c.getDate()} ${mon}`;
}

export function Modal({ title, lead, onClose, children }:
  { title: string; lead?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
    </div>
  );
}
