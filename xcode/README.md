# OpenMonkey for Safari — Xcode host app

The SwiftUI host app and the native side of the Safari Web Extension.
The in-page web extension itself lives in `../extension/`; this
directory is the app a user installs, manages scripts in, and enables
in Safari Settings.

## Layout

| Path | What it is |
| --- | --- |
| `OpenMonkey.xcodeproj/` | Xcode project: `OpenMonkey`, `OpenMonkey-macOS`, `OpenMonkeyExtension` targets |
| `App/OpenMonkeyApp.swift` | `@main` SwiftUI app — custom attached tab bar: Home, Scripts |
| `App/LibraryView.swift` | Script library: search, enable/disable, delete, open in editor |
| `App/EditorView.swift` | Monospace script editor with live metadata validation |
| `App/SettingsView.swift` | Global enable, update checks, storage status, Safari enable steps, About |
| `Extension/SafariWebExtensionHandler.swift` | Native messaging handler (`getScripts` / `saveScript` / `log`) |
| `Extension/Info.plist` | Extension plist: Safari web-extension point, website access, version 0.5.3 |
| `Extension/OpenMonkeyExtension.entitlements` | App Groups (`group.com.openmonkey.safari`) |
| `Shared/AppGroup.swift` | App Group identifier and shared-container helpers |
| `Shared/ScriptStore.swift` | Script file I/O, enabled state, security-scoped folder bookmarks |
| `Shared/MetadataParser.swift` | JS-free Swift parser for the `// ==UserScript==` block |

All three targets share `Shared/`; the two app targets share `App/`.

## Opening in Xcode

Requirements: a Mac with Xcode 15 or later, and an Apple ID
(a free personal account is enough to start).

1. Open `OpenMonkey.xcodeproj` in Xcode.
2. Select the `OpenMonkey` scheme, pick a simulator or device, and press Run.
   For macOS, switch to the `OpenMonkey-macOS` scheme and select My Mac.
3. If Xcode reports signing errors, select each target, go to
   **Signing & Capabilities**, tick **Automatically manage signing**,
   and choose your team (your Apple ID). Add the **App Groups**
   capability to every target and tick `group.com.openmonkey.safari`.
   The group identifier must match `Shared/AppGroup.swift` exactly.

## Signing with a free Apple ID

- A free (personal) Apple ID can sign and install the app on your own
  devices, but the provisioning profile **expires after 7 days**.
  After expiry, rebuild and reinstall from Xcode; installed scripts
  survive in the App Group container, but re-signing may require
  re-enabling the extension in Safari Settings.
- A paid Apple Developer Program membership removes the 7-day limit
  and is required to distribute the app to other people (TestFlight
  or the App Store). This project is not on the App Store.
- Every target (both apps and the extension) must be signed with the
  same team, and the App Group `group.com.openmonkey.safari` must be
  registered to that team, or the extension will not see the app's
  scripts. When the group is unavailable, `ScriptStore` falls back
  to the app's own `Documents/Scripts` directory and the Library
  shows a warning banner.

## Safari Web Extension converter / packager notes

- The extension target in this project is a **native** Safari Web
  Extension target: its `Info.plist` declares the
  `com.apple.Safari.web-extension` point and its principal class is
  `SafariWebExtensionHandler`. The web extension's HTML/JS/CSS
  resources (in `../extension/`) are bundled into the `.appex` by
  the extension target's Resources phase when they are added there.
- Apple's `safari-web-extension-converter` is a different route: it
  converts an existing Chrome/Firefox extension directory into a
  full Xcode project. It is useful as a one-off starting point, but
  this project is maintained by hand instead, so the converter's
  generated project is not checked in and its output should not be
  merged back over these files.
- To package for distribution outside the App Store (macOS), use
  Xcode's **Product → Archive**, then **Distribute App → Developer ID**
  (requires a paid membership). For iOS there is no sideloading route
  other than Xcode / TestFlight / the App Store.

## Enabling the extension

After installing the app:

- **iOS:** Settings → Safari → Extensions → turn on OpenMonkey,
  then choose the websites it may access (or "All Websites").
- **macOS:** Safari → Settings → Extensions → tick OpenMonkey.

Scripts only run on pages matching their `@match` / `@include`
rules, and only while the extension is enabled.

## What is NOT yet wired

- **Real native-messaging round-trip.** `SafariWebExtensionHandler`
  implements the `OM_NATIVE` message contract (`getScripts`,
  `saveScript`, `log` over a `public.property-list` payload) and
  calls `completeRequest` exactly once per request, but the full
  loop — web extension background script → native handler →
  `ScriptStore` → reply → content script injection — has not been
  run on a device or simulator. That needs a Mac, Xcode, and a
  signed build.
- **macOS extension target.** Only the iOS extension target exists
  so far. The macOS one is a follow-up: duplicate the iOS target,
  change the SDK to macOS, and embed it in `OpenMonkey-macOS`.
  The project file's header comment records this.
- **App entitlements files.** Only the extension's entitlements
  file exists. The app targets need their own
  `App/OpenMonkey.entitlements` with the same App Group before the
  shared container works under signing; until then the app uses its
  local fallback directory.
- **App icon / asset catalogue.** No `Assets.xcassets` is referenced
  yet; add one before any distribution.
- **Update checking.** Settings exposes the interval, but no code
  yet fetches `@updateURL` / `@downloadURL` and compares versions.
- **Line numbers in the editor.** The editor is a plain `TextEditor`
  with a monospace font, by design for this first version.

## Verifying on a Mac

```sh
# From the repository root, on a Mac with Xcode installed:
xcodebuild -project xcode/OpenMonkey.xcodeproj \
  -scheme OpenMonkey -destination 'platform=iOS Simulator,name=iPhone 16' \
  build
```

This was **not** run during development on Linux (no Xcode there);
the Swift in this directory is written to compile by inspection
only. Treat the first `xcodebuild` run as the real check.
