# GM Support Matrix

Tampermonkey / Greasemonkey API compatibility for OpenMonkey for Safari, v0.1.0.

Both `GM_*` (e.g. `GM_setValue`) and `GM.*` (e.g. `GM.setValue`) styles are supported for every API listed as supported below. Scripts using `@grant none` run without any GM APIs, as in Tampermonkey.

A script may only use the APIs it declares in `@grant`. Undeclared APIs are denied at runtime (default-deny grants — see [security.md](security.md)).

## P0 — Supported

These APIs are implemented in v0.1.0.

| API | Notes |
|---|---|
| `GM_info` | Script metadata: `script` (name, namespace, version, description, matches, grants, run-at, etc.), `scriptHandler` (`"OpenMonkey"`), `version` (OpenMonkey version), `platform`. Read-only. |
| `GM_addStyle` | Injects a `<style>` element with the given CSS into the page. |
| `GM_setValue` | Stores a value (string / number / boolean / object) in the script's namespaced storage. |
| `GM_getValue` | Reads a stored value, returning the supplied default when absent. |
| `GM_deleteValue` | Removes a stored value. |
| `GM_listValues` | Returns the list of stored keys for the script. |
| `GM_xmlhttpRequest` | Cross-origin requests from the background context. **Only hosts listed in the script's `@connect` metadata are allowed** (plus the script's own `@match` hosts). See [security.md](security.md). Supports `method`, `url`, `headers`, `data`, `responseType`, `onload`, `onerror`, `ontimeout`, `timeout`. |
| `GM_getResourceText` | Returns the text of a `@resource` declared in the script metadata. |
| `GM_getResourceURL` | Returns a `blob:` / `data:` URL for a `@resource` declared in the script metadata. |
| `GM_registerMenuCommand` | Registers a command shown in the OpenMonkey popup / action menu while the script is active on the current page. |
| `GM_setClipboard` | Writes text to the clipboard (requires a user gesture on some Safari versions). |
| `GM_openInTab` | Opens a URL in a new Safari tab. `active` / `insert` options are honoured where Safari exposes them; background-tab behaviour may differ from desktop Tampermonkey. |
| `GM_log` | Logs a message to the OpenMonkey log (visible in the app / popup), prefixed with the script name. |

## P1 — Planned

These APIs are not implemented in v0.1.0. They are planned, in this order, subject to what Safari's extension APIs permit.

| API | Notes / blocker |
|---|---|
| `GM_notification` | Planned via the native host / `UNUserNotificationCenter`. Requires user notification permission; on iOS, notifications from Safari extensions are limited. |
| `GM_download` | Planned via the native host (save to Files / Downloads). Safari extensions cannot trigger downloads directly from the background context. |
| `GM_addElement` | Planned: create a DOM element with attributes in the page world, via the GM bridge. |
| `window.onurlchange` | Planned: fire on SPA navigation (History API `pushState` / `replaceState` and `popstate`), so `@match`-based scripts can re-run on client-side route changes. |

## Not supported

These APIs will not be implemented, because Safari's extension model provides no equivalent capability.

| API | Reason |
|---|---|
| `GM_webRequest` | Safari does not expose a `webRequest` (blocking or observational) API to extensions. There is no way for an extension to intercept, inspect, or modify network requests. |
| `GM_cookie` | Safari does not expose a cookies API to extensions. There is no way for an extension to read, set, or delete cookies. |

Scripts that depend on `GM_webRequest` or `GM_cookie` will fail in OpenMonkey. If a script declares either in `@grant`, installation still succeeds (with a warning in the review-before-install UI), but calls to those APIs will throw at runtime.

## Other Tampermonkey features

| Feature | Status |
|---|---|
| `@match`, `@include`, `@exclude`, `@exclude-match` | Supported |
| `@run-at` (`document-start`, `document-end`, `document-idle`) | Supported; `document-start` is best-effort on Safari (injection timing may be later than on desktop) |
| `@grant none` | Supported |
| `@grant` (individual APIs) | Supported — default-deny; undeclared APIs throw |
| `@connect` | Supported and enforced (see [security.md](security.md)) |
| `@require` | Supported over HTTPS, with hash pinning where a hash is provided (see [security.md](security.md)) |
| `@resource` | Supported (see `GM_getResourceText` / `GM_getResourceURL`) |
| `@updateURL`, `@downloadURL`, `@version` | Supported for update checks |
| `@noframes` | Supported |
| `unsafeWindow` | Not available — Safari content scripts have no equivalent of a direct page-world `window` handle with elevated access. Scripts should use the GM bridge APIs instead. |
| `GM_addValueChangeListener` / `GM_removeValueChangeListener` | Not in v0.1.0; under consideration for P1. |
