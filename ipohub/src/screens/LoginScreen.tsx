import React, { useState } from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useAuth } from "../auth/AuthContext";
import { C } from "../theme/theme";

export function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }}
                          behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.brand}>IPO Hub</Text>
          <Text style={s.lead}>
            {mode === "login" ? "Sign in to your tracker." : "Create an account to start tracking."}
          </Text>

          {error && <View style={s.error}><Text style={s.errorText}>{error}</Text></View>}

          {mode === "register" && (
            <>
              <Text style={s.label}>Your name</Text>
              <TextInput style={s.input} value={name} onChangeText={setName} autoCapitalize="words" />
            </>
          )}
          <Text style={s.label}>Email</Text>
          <TextInput style={s.input} value={email} onChangeText={setEmail}
                     autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Text style={s.label}>Password</Text>
          <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry />

          <TouchableOpacity style={[s.button, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
            <Text style={s.buttonText}>
              {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>
            <Text style={s.swap}>
              {mode === "login" ? "No account yet? Create one" : "Already registered? Sign in"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: "center", padding: 22 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.line },
  brand: { fontSize: 24, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  lead: { color: C.muted, fontSize: 13, marginTop: 4, marginBottom: 20 },
  label: { fontSize: 11.5, fontWeight: "700", color: "#4A5160", marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 11, fontSize: 15, color: C.text, backgroundColor: "#fff",
  },
  button: {
    backgroundColor: C.accent, borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 22,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  swap: { color: C.accent, textAlign: "center", marginTop: 16, fontSize: 13, fontWeight: "600" },
  error: {
    backgroundColor: C.stopSoft, borderColor: "#F0CFCD", borderWidth: 1,
    borderRadius: 10, padding: 11, marginTop: 14,
  },
  errorText: { color: C.stop, fontSize: 12.5 },
});
