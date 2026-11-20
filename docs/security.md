# Security Model

OpenMonkey runs untrusted third-party code (userscripts) inside Safari. This document describes how it limits what that code can do.

## Principles

1. **Default deny.** Nothing is granted unless the script declares it and the user approves the install.
2. **Least privilege.** A script gets only the APIs and network hosts it declares.
3. **User-visible provenance.** The user sees the script's source and permissions before installing, and can inspect them afterwards.
4. **No telemetry.** OpenMonkey itself makes no network requests and collects no usage data, so there is no exfiltration channel built into the app.

## Default-deny grants

- A script declares the GM APIs it needs with `@grant` metadata (e.g. `@grant GM_setValue`).
- At injection time, the GM bridge exposes **only** the declared APIs to that script. Any call to an undeclared API throws.
- `@grant none` means the script receives no GM APIs at all.
- Scripts that declare `GM_webRequest` or `GM_cookie` in `@grant` receive a warning at install time: those APIs are unsupported on Safari and will throw at runtime (see [gm-support.md](gm-support.md)).

## `@connect` allowlist

- `GM_xmlhttpRequest` may only contact hosts explicitly listed in the script's `@connect` metadata (plus the script's own `@match` hosts).
- A request to any other host is blocked by the background handler before it is issued, and the script receives an error.
- Wildcards follow Tampermonkey semantics (`*.example.com` matches subdomains). A bare `*` in `@connect` is treated as "all hosts" and is shown prominently in the install review UI — installing a script with `@connect *` is equivalent to granting it unrestricted network access, and the UI says so.
- The allowlist is enforced in the background context, not in the page — a script cannot bypass it by calling `fetch` directly, because page-world `fetch` is still subject to the page's CORS/CSP rules and receives no elevated privilege.

## `@require` hash pinning

- `@require` fetches remote JavaScript dependencies over HTTPS only. Plain-HTTP `@require` URLs are refused.
- Where a script provides a hash for a `@require` resource (Tampermonkey-style `#sha256=…` pinning), the fetched content is verified against the hash before it is executed or cached. A mismatch aborts the install/update and the script is not run.
- Dependencies are cached locally after verification. On update, each dependency is re-fetched and re-verified; a changed hash (or changed content where a hash is pinned) blocks the update until the user reviews it.
- `@require` content executes with the same grants as the requiring script — it does not gain extra privileges.

## Provenance / review-before-install UI

Before a script is installed, the user sees:

- The **full script source** (not a summary).
- The **metadata block** parsed out: name, version, author, description, `@match` / `@include` sites, `@grant` permissions, `@connect` hosts, `@require` URLs.
- **Warnings** for risky declarations: `@connect *`, `@grant` including unsupported APIs, remote `@require` URLs, `@run-at document-start` combined with broad `@match` patterns, and scripts whose source differs from a previously installed version of the same script.
- The **origin** of the install: the URL it was fetched from (e.g. a Greasy Fork page) or "pasted code" / "local file".

Updates to an installed script re-show the review UI when the new version changes permissions (`@grant`, `@connect`, `@require`) or when the source diff is large. Silent auto-update never expands a script's permissions.

## Permissions model

| Layer | What it controls |
|---|---|
| Safari extension permissions | Host permissions from the manifest (`<all_urls>` for content-script injection is requested at install; Safari prompts the user per site or globally). Without host permission on a site, no script runs there. |
| `@match` / `@include` / `@exclude` | Which sites a script runs on, per script. |
| `@grant` | Which GM APIs a script may call (default-deny). |
| `@connect` | Which hosts a script may contact via `GM_xmlhttpRequest`. |
| App Group / storage | Script values (`GM_setValue` etc.) are namespaced per script (namespace + name). A script cannot read another script's values. |
| Native host | The Swift native handler only accepts messages from the extension's own background context, validated by message type and sender. It never executes arbitrary code sent from a page. |

## Injection model (security view)

- Page-world script code runs in the page's JavaScript world with no privileged APIs.
- The GM bridge runs in the **isolated world** (the content script's world), which the page cannot reach.
- Privileged operations (storage, network, clipboard, tabs) are performed by the background context / native host, reached only via `chrome.runtime.sendMessage` from the isolated world.
- Messages are validated: unknown message types, missing script identity, or values outside the script's grants are rejected. See [architecture.md](architecture.md).

## No telemetry

OpenMonkey contains no telemetry, analytics, crash reporting, or tracking code. It makes no network requests of its own. The only network requests attributable to OpenMonkey are those a user's installed scripts make through `GM_xmlhttpRequest` to their declared `@connect` hosts.

## Reporting vulnerabilities

See [SECURITY.md](../SECURITY.md). Do not open a public issue for a security bug.
