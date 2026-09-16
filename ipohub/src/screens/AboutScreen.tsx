import React from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { C } from "../theme/theme";

export function AboutScreen() {
  const { user } = useAuth();
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16 }}>
      <View style={s.card}>
        <Text style={s.title}>Signed in</Text>
        <Text style={s.body}>{user?.name}</Text>
        <Text style={s.muted}>{user?.email} · {user?.role}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.title}>About IPO Hub</Text>
        <Text style={s.body}>
          A multi-applicant tracker for the Indian primary market. It records who applied
          for which IPO, how much of each person’s money is blocked, and what was allotted.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.title}>GMP is unofficial</Text>
        <Text style={s.body}>
          Grey-market premium is a rough sentiment signal, not a forecast, and sources
          disagree. Figures come from ipowatch.in via the API. None of this is financial advice.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.title}>Your PANs</Text>
        <Text style={s.body}>
          PANs are encrypted before storage and only your own session can read them back.
          The app keeps its sign-in token in the device keychain, never in plain storage.
        </Text>
      </View>

      <TouchableOpacity onPress={() => void Linking.openURL("https://www.bseindia.com/investors/appli_check.aspx")}>
        <Text style={s.link}>Check allotment on BSE ↗</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 13, borderWidth: 1, borderColor: C.line,
    padding: 16, marginBottom: 11,
  },
  title: { fontSize: 13, fontWeight: "800", color: C.text, marginBottom: 7 },
  body: { fontSize: 13, color: C.text, lineHeight: 20 },
  muted: { fontSize: 12, color: C.muted, marginTop: 3 },
  link: { color: C.accent, fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: 8 },
});
