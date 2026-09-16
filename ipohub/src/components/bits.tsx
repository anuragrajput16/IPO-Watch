import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { Ipo } from "../types";
import { C, toneColors } from "../theme/theme";

/** Half steps are drawn as a clipped full star over an empty one. */
export function Stars({ value, size = 13 }: { value: number | null; size?: number }) {
  if (value === null) return <Text style={{ color: C.muted, fontSize: size }}>?</Text>;
  return (
    <View style={{ flexDirection: "row" }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const full = i <= value;
        const half = !full && i - 0.5 <= value;
        return (
          <View key={i} style={{ width: size, height: size * 1.2 }}>
            <Text style={{ fontSize: size, color: C.starOff, position: "absolute" }}>★</Text>
            {(full || half) && (
              <View style={{ width: half ? size / 2 : size, overflow: "hidden", position: "absolute" }}>
                <Text style={{ fontSize: size, color: C.star }}>★</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function Rank({ value }: { value: number | null }) {
  if (!value) return null;
  const medal = MEDALS[value];
  return (
    <Text style={{ fontSize: medal ? 14 : 11, fontWeight: "700", color: C.muted, marginRight: 5 }}>
      {medal ?? `#${value}`}
    </Text>
  );
}

export function Pill({ text, tone }: { text: string; tone: "go" | "wait" | "stop" | "none" }) {
  const c = toneColors(tone);
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 }}>
      <Text style={{ color: c.fg, fontSize: 11.5, fontWeight: "700" }}>{text}</Text>
    </View>
  );
}

export function ExpiredTag({ ipo }: { ipo: Ipo }) {
  if (!ipo.isExpired) return null;
  return (
    <View style={s.expired}>
      <Text style={{ color: C.muted, fontSize: 9, fontWeight: "700", letterSpacing: 0.3 }}>EXPIRED</Text>
    </View>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={s.center}>
      <ActivityIndicator color={C.accent} />
      <Text style={{ color: C.muted, marginTop: 10, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <View style={s.center}><Text style={{ color: C.muted, textAlign: "center" }}>{text}</Text></View>;
}

export function gmpText(ipo: Ipo): { text: string; sub: string | null; color: string } {
  if (ipo.gmpPct === null && ipo.gmpRupees === null)
    return { text: "TBD", sub: null, color: C.muted };
  return {
    text: `${ipo.gmpPct ?? 0}%`,
    sub: ipo.gmpRupees !== null ? `₹${ipo.gmpRupees}` : null,
    color: ipo.gmpPct ? C.go : C.muted,
  };
}

export function band(ipo: Ipo): string {
  if (ipo.priceMin === null || ipo.priceMax === null) return "TBD";
  return `₹${ipo.priceMin.toLocaleString("en-IN")}–${ipo.priceMax.toLocaleString("en-IN")}`;
}

/** "16–18 Sep", the window IPOs are grouped under. */
export function windowLabel(ipo: Ipo): string {
  if (!ipo.openDate || !ipo.closeDate) return "Dates TBD";
  const o = new Date(ipo.openDate + "T00:00:00");
  const c = new Date(ipo.closeDate + "T00:00:00");
  const mon = c.toLocaleDateString(undefined, { month: "short" });
  return o.getMonth() === c.getMonth()
    ? `${o.getDate()}–${c.getDate()} ${mon}`
    : `${o.getDate()} ${o.toLocaleDateString(undefined, { month: "short" })} – ${c.getDate()} ${mon}`;
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  expired: {
    backgroundColor: "#EDEFF3", borderRadius: 999,
    paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6,
  },
});
