export type Role = "user" | "admin";
export type User = { id: string; email: string; name: string; role: Role };

export type Ipo = {
  id: string; name: string; slug: string;
  openDate: string | null; closeDate: string | null;
  priceMin: number | null; priceMax: number | null;
  lotAmount: number | null; retailQuota: string | null; quotaIndicative: boolean;
  rank: number | null;
  fundamentals: number | null; valuation: number | null;
  longTerm: number | null; listing: number | null;
  verdict: string; verdictTone: "go" | "wait" | "stop";
  registrarName: string | null; registrarUrl: string | null;
  scrapeKey: string | null;
  gmpPct: number | null; gmpRupees: number | null; gmpAt: string | null;
  isExpired: boolean;
};

export type Applicant = {
  id: string; name: string; panLast4: string; pan: string | null;
  isSelf: boolean; createdAt: string;
};

export type Allotment = "pending" | "allotted" | "not_allotted";

export type Application = {
  id: string; ipoId: string; ipoName: string;
  applicantId: string; applicantName: string; applicantPanLast4: string;
  amount: number; allotment: Allotment; allotmentAt: string | null;
  funders: { applicantId: string; name: string; amount: number }[];
};

export type LookupState = "not_applied" | "not_out_yet" | "allotted" | "not_allotted" | "unchecked";
export type Lookup = {
  state: LookupState;
  ipo: { id: string; name: string; closeDate: string | null; isExpired: boolean };
  applicant: { id: string; name: string };
  application: Application | null;
};

export type PersonSummary = {
  id: string; name: string; panLast4: string; isSelf: boolean;
  ipos: number; blocked: number; allotted: number; notAllotted: number; pending: number;
};
