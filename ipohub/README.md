# IPO Hub — React Native (CLI)

The IPO tracker as a native app. Same backend, same API, same data as the web
dashboard — bottom tabs for the day-to-day screens, a drawer for everything else.

Built with the React Native CLI (not Expo): RN 0.87, React 19, TypeScript.

```
Drawer
├─ Dashboard ──────── Bottom tabs
│                     ├─ IPOs        the list, grouped by window
│                     ├─ Applied     your applications + record allotment
│                     ├─ Allotment   "is this PAN allotted for this IPO?"
│                     └─ People      PANs you apply for
├─ Contribution by person
└─ About & account  (+ Sign out)
```

## Running it

The API must be running first — see the repo root:

```bash
docker compose up -d
cd backend && npm run dev          # :4000
```

Then:

```bash
cd ipohub
npm install
cd ios && bundle install && bundle exec pod install && cd ..   # iOS only, first time
npm start                          # Metro, in its own terminal
npm run ios                        # or: npm run android
```

**Disk space:** a first iOS build needs several GB for Pods and DerivedData.

### Pointing at the API

[src/config.ts](src/config.ts) resolves the base URL per platform:

| Target | URL |
|---|---|
| iOS simulator | `http://localhost:4000/api` |
| Android emulator | `http://10.0.2.2:4000/api` — the emulator's alias for your host |
| **Physical device** | set `LAN_API` to your machine's IP (`ipconfig getifaddr en0`) |

A phone on your wifi cannot reach the laptop's `localhost`, so `LAN_API` is not
optional on hardware. For a deployed API, put that URL there instead.

## How sign-in differs from the web app

The browser apps keep their refresh token in an httpOnly cookie, which JavaScript
can't read — that's the point of it. React Native has no such cookie, so the app
sends `X-Client: mobile` and the API returns the refresh token in the response
body instead. It's stored in the **iOS Keychain / Android Keystore** via
`react-native-keychain`, never in AsyncStorage, which is plain files.

The access token stays in memory only and is refreshed silently on a 401. All the
server-side protections are unchanged: rotation on every use, and replaying a spent
token still revokes every session for that user.

## Layout

```
src/
  config.ts          where the API lives, per platform
  types.ts           shared with the web app
  api/client.ts      fetch wrapper, Keychain storage, silent refresh
  auth/              AuthContext — session restore on launch
  components/        Stars (with half steps), Rank, Pill, Expired, Loading
  screens/           one file per screen
  Navigation.tsx     drawer wrapping the bottom tabs
  theme/theme.ts     the web dashboard's palette
```

## Notes

- `react-native-worklets` is a **direct** dependency, not just a transitive one.
  Reanimated 4 needs it, but autolinking only sees direct dependencies, so without
  it `pod install` fails with `Unable to find a specification for RNWorklets`.
- Icon fonts are linked via [react-native.config.js](react-native.config.js) and
  `npx react-native-asset`. If icons render as boxes, run that again.
- `import "react-native-gesture-handler"` must stay the first line of
  [App.tsx](App.tsx) — the drawer depends on it being initialised first.

## What's verified, and what isn't

The TypeScript compiles clean and the **JS bundle builds** (`react-native bundle`),
which exercises every import, the babel config and the worklets plugin. It has
**not been run on a simulator or device** — that needs a native build, and the disk
was full at the time. Expect the usual first-run friction: pod install, signing,
and a Metro restart.

An earlier Expo build of these same screens was driven end-to-end in a browser —
sign-in, all four tabs and the API calls worked against this backend — so the
screen logic is sound. The native shell around it is what's untested.
