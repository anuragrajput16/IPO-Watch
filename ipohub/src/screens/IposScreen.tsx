import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { api } from "../api/client";
import { Empty, ExpiredTag, Loading, Pill, Rank, Stars, band, gmpText, windowLabel } from "../components/bits";
import { C, money } from "../theme/theme";
import type { Application, Ipo } from "../types";

const FILTERS = [
  ["all", "All"], ["go", "Apply"], ["wait", "Watch"], ["stop", "Skip"],
] as const;

export function IposScreen() {
  const [ipos, setIpos] = useState<Ipo[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [i, a] = await Promise.all([
      api.get<{ ipos: Ipo[] }>("/ipos"),
      api.get<{ applications: Application[] }>("/applications"),
    ]);
    setIpos(i.ipos); setApps(a.applications); setLoading(false);
  }, []);

  // Reload whenever the tab regains focus, so applying on another tab shows here.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) return <Loading />;

  const shown = filter === "all" ? ipos : ipos.filter((i) => i.verdictTone === filter);
  const groups = new Map<string, Ipo[]>();
  for (const ipo of shown) {
    const k = windowLabel(ipo);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(ipo);
  }

  return (
    <ScrollView
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 14, paddingBottom: 34 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={async () => {
          setRefreshing(true); await load(); setRefreshing(false);
        }} />
      }
    >
      <View style={s.filters}>
        {FILTERS.map(([k, label]) => (
          <TouchableOpacity key={k} onPress={() => setFilter(k)}
                            style={[s.chip, filter === k && s.chipOn]}>
            <Text style={[s.chipText, filter === k && { color: "#fff" }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {shown.length === 0 && <Empty text="No IPOs match this filter." />}

      {[...groups].map(([label, rows]) => {
        const expired = rows[0]?.isExpired ?? false;
        return (
          <View key={label} style={{ marginBottom: 18 }}>
            <View style={s.groupHead}>
              <Text style={s.groupTitle}>{label}</Text>
              <Text style={s.groupNote}>{rows.length} {expired ? "expired" : "live"}</Text>
            </View>

            {rows.map((ipo) => {
              const mine = apps.filter((a) => a.ipoId === ipo.id);
              const g = gmpText(ipo);
              const isOpen = open === ipo.id;
              return (
                <TouchableOpacity key={ipo.id} activeOpacity={0.7} style={s.card}
                                  onPress={() => setOpen(isOpen ? null : ipo.id)}>
                  <View style={s.rowTop}>
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                      <Rank value={ipo.rank} />
                      <Text style={s.name}>{ipo.name}</Text>
                      <ExpiredTag ipo={ipo} />
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[s.gmp, { color: g.color }]}>{g.text}</Text>
                      {g.sub && <Text style={s.gmpSub}>{g.sub}</Text>}
                    </View>
                  </View>

                  <View style={s.rowMeta}>
                    <Text style={s.meta}>{band(ipo)}</Text>
                    <Text style={s.metaDot}>·</Text>
                    <Text style={s.meta}>
                      1 lot {ipo.lotAmount ? money(ipo.lotAmount) : "TBD"}
                    </Text>
                    <Text style={s.metaDot}>·</Text>
                    <Text style={s.meta}>
                      {ipo.retailQuota}{ipo.quotaIndicative ? "*" : ""} retail
                    </Text>
                  </View>

                  <View style={s.rowBottom}>
                    <Pill text={ipo.verdict} tone={ipo.verdictTone} />
                    {mine.length > 0 && (
                      <View style={s.appliedTag}>
                        <Text style={s.appliedText}>
                          {mine.length} applied · {money(mine.reduce((t, a) => t + a.amount, 0))}
                        </Text>
                      </View>
                    )}
                  </View>

                  {isOpen && (
                    <View style={s.detail}>
                      {([["Fundamentals", ipo.fundamentals], ["Valuation", ipo.valuation],
                         ["Long-term", ipo.longTerm], ["Listing", ipo.listing]] as const).map(([label, v]) => (
                        <View key={label} style={s.detailRow}>
                          <Text style={s.detailLabel}>{label}</Text>
                          <Stars value={v} />
                        </View>
                      ))}
                      {ipo.registrarName && (
                        <View style={s.detailRow}>
                          <Text style={s.detailLabel}>Registrar</Text>
                          <Text style={s.detailValue}>{ipo.registrarName}</Text>
                        </View>
                      )}
                      <View style={s.detailRow}>
                        <Text style={s.detailLabel}>Window</Text>
                        <Text style={s.detailValue}>{ipo.openDate} → {ipo.closeDate}</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  filters: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  chip: {
    borderWidth: 1, borderColor: C.line, backgroundColor: C.card,
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7,
  },
  chipOn: { backgroundColor: C.text, borderColor: C.text },
  chipText: { fontSize: 12.5, fontWeight: "700", color: C.text },
  groupHead: { flexDirection: "row", alignItems: "baseline", gap: 9, marginBottom: 8, marginTop: 4 },
  groupTitle: { fontSize: 14, fontWeight: "700", color: C.text },
  groupNote: { fontSize: 12, color: C.muted },
  card: {
    backgroundColor: C.card, borderRadius: 13, borderWidth: 1, borderColor: C.line,
    padding: 14, marginBottom: 9,
  },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  name: { fontSize: 15, fontWeight: "700", color: C.text },
  gmp: { fontSize: 15, fontWeight: "800" },
  gmpSub: { fontSize: 11, fontWeight: "600", color: C.muted, marginTop: 1 },
  rowMeta: { flexDirection: "row", alignItems: "center", marginTop: 7, flexWrap: "wrap" },
  meta: { fontSize: 12, color: C.muted },
  metaDot: { fontSize: 12, color: C.muted, marginHorizontal: 6 },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 11 },
  appliedTag: { backgroundColor: "#EEF1F8", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  appliedText: { fontSize: 11, fontWeight: "700", color: C.accent },
  detail: { marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, gap: 8 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailLabel: { fontSize: 12.5, color: C.muted },
  detailValue: { fontSize: 12.5, color: C.text, fontWeight: "600" },
});
