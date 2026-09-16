import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";
import { Empty, Loading, Pill } from "../components/bits";
import { C, money } from "../theme/theme";
import type { Applicant, Application, Ipo, Lookup, LookupState } from "../types";

const HEAD: Record<LookupState, string> = {
  allotted: "Allotted", not_allotted: "Not allotted", unchecked: "Not checked yet",
  not_out_yet: "Not out yet", not_applied: "Didn’t apply",
};
const TONE: Record<LookupState, "go" | "wait" | "stop" | "none"> = {
  allotted: "go", not_allotted: "stop", unchecked: "wait",
  not_out_yet: "wait", not_applied: "none",
};

export function LookupScreen() {
  const [people, setPeople] = useState<Applicant[]>([]);
  const [ipos, setIpos] = useState<Ipo[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [pid, setPid] = useState("");
  const [ipoId, setIpoId] = useState("");
  const [res, setRes] = useState<Lookup | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, i, a] = await Promise.all([
      api.get<{ applicants: Applicant[] }>("/applicants"),
      api.get<{ ipos: Ipo[] }>("/ipos"),
      api.get<{ applications: Application[] }>("/applications"),
    ]);
    setPeople(p.applicants); setIpos(i.ipos); setApps(a.applications); setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Seed the pickers once data arrives, opening on the pair worth looking at:
  // the first closed IPO whose result nobody has recorded.
  useEffect(() => {
    if (!people.length || !ipos.length) return;
    const person = people.find((p) => p.id === pid) ?? people[0]!;
    setPid(person.id);
    setIpoId((cur) => {
      if (cur && ipos.some((i) => i.id === cur)) return cur;
      const mine = apps.filter((a) => a.applicantId === person.id);
      const unchecked = mine.find(
        (a) => a.allotment === "pending" && ipos.find((i) => i.id === a.ipoId)?.isExpired);
      return unchecked?.ipoId ?? mine[0]?.ipoId ?? ipos[0]!.id;
    });
  }, [people, ipos, apps, pid]);

  useEffect(() => {
    if (!pid || !ipoId) return;
    void api.get<Lookup>(`/applications/lookup/${pid}/${ipoId}`).then(setRes).catch(() => setRes(null));
  }, [pid, ipoId]);

  if (loading) return <Loading />;
  if (!people.length) return <Empty text="Add a person on the People tab first." />;

  const ipo = ipos.find((i) => i.id === ipoId);
  const person = people.find((p) => p.id === pid);

  const say = () => {
    if (!res || !ipo || !person) return "";
    const amt = res.application ? money(res.application.amount) : "";
    switch (res.state) {
      case "allotted": return `Recorded as allotted for ${person.name} — ${amt} applied.`;
      case "not_allotted": return `Recorded as not allotted. The blocked ${amt} should have been released.`;
      case "unchecked": return `${ipo.name} has closed and ${person.name} applied ${amt}, but the result isn’t recorded yet.`;
      case "not_out_yet": return `${ipo.name} is still open — it closes ${ipo.closeDate}. Allotment is usually out about two working days later.`;
      default: return `${person.name} has no application recorded for ${ipo.name}.`;
    }
  };

  async function record(value: "allotted" | "not_allotted") {
    if (!res?.application) return;
    await api.patch(`/applications/${res.application.id}`, { allotment: value });
    setRes(await api.get<Lookup>(`/applications/lookup/${pid}/${ipoId}`));
    await load();
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 14, paddingBottom: 34 }}>
      <Text style={s.section}>PAN</Text>
      <View style={s.pickRow}>
        {people.map((p) => (
          <TouchableOpacity key={p.id} onPress={() => setPid(p.id)}
                            style={[s.chip, pid === p.id && s.chipOn]}>
            <Text style={[s.chipText, pid === p.id && { color: "#fff" }]}>
              {p.name} · •••••{p.panLast4}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.section}>IPO</Text>
      <View style={s.pickRow}>
        {ipos.map((i) => (
          <TouchableOpacity key={i.id} onPress={() => setIpoId(i.id)}
                            style={[s.chip, ipoId === i.id && s.chipOn]}>
            <Text style={[s.chipText, ipoId === i.id && { color: "#fff" }]}>{i.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {res && (
        <View style={s.result}>
          <Pill text={HEAD[res.state]} tone={TONE[res.state]} />
          <Text style={s.say}>{say()}</Text>

          {res.state === "unchecked" && (
            <View style={{ gap: 9, marginTop: 4 }}>
              {ipo?.registrarUrl && (
                <TouchableOpacity style={s.linkBtn} onPress={() => void Linking.openURL(ipo.registrarUrl!)}>
                  <Text style={s.linkBtnText}>Check at {ipo.registrarName} ↗</Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: "row", gap: 9 }}>
                <TouchableOpacity style={[s.recBtn, { backgroundColor: C.goSoft }]}
                                  onPress={() => void record("allotted")}>
                  <Text style={[s.recText, { color: C.go }]}>Allotted</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.recBtn, { backgroundColor: C.stopSoft }]}
                                  onPress={() => void record("not_allotted")}>
                  <Text style={[s.recText, { color: C.stop }]}>Not allotted</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      <Text style={s.note}>
        Registrars have no public API and their status pages sit behind a CAPTCHA, so this
        shows what you’ve recorded — it can’t fetch the result for you.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  section: { fontSize: 11.5, fontWeight: "700", color: "#4A5160", marginBottom: 8, marginTop: 6 },
  pickRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 12 },
  chip: {
    borderWidth: 1, borderColor: C.line, backgroundColor: C.card,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
  },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontSize: 12, fontWeight: "600", color: C.text },
  result: {
    backgroundColor: C.card, borderRadius: 13, borderWidth: 1, borderColor: C.line,
    padding: 16, gap: 11, marginTop: 6, alignItems: "flex-start",
  },
  say: { fontSize: 13, color: C.muted, lineHeight: 19 },
  linkBtn: {
    borderWidth: 1, borderColor: C.line, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14, alignSelf: "flex-start",
  },
  linkBtnText: { color: C.accent, fontWeight: "700", fontSize: 12.5 },
  recBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18 },
  recText: { fontWeight: "700", fontSize: 12.5 },
  note: { color: C.muted, fontSize: 11.5, lineHeight: 17, marginTop: 16, textAlign: "center" },
});
