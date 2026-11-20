# Changelog

All notable changes to OpenMonkey for Safari will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it reaches a stable release. During the Developer Preview (0.x), breaking changes may occur between preview releases.

> Note: on 2026-11-20 the repository was deleted and recreated clean at v0.5.3 (same name, same code). The rebuild removed the converter-template IPA workflow (`build-ipa.yml`), the TestFlight placeholder workflow (`testflight.yml`), `scripts/convert.sh` (it would overwrite the hand-maintained Xcode project), and 34 unreferenced per-size icon PNGs left over from the old all-sizes icon set. No code changed in the rebuild. The full pre-rebuild history is summarised in the version entries below.

## [Unreleased]

Nothing yet.

## [0.5.3] — 2026-11-16 — Developer Preview

### Fixed

- **The app finally fills the screen.** Root cause: the app shipped with no launch storyboard, so iOS never gave it a native full-screen window — the window itself was a centred band, and no layout fix inside it could help. Fixed by adding `xcode/App/LaunchScreen.storyboard` (minimal system-background view, copied into the app bundle) plus `INFOPLIST_KEY_UILaunchStoryboardName` and `INFOPLIST_KEY_UIRequiresFullScreen` in both iOS build configurations.
- Verified by the new CI simulator-screenshot workflow (`.github/workflows/screenshot-sim.yml`, iPhone 13 Pro Max, dark mode): the screenshot (run #8) shows the app covering the full 926pt height — status bar over app content, title at the top, pill tab bar near the bottom, no black bands. The v0.5.2 screenshot had proved the previous fix still broken, so no IPA is delivered any more without a real render to look at.
- The screenshot workflow now sets dark mode with `xcrun simctl ui <UDID> appearance dark` (the `defaults write` used before did not take effect).
- `scripts/check-xcode-project.py` now fails if the launch storyboard is missing, unreferenced, or the Info.plist key is absent.

### Known limitations

- The simulator renders in English, so the Chinese description fit was not directly seen (Chinese strings are shorter than the fully visible English ones).
- Still untested in real Safari on a device; unsigned IPA has no App Groups (falls back to the app's own Documents/Scripts); self-signed apps expire after 7 days.

## [0.5.2] — 2026-11-16 — Developer Preview — HELD, never delivered

### Added

- CI simulator-screenshot workflow (`.github/workflows/screenshot-sim.yml`): builds for the iOS Simulator, boots an iPhone 13 Pro Max simulator, installs and launches the app, screenshots Home, uploads the PNG. Rule from here on: no IPA is delivered until this workflow's screenshot has been looked at and the real render matches the design.
- `scripts/check-xcode-project.py` guard: the root view must force-fill the window.

### Fixed

- Root layout forced to fill the window (`GeometryReader` + `.frame(maxWidth: .infinity, maxHeight: .infinity)` on the root stack and both tabs; pill bottom padding reads the real safe area).
- All 9 Home descriptions shortened (Chinese ≤ 8 characters) so they fit the real text column.

### Known issues

- The simulator screenshot (run #1) PROVED this fix did not work: the app still rendered in a ~642pt-tall band centred on the 926pt screen. The window itself was not full-screen (see 0.5.3). v0.5.2 was therefore never sent to the user.

## [0.5.1] — 2026-11-16 — Developer Preview

### Changed

- App renamed to OpenMonkey (dropped the "- iOS" suffix; `CFBundleName` is now `OpenMonkey`).
- App icon is now a Single Size set: one 1024px master per appearance — white background in light mode, black background in dark mode, purple `</>` glyph. The old all-sizes set had no dark-mode slots at all.
- Screen-fit fix attempt: root view rebuilt as a flowing `VStack`, pill tab bar moved into the layout flow, 13 fixed paddings removed, root backgrounds extended through the safe area.

### Known issues

- Delivered, then rejected on a real iPhone 13 Pro Max: the app still did not fill the phone's visible area. The HTML-preview verification used for this release could not catch SwiftUI layout problems — see 0.5.2 for the real-render workflow that replaced it.
- 34 unreferenced per-size icon PNGs remain in the app icon set (actool warns "34 unassigned children" on every build; harmless). Removed in the 2026-11-20 clean rebuild.

## [0.5.0] — 2026-11-16 — Developer Preview

### Changed

- Host app UI rebuilt strictly from the Addons reference screenshots: Home with 9 real feature cards (Userscripts, Resources, Code Editor, Install, Ad Filter, Tag Mode, Smart Search, Dark Mode, Sniffing), floating pill tab bar (Home / My), grouped My settings, and real sub-pages (General Settings, Task Settings, Sync, Clear Data).
- Real features: ad filter (27 built-in selectors + custom rules), tag mode (tap-to-hide, per-site rules), web dark mode (style overlay, not an invert filter), smart search (trigger words bd / g / bing), resource detection + sniffing (same-origin download), real FaceID / TouchID app lock, settings-only iCloud sync, cleanup of real temporary data.

### Known limitations

- No m3u8 → mp4 merging (needs native code), no cross-origin download (CORS — copy link instead), no ad-request blocking (a content script cannot use declarativeNetRequest — hiding only), no "Allow cellular data" row (no real mechanism), cleanup offers temporary data only.

## [0.4.0] — 2026-11-16 — Developer Preview

### Changed

- Full Chinese UI with a 中文 / English switch, dark-mode cards made visible, attached tab bar (no longer floating over content), "enable all" switch wired to the extension settings.

### Known issues

- Rejected on the real device: the screen-fit problems persisted (layout misaligned, bottom navigation covering content, stray blank areas). See 0.5.0 for the rebuild from the reference screenshots.

## [0.3.0] — 2026-11-16 — Developer Preview

### Added

- SwiftUI host app rebuilt from scratch (see `docs/ui-redesign.md`): Addons-style Home with feature cards (Scripts, Code Editor, Install, Settings) and a "View help" capsule on each card; Stay-style Scripts list with search, Activated / Stopped / Featured capsule segments, and rows showing "● Activated | ⓥ version | Updated date"; a dark code editor with line numbers and syntax highlighting; iOS settings-style Settings page. The tab bar is now Home + Scripts.
- Install flow in the host app (`InstallView`): install a script from a `.user.js` URL, a file, or the clipboard, with the source parsed and reviewed before saving.
- Script update checks in the host app: the detail page fetches the script's `@updateURL` (or `@downloadURL`), compares versions, and installs the newer source over the installed file. The Scripts list can check every shown script at once.
- Native IPA workflow (`.github/workflows/build-ipa-native.yml`): builds the hand-written Xcode project with `xcodebuild` (scheme `OpenMonkey`, unsigned) and packages the resulting `.app` as `OpenMonkey-native-unsigned.ipa`.
- App entitlements (`xcode/App/OpenMonkey.entitlements`, App Groups `group.com.openmonkey.safari`) on both app targets, and the asset catalogue (`Assets.xcassets`) in both app targets' Resources phases. The extension target's Resources phase now carries a folder reference to `extension/dist`, rebuilt by a "Build Web Extension" script phase when missing.
- `scripts/check-xcode-project.py`: checks that every pbxproj reference resolves to a file on disk, every Swift file is compiled by the targets that need it, entitlements and scheme references are valid, and no iOS 16+ API or Swift 5.7+ syntax is used.

### Changed

- UI redesigned from scratch (see `docs/ui-redesign.md`): the web extension popup and dashboard are rebuilt on the Stay / Addons visual language — system grey background, white rounded cards (16pt), green switches, brand purple `#6C5CFF` used sparingly, capsule segments, and script rows with a 40px rounded-square icon, bold name, one-line description, and the "● Activated | ⓥ version | Updated date" bottom line. The dashboard is now a mobile-first single column (720px centred on desktop); the previous three-column desktop layout is gone. The SwiftUI app follows the same language. No storage keys or message protocols changed meaning.
- New app icon (`extension/icons/icon.svg`, regenerated PNGs via `scripts/generate-icons.py`): a purple (`#6C5CFF`) rounded square with a white, bold, geometric `</>` glyph. The monkey is gone — the icon no longer shows any monkey face, ears, or tail. Replaces the 0.2.0 gradient squircle with an amber monkey face and golden tail ring.
- Version bumped to 0.3.0 (`package.json`, `MARKETING_VERSION`, Settings → About).

### Fixed

- The extension target's Resources phase previously shipped no web files at all; it now includes the built extension (`extension/dist`).
- `ScriptDetailView.swift` was never referenced by the Xcode project (it existed on disk only); it is now in both app targets' Sources phases, along with the new `HomeView.swift` and `Design.swift`.
- `SafariWebExtensionHandler.swift` used Swift 5.7 `if let` shorthand, which does not compile under the project's Swift 5.0 language mode; fixed to the explicit form.

### Known limitations

- The "Enable all scripts" switch in the SwiftUI Settings page is app-local and is not yet wired to the web extension's `chrome.storage.local` setting of the same name.
- A macOS Safari Web Extension target still does not exist; the macOS app has no embedded extension.
- An unsigned IPA cannot use App Groups at runtime, so it falls back to the app's own Documents/Scripts folder until signed with a team that has the `group.com.openmonkey.safari` App Group.


## [0.2.0] — 2026-11-16 — Developer Preview

### Added

- Global injection switch and update-check interval settings (`openmonkey.settings.v1` in `chrome.storage.local`, via new `getSettings()` / `saveSettings()` in `storage.ts`). When the switch is off, the background returns no matching scripts (`OM_GET_MATCHING_SCRIPTS` now reports `globalEnabled` and an empty list), so content scripts inject nothing; the popup and dashboard still list the scripts, marked Paused. The dashboard sends `OM_SET_SETTINGS` so the background rebuilds its `chrome.alarms` update alarm for the new interval (0 days = no alarm). See `docs/ui-redesign.md`.
- Dashboard and popup now surface update checks: a "Check for updates" button (top bar and per-script detail) calls the background's `OM_CHECK_UPDATES`; scripts with a newer version get an "Update available" badge and an "Update to vX" button that downloads and saves the new source over the installed script (locally edited scripts are reported, not overwritten).
- Popup: "Install from URL" and "New script" (opens the dashboard with `?new=1`, which creates and opens a new script immediately).
- SwiftUI detail page (`xcode/App/ScriptDetailView.swift`): metadata, grants, matched sites, enable switch, Edit / Copy source / Delete; the library now navigates here instead of straight into the editor, with an All / Scripts / Styles filter and an enabled-count summary.

### Changed

- UI redesign (see `docs/ui-redesign.md`): popup and dashboard rebuilt in the Addons-card + iOS design language — card lists with coloured first-letter avatars, name/version/author, status badges (Running / Paused / Disabled / Update available), iOS-style switches, a site status card in the popup, a three-column library / detail / editor dashboard on iPad and desktop (single column on iPhone), and dark-mode support via `prefers-color-scheme`. The SwiftUI library, editor, and settings follow the same language. No storage keys or message protocols changed meaning; only additive protocol fields were added (`globalEnabled` on `OM_GET_MATCHING_SCRIPTS`, new `OM_SET_SETTINGS`).
- New app icon (`extension/icons/icon.svg`, regenerated PNGs via `scripts/generate-icons.py`): rounded square with a sky-blue-to-purple gradient, a warm amber geometric monkey face, and a golden tail ring forming a near-closed "O". Replaces the old blue tile with a gear and monkey face.
- Fixed the GitHub link in the SwiftUI Settings view (`https://github.com/aaronaevum/openmonkey-safari`).

### Fixed

- GM values are now persistent: `GM_setValue` / `GM_getValue` / `GM_deleteValue` are backed by `chrome.storage.local` (one JSON object per script, `om:values:<id>`) via new `OM_GM_GET_VALUES` / `OM_GM_SET_VALUE` / `OM_GM_DELETE_VALUE` background messages. Previously the content script used a fresh in-memory Map per injection, so values were lost on navigation or reload. Covered by `tests/gm-values.test.ts` (23 tests total).
- Fixed clone URLs in README / CONTRIBUTING to `github.com/aaronaevum/openmonkey-safari`.
- Fixed ESM imports in `background/` and `content/` to use explicit `.js` extensions; previously `npm test` failed on the new GM-values test with `ERR_MODULE_NOT_FOUND` because Node ESM cannot resolve extensionless relative imports.
- Icons are now generated, not committed: `scripts/generate-icons.py` (Pillow) renders `icon16/32/48/128.png` from `extension/icons/icon.svg`; the PNGs are git-ignored. Run it before packaging if the PNGs are missing.
- SECURITY.md no longer lists a placeholder email address; reports go via GitHub Security Advisories only.


## [0.1.0] — 2026-11-16 — Developer Preview

First public Developer Preview. Not on the App Store; install by self-building with Xcode (see README.md).

### Added

- Safari Web Extension (Manifest V3) with popup, background service worker, and content scripts for iOS and macOS.
- Userscript installation from `.user.js` URLs (including Greasy Fork), local files, the clipboard, and pasted code, with review-before-install showing the full script source and requested permissions.
- Script management: enable / disable per script, per-site toggles, update checks, import / export.
- Built-in script editor on iPhone / iPad and macOS.
- User styles (`.user.css`) installation and management.
- Tampermonkey-compatible GM APIs (P0 set, both `GM_*` and `GM.*` styles): `GM_info`, `GM_addStyle`, `GM_setValue` / `GM_getValue` / `GM_deleteValue` / `GM_listValues`, `GM_xmlhttpRequest` (with `@connect` allowlist), `GM_getResourceText` / `GM_getResourceURL`, `GM_registerMenuCommand`, `GM_setClipboard`, `GM_openInTab`, `GM_log`.
- Security model: default-deny grants, `@connect` allowlist, `@require` hash pinning, isolated-world GM bridge (page-world scripts never receive privileged APIs directly), no telemetry.
- Example userscript (`examples/hello-openmonkey.user.js`) and example user style (`examples/dark-reader-lite.user.css`).
- Build and release tooling: `scripts/convert.sh` (safari-web-extension-converter wrapper), `scripts/package.sh` (safari-web-extension-packager wrapper), `scripts/release-check.sh` (build + test + manifest validation).
- GitHub Actions CI: build and test on push / pull request (Node 20), plus a manual TestFlight placeholder workflow.
- Documentation: README (English / Chinese), CONTRIBUTING, SECURITY, and docs covering architecture, Safari limits, the GM support matrix, and security.

### Known limitations

- `GM_webRequest` and `GM_cookie` are not supported — Safari provides no equivalent extension API.
- Safari cannot bypass Content Security Policy (CSP); scripts relying on CSP bypass will not work.
- Apps signed with a free Apple ID provisioning profile expire after 7 days and must be rebuilt and reinstalled.
- App Store submission has not happened; approval is not guaranteed (Guideline 2.5.2 risk — see README.md).
