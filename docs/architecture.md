# Architecture

How OpenMonkey for Safari is put together: the extension, the native app, and how messages flow between them.

## Components

```
┌─────────────────────────────────────────────────────────────────┐
│ Safari                                                          │
│                                                                 │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────────┐  │
│  │ Popup / App  │   │ Background       │   │ Content script │  │
│  │ UI (editor,  │◄─►│ (service worker) │◄─►│ (isolated      │  │
│  │ script list, │   │ script registry, │   │  world)        │  │
│  │ install      │   │ GM dispatch,     │   │ GM bridge,     │  │
│  │ review)      │   │ @connect checks, │   │ injection      │  │
│  └──────┬───────┘   │ update checks    │   └───────┬────────┘  │
│         │           └────────┬─────────┘           │           │
│         │                    │                     │           │
│         │           ┌────────▼─────────┐           │           │
│         │           │ Native host      │           │           │
│         │           │ (Swift)          │           │           │
│         │           │ SafariWebExt-    │           │           │
│         │           │ ensionHandler:   │           │           │
│         │           │ files, keychain, │           │           │
│         │           │ notifications    │           │           │
│         │           └────────┬─────────┘           │           │
│         │                    │                     │           │
│         └────────────────────┴─────────────────────┘           │
│                              │                                  │
│                    ┌─────────▼────────┐                         │
│                    │ App Group        │                         │
│                    │ shared storage   │                         │
│                    └──────────────────┘                         │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Page world (page's own JS world)                          │  │
│  │  Userscript code runs here — no privileged APIs.          │  │
│  │  Talks to the GM bridge via window.postMessage /           │  │
│  │  CustomEvent only.                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Message flow

Text diagram of a privileged call (e.g. a script calling `GM_setValue` or `GM_xmlhttpRequest`):

```
page world (userscript)
  │  GM_setValue('visits', 3)
  │  → window.postMessage({ type: 'openmonkey:gm-call', id, api, args })
  ▼
content script — isolated world (GM bridge)
  │  1. checks the script's @grant list — undeclared API? → throw
  │  2. checks @connect (for GM_xmlhttpRequest) — unlisted host? → error
  │  3. chrome.runtime.sendMessage({ type: 'gm-call', scriptId, api, args })
  ▼
background (service worker)
  │  1. re-validates grants + @connect (defence in depth — never trust the
  │     content script alone)
  │  2. performs the operation, or forwards to the native host:
  │     chrome.runtime.sendNativeMessage / native messaging
  ▼
native host (Swift — SafariWebExtensionHandler)
  │  file / keychain / notification operations; validates sender + type;
  │  never executes arbitrary code
  │  → result
  ▼
background → content script (isolated world) → page world
  (result delivered as a promise resolution / callback)
```

And the install flow:

```
popup / app UI
  │  user opens a .user.js URL, file, clipboard text, or pasted code
  │  → parse metadata block (@name, @match, @grant, @connect, @require…)
  │  → fetch + verify @require dependencies (HTTPS + hash pinning)
  ▼
install review UI
  │  shows full source, permissions, @connect hosts, warnings
  │  → user confirms (or cancels)
  ▼
background registry
  │  stores script source + metadata; schedules update check
  ▼
storage (see below)
```

Non-privileged page interaction (DOM reads/writes by the script itself) happens directly in the page world and never crosses the bridge.

## Storage model

Two stores, with distinct roles:

| Store | What lives there | Why |
|---|---|---|
| `chrome.storage.local` | Script registry metadata (id, name, version, enabled, `@match` rules, grants, update URL, install date), per-script `GM_*` values (`GM_setValue` / `GM_getValue`), UI settings | Synchronous-ish access from background + popup; small, structured data. Values are namespaced per script (`<namespace>:<name>:<key>`), so scripts cannot read each other's values. |
| App Group files | Script source files (`.user.js` / `.user.css`), cached `@require` / `@resource` content, exported backups | Large blobs that should not count against the `chrome.storage.local` quota; shared between the app and the extension via the App Group container, so the iOS/macOS editor and the extension see the same files. |

Rules:

- The registry in `chrome.storage.local` is the source of truth for *which* scripts exist and whether they are enabled. The App Group files are the source of truth for *what the code is*.
- If a file is missing for a registered script, the script is treated as broken (shown as such in the UI) and is not injected.
- Exports write a copy of the script files out of the App Group; imports read a file, parse it, and run it through the same review-before-install flow as a URL install.

## Injection model

1. **Matching.** When a page loads, the background matches the URL against every enabled script's `@match` / `@include` / `@exclude` rules (and the user's per-site toggles). Matching scripts are queued for injection.
2. **Isolated world.** The content script runs in the extension's isolated JavaScript world. It creates the GM bridge object there: a set of functions (`GM_setValue`, `GM_xmlhttpRequest`, …) that validate the call and forward it via `chrome.runtime.sendMessage`.
3. **Page world.** The userscript source itself is injected into the **page world** (the page's own JavaScript world), so it sees the page's DOM and JavaScript exactly as the page does. It receives a `GM` / `GM_*` façade that forwards calls to the bridge via `window.postMessage` — it never receives the privileged functions themselves.
4. **Styles.** `.user.css` styles are injected as `<style>` elements (via `GM_addStyle` semantics) at the appropriate `@run-at` time.

This split is the core security boundary: page code (including a malicious script) can call the façade, but cannot reach the bridge internals, the background, or the native host except through the validated message path.

## Repository layout

```
openmonkey-safari/
├── extension/            # Safari Web Extension (Manifest V3): popup, background,
│                         #   content scripts, GM bridge, editor UI
├── xcode/                # Hand-maintained Xcode project:
│                         #   App, Extension, Shared (App Group code)
├── docs/                 # architecture, safari limits, GM matrix, security
├── examples/             # example .user.js / .user.css
├── scripts/              # package.sh, release-check.sh, check-xcode-project.py
├── .github/workflows/    # CI (build.yml) + native IPA (build-ipa-native.yml)
│                         # + simulator screenshot (screenshot-sim.yml)
├── LICENSE               # MPL-2.0
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
└── CHANGELOG.md
```

> Note: `extension/` and `xcode/` contents are built by other parts of this project; this document describes the intended layout. See the repository root for the current state.
