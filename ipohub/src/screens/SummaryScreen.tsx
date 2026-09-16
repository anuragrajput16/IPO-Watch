import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { Empty, Loading } from "../components/bits";
import { C, money } from "../theme/theme";
import type { PersonSummary } from "../types";

export function SummaryScreen() {
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setPeople((await api.get<{ people: PersonSummary[] }>("/applications/summary/by-person")).people);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) return <Loading />;
  if (!people.some((p) => p.ipos > 0)) return <Empty text="Nothing recorded yet." />;

  const total = people.reduce((t, p) => t + p.blocked, 0);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 14, paddingBottom: 34 }}>
      <View style={s.total}>
        <Text style={s.totalLabel}>Blocked across everyone</Text>
        <Text style={s.totalValue}>{money(total)}</Text>
      </View>

      {people.map((p) => (
        <View key={p.id} style={s.card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Text style={s.name}>{p.name}</Text>
            {p.isSelf && <View style={s.youTag}><Text style={s.youText}>YOU</Text></View>}
            <Text style={s.pan}>•••••{p.panLast4}</Text>
          </View>

          <View style={s.stats}>
            <Stat label="IPOs" value={String(p.ipos)} />
            <Stat label="Blocked" value={money(p.blocked)} />
            <Stat label="Allotted" value={p.allotted ? String(p.allotted) : "—"} color={C.go} />
            <Stat label="Not allotted" value={p.notAllotted ? String(p.notAllotted) : "—"} color={C.stop} />
            <Stat label="Pending" value={p.pending ? String(p.pending) : "—"} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ minWidth: 72 }}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  total: { backgroundColor: C.dark, borderRadius: 13, padding: 18, marginBottom: 14 },
  totalLabel: { color: "#9AA3B5", fontSize: 11.5, fontWeight: "600" },
  totalValue: { color: "#fff", fontSize: 27, fontWeight: "800", marginTop: 4 },
  card: {
    backgroundColor: C.card, borderRadius: 13, borderWidth: 1, borderColor: C.line,
    padding: 15, marginBottom: 10,
  },
  name: { fontSize: 15, fontWeight: "700", color: C.text },
  pan: { fontSize: 11.5, color: C.muted, letterSpacing: 0.5 },
  youTag: { backgroundColor: C.goSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  youText: { color: C.go, fontSize: 9, fontWeight: "800" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 13 },
  statLabel: { fontSize: 10.5, color: C.muted, fontWeight: "600" },
  statValue: { fontSize: 15, fontWeight: "700", color: C.text, marginTop: 3 },
});
