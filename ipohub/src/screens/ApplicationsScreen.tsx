import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";
import { Empty, Loading, Pill } from "../components/bits";
import { C, money } from "../theme/theme";
import type { Allotment, Application, Ipo } from "../types";

const LABEL: Record<Allotment, string> = {
  pending: "Pending", allotted: "Allotted", not_allotted: "Not allotted",
};
const TONE: Record<Allotment, "go" | "wait" | "stop"> = {
  pending: "wait", allotted: "go", not_allotted: "stop",
};

export function ApplicationsScreen() {
  const [apps, setApps] = useState<Application[]>([]);
  const [ipos, setIpos] = useState<Ipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [a, i] = await Promise.all([
      api.get<{ applications: Application[] }>("/applications"),
      api.get<{ ipos: Ipo[] }>("/ipos"),
    ]);
    setApps(a.applications); setIpos(i.ipos); setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function setAllotment(app: Application, value: Allotment) {
    await api.patch(`/applications/${app.id}`, { allotment: value });
    await load();
  }

  function record(app: Application) {
    const ipo = ipos.find((i) => i.id === app.ipoId);
    if (!ipo?.isExpired) {
      Alert.alert("Not out yet", `${app.ipoName} is still open. Allotment comes about two working days after it closes.`);
      return;
    }
    Alert.alert(`${app.ipoName} · ${app.applicantName}`, "What was the result?", [
      { text: "Allotted", onPress: () => void setAllotment(app, "allotted") },
      { text: "Not allotted", onPress: () => void setAllotment(app, "not_allotted") },
      { text: "Still pending", onPress: () => void setAllotment(app, "pending") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  if (loading) return <Loading />;
  if (!apps.length)
    return <Empty text="No applications recorded yet.\n\nOpen an IPO and tap Apply to add one." />;

  const blocked = apps.reduce((t, a) => t + a.amount, 0);
  const pending = apps.filter((a) => a.allotment === "pending").length;

  return (
    <ScrollView
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 14, paddingBottom: 34 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
        setRefreshing(true); await load(); setRefreshing(false);
      }} />}
    >
      <View style={s.summary}>
        <View>
          <Text style={s.summaryLabel}>Money blocked</Text>
          <Text style={s.summaryValue}>{money(blocked)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.summaryLabel}>{apps.length} application{apps.length === 1 ? "" : "s"}</Text>
          <Text style={s.summarySub}>{pending} awaiting a result</Text>
        </View>
      </View>

      {apps.map((a) => {
        const ipo = ipos.find((i) => i.id === a.ipoId);
        return (
          <TouchableOpacity key={a.id} style={s.card} activeOpacity={0.7} onPress={() => record(a)}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{a.ipoName}</Text>
                <Text style={s.who}>
                  {a.applicantName} · •••••{a.applicantPanLast4}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={s.amount}>{money(a.amount)}</Text>
                <Pill
                  text={ipo && !ipo.isExpired && a.allotment === "pending" ? "Not out yet" : LABEL[a.allotment]}
                  tone={ipo && !ipo.isExpired && a.allotment === "pending" ? "none" : TONE[a.allotment]}
                />
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      <Text style={s.hint}>Tap an application to record its allotment result.</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  summary: {
    backgroundColor: C.dark, borderRadius: 13, padding: 16, marginBottom: 14,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  summaryLabel: { color: "#9AA3B5", fontSize: 11.5, fontWeight: "600" },
  summaryValue: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 3 },
  summarySub: { color: "#9AA3B5", fontSize: 11.5, marginTop: 5 },
  card: {
    backgroundColor: C.card, borderRadius: 13, borderWidth: 1, borderColor: C.line,
    padding: 14, marginBottom: 9,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontSize: 15, fontWeight: "700", color: C.text },
  who: { fontSize: 12, color: C.muted, marginTop: 3 },
  amount: { fontSize: 15, fontWeight: "700", color: C.text },
  hint: { color: C.muted, fontSize: 12, textAlign: "center", marginTop: 8 },
});
