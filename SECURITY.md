# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x (Developer Preview) | ✅ Security fixes on a best-effort basis |
| < 0.1.0 | ❌ Not supported |

v0.1.0 is a Developer Preview. Security fixes are applied on a best-effort basis and may land in the next preview release rather than as a patch to an old preview. Once OpenMonkey reaches a stable release, this table will list the supported stable branches.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security vulnerability.**

Report it privately via **GitHub Security Advisories**: use the "Report a vulnerability" / "Security" tab on the repository to open a private advisory. No email address is published for security reports, so there is no placeholder address to go stale.

Please include in your report:

- A description of the vulnerability and its impact.
- Steps to reproduce (a minimal userscript, URL, or sequence of actions).
- The version you tested (commit hash if building from source).
- Whether the issue affects iOS, macOS, or both.

We will acknowledge receipt, investigate, and coordinate a fix and disclosure timeline with you. We ask that you give us a reasonable time to fix the issue before public disclosure.

## Threat model (summary)

OpenMonkey runs untrusted third-party code (userscripts) inside Safari. The threat model assumes:

- **A malicious or compromised userscript** is the primary threat. A script may try to exfiltrate data from pages it runs on, make network requests to attacker hosts, or abuse granted GM APIs.
- **A malicious web page** may try to trick the extension into leaking privileged data, or to get a script installed under false pretences (e.g. a spoofed install page).
- **A compromised `@require` / `@resource` dependency** may inject code into a script at install or update time.
- **The extension itself** must not become a tracking or exfiltration channel: OpenMonkey makes no network requests of its own.

Mitigations are described in full in [docs/security.md](docs/security.md). In summary:

- **Default-deny grants:** a script gets only the GM APIs listed in its `@grant` metadata; anything else is denied.
- **`@connect` allowlist:** `GM_xmlhttpRequest` may only contact hosts explicitly listed in `@connect`.
- **`@require` hash pinning:** remote dependencies are fetched over HTTPS and verified against a pinned hash where provided; updates re-verify.
- **Review before install:** the full script source and requested permissions are shown before installation.
- **Isolated-world bridge:** page-world script code never receives privileged APIs directly; all privileged calls pass through the isolated-world GM bridge and the native message handler.
- **No telemetry:** OpenMonkey collects no usage data, so there is no telemetry pipeline to abuse or leak.

## Out of scope

The following are known Safari platform limits, not vulnerabilities in OpenMonkey — please do not report them as security bugs (documentation improvements about them are welcome):

- Safari cannot bypass Content Security Policy (CSP); a page's CSP may block a script's actions. See [docs/safari.md](docs/safari.md).
- Safari provides no `userScripts` API and no `webRequest` / cookies API for extensions; `GM_webRequest` and `GM_cookie` are therefore unsupported by design.
- Apps signed with a free Apple ID provisioning profile expire after 7 days (an Apple limitation).

## No telemetry

OpenMonkey contains no telemetry, analytics, or tracking code of any kind. A vulnerability report about data collection should be judged against this: if you find any code that sends user data anywhere, that is a security bug — please report it.
