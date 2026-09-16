import React from "react";
import Ionicons from "react-native-vector-icons/Ionicons";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  createDrawerNavigator, DrawerContentScrollView, DrawerItemList,
  type DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "./auth/AuthContext";
import { AboutScreen } from "./screens/AboutScreen";
import { ApplicationsScreen } from "./screens/ApplicationsScreen";
import { IposScreen } from "./screens/IposScreen";
import { LookupScreen } from "./screens/LookupScreen";
import { PeopleScreen } from "./screens/PeopleScreen";
import { SummaryScreen } from "./screens/SummaryScreen";
import { C } from "./theme/theme";

const Tab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();

const ICONS: Record<string, string> = {
  IPOs: "trending-up-outline",
  Applications: "documents-outline",
  Allotment: "help-circle-outline",
  People: "people-outline",
};

/** The four day-to-day screens, reachable in one tap. */
function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route, navigation }) => ({
        headerStyle: { backgroundColor: C.dark },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
        // The drawer is the parent navigator, so the burger has to ask it to open.
        headerLeft: () => (
          <TouchableOpacity onPress={() => navigation.getParent()?.dispatch({ type: "OPEN_DRAWER" })}
                            style={{ paddingHorizontal: 16 }}>
            <Ionicons name="menu" size={23} color="#fff" />
          </TouchableOpacity>
        ),
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: { borderTopColor: C.line, backgroundColor: C.card, paddingTop: 6, height: 62 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginBottom: 6 },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name] ?? "ellipse-outline"} size={size} color={color} />
        ),
      })}
    >
      {/* `title` sets the header; `tabBarLabel` is set separately because the
          descriptive titles are far too wide for a four-tab bar. */}
      <Tab.Screen name="IPOs" component={IposScreen}
                  options={{ title: "IPO Hub", tabBarLabel: "IPOs" }} />
      <Tab.Screen name="Applications" component={ApplicationsScreen}
                  options={{ title: "My applications", tabBarLabel: "Applied" }} />
      <Tab.Screen name="Allotment" component={LookupScreen}
                  options={{ title: "Is it allotted?", tabBarLabel: "Allotment" }} />
      <Tab.Screen name="People" component={PeopleScreen}
                  options={{ title: "People & PANs", tabBarLabel: "People" }} />
    </Tab.Navigator>
  );
}

/** Drawer body: the standard items, plus who's signed in and a way out. */
function DrawerContent(props: DrawerContentComponentProps) {
  const { user, logout } = useAuth();
  return (
    <View style={{ flex: 1 }}>
      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
        <View style={s.header}>
          <Text style={s.brand}>IPO Hub</Text>
          <Text style={s.who}>{user?.name}</Text>
          <Text style={s.email}>{user?.email}</Text>
        </View>
        <View style={{ paddingTop: 8 }}>
          <DrawerItemList {...props} />
        </View>
      </DrawerContentScrollView>

      <TouchableOpacity style={s.signOut} onPress={() => void logout()}>
        <Ionicons name="log-out-outline" size={19} color={C.stop} />
        <Text style={s.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: C.bg, card: C.card, border: C.line, primary: C.accent },
};

export function Navigation() {
  return (
    <NavigationContainer theme={navTheme}>
      <Drawer.Navigator
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          headerShown: false,          // the tab navigator draws its own header
          drawerActiveTintColor: C.accent,
          drawerInactiveTintColor: C.text,
          drawerActiveBackgroundColor: "#EEF1F8",
          drawerLabelStyle: { fontSize: 14, fontWeight: "600", marginLeft: -12 },
        }}
      >
        <Drawer.Screen
          name="Home" component={Tabs}
          options={{
            title: "Dashboard",
            drawerIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
          }}
        />
        <Drawer.Screen
          name="Summary" component={SummaryScreen}
          options={{
            title: "Contribution by person", headerShown: true,
            headerStyle: { backgroundColor: C.dark }, headerTintColor: "#fff",
            drawerIcon: ({ color, size }) => <Ionicons name="pie-chart-outline" size={size} color={color} />,
          }}
        />
        <Drawer.Screen
          name="About" component={AboutScreen}
          options={{
            title: "About & account", headerShown: true,
            headerStyle: { backgroundColor: C.dark }, headerTintColor: "#fff",
            drawerIcon: ({ color, size }) => <Ionicons name="information-circle-outline" size={size} color={color} />,
          }}
        />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  header: { backgroundColor: C.dark, padding: 20, paddingTop: 54 },
  brand: { color: "#fff", fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  who: { color: "#fff", fontSize: 13.5, fontWeight: "600", marginTop: 12 },
  email: { color: "#9AA3B5", fontSize: 12, marginTop: 2 },
  signOut: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 18, paddingHorizontal: 20,
    borderTopWidth: 1, borderTopColor: C.line,
  },
  signOutText: { color: C.stop, fontWeight: "700", fontSize: 14 },
});
