import "react-native-gesture-handler";   // must be first — the drawer depends on it
import React from "react";
import { StatusBar, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { Loading } from "./src/components/bits";
import { Navigation } from "./src/Navigation";
import { LoginScreen } from "./src/screens/LoginScreen";
import { C } from "./src/theme/theme";

function Gate() {
  const { user, booting } = useAuth();
  if (booting)
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Loading label="Restoring your session…" />
      </View>
    );
  return user ? <Navigation /> : <LoginScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
