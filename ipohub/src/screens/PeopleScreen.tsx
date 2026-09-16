import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { api, ApiError } from "../api/client";
import { Empty, Loading } from "../components/bits";
import { C } from "../theme/theme";
import type { Applicant } from "../types";

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function PeopleScreen() {
  const [people, setPeople] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Applicant | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [pan, setPan] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPeople((await api.get<{ applicants: Applicant[] }>("/applicants")).applicants);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function openForm(p: Applicant | null) {
    setEditing(p); setName(p?.name ?? ""); setPan(""); setError(null); setShowForm(true);
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Name is required");
    // Editing without retyping the PAN keeps the stored one.
    if (pan && !PAN_RE.test(pan)) return setError("PAN looks like ABCDE1234F");
    if (!editing && !pan) return setError("PAN is required");
    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (pan) body.pan = pan;
      if (!editing && people.length === 0) body.isSelf = true;
      if (editing) await api.patch(`/applicants/${editing.id}`, body);
      else await api.post("/applicants", body);
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    }
  }

  function remove(p: Applicant) {
    Alert.alert("Remove person", `Remove ${p.name}? Their applications go too.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => { await api.del(`/applicants/${p.id}`); await load(); },
      },
    ]);
  }

  if (loading) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 90 }}>
        {people.length === 0 && <Empty text="Nobody added yet.\n\nAdd the people you apply for — each applies with their own PAN." />}

        {people.map((p) => (
          <View key={p.id} style={s.card}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Text style={s.name}>{p.name}</Text>
                {p.isSelf && (
                  <View style={s.youTag}><Text style={s.youText}>YOU</Text></View>
                )}
              </View>
              <Text style={s.pan}>•••••{p.panLast4}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 14 }}>
              <TouchableOpacity onPress={() => openForm(p)}>
                <Text style={s.action}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(p)}>
                <Text style={[s.action, { color: C.stop }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <Text style={s.note}>
          PANs are encrypted before they’re stored, and only your own session can read them back.
        </Text>
      </ScrollView>

      <TouchableOpacity style={s.fab} onPress={() => openForm(null)}>
        <Text style={s.fabText}>+  Add person</Text>
      </TouchableOpacity>

      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{editing ? `Edit ${editing.name}` : "Add a person"}</Text>
            {error && <View style={s.error}><Text style={s.errorText}>{error}</Text></View>}

            <Text style={s.label}>Name</Text>
            <TextInput style={s.input} value={name} onChangeText={setName} autoCapitalize="words" />

            <Text style={s.label}>
              PAN{editing ? "  (leave blank to keep the current one)" : ""}
            </Text>
            <TextInput style={s.input} value={pan} maxLength={10} placeholder="ABCDE1234F"
                       autoCapitalize="characters" autoCorrect={false}
                       onChangeText={(t) => setPan(t.toUpperCase())} />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => setShowForm(false)}>
                <Text style={s.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={save}>
                <Text style={s.btnPrimaryText}>{editing ? "Save" : "Add"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 13, borderWidth: 1, borderColor: C.line,
    padding: 14, marginBottom: 9, flexDirection: "row", alignItems: "center", gap: 10,
  },
  name: { fontSize: 15, fontWeight: "700", color: C.text },
  pan: { fontSize: 12, color: C.muted, marginTop: 3, letterSpacing: 0.5 },
  youTag: { backgroundColor: C.goSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  youText: { color: C.go, fontSize: 9, fontWeight: "800" },
  action: { color: C.accent, fontWeight: "700", fontSize: 12.5 },
  note: { color: C.muted, fontSize: 11.5, lineHeight: 17, textAlign: "center", marginTop: 14 },
  fab: {
    position: "absolute", left: 16, right: 16, bottom: 20,
    backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: "center",
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  overlay: { flex: 1, backgroundColor: "rgba(16,20,28,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 22, paddingBottom: 34 },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: C.text, marginBottom: 6 },
  label: { fontSize: 11.5, fontWeight: "700", color: "#4A5160", marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 11, fontSize: 15, color: C.text,
  },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  btnGhost: { borderWidth: 1, borderColor: C.line },
  btnGhostText: { color: C.text, fontWeight: "700", fontSize: 14 },
  btnPrimary: { backgroundColor: C.accent },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  error: { backgroundColor: C.stopSoft, borderRadius: 10, padding: 11, marginTop: 12 },
  errorText: { color: C.stop, fontSize: 12.5 },
});
