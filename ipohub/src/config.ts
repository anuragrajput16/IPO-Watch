import { Platform } from "react-native";

/**
 * Where the API lives.
 *
 * A simulator can reach the host machine on localhost, but a physical device
 * cannot — point LAN_API at your machine's IP (`ipconfig getifaddr en0`) or at
 * the deployed API before running on hardware.
 */
const LOCAL_API = Platform.select({
  ios: "http://localhost:4000/api",
  // The Android emulator reaches the host through this alias, not localhost.
  android: "http://10.0.2.2:4000/api",
  default: "http://localhost:4000/api",
})!;

const LAN_API = ""; // e.g. "http://192.168.1.20:4000/api"

export const API_URL = LAN_API || LOCAL_API;
