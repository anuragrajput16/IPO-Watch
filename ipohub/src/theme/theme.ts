// Same palette as the web dashboard, so the two read as one product.
export const C = {
  bg: "#F4F6F9",
  card: "#FFFFFF",
  line: "#E3E7EE",
  text: "#151B26",
  muted: "#7C859B",
  go: "#16794C",
  goSoft: "#E2F4EA",
  wait: "#9A6B12",
  waitSoft: "#FDF2DC",
  stop: "#B3261E",
  stopSoft: "#FBE7E6",
  accent: "#2F56D3",
  dark: "#12161F",
  star: "#E8A33D",
  starOff: "#D5D9E0",
} as const;

export const money = (n: number | null | undefined) =>
  "₹" + (n ?? 0).toLocaleString("en-IN");

export const toneColors = (tone: "go" | "wait" | "stop" | "none") =>
  tone === "go" ? { bg: C.goSoft, fg: C.go }
  : tone === "stop" ? { bg: C.stopSoft, fg: C.stop }
  : tone === "wait" ? { bg: C.waitSoft, fg: C.wait }
  : { bg: "#EDEFF3", fg: C.muted };
