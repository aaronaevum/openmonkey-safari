# Safari Limits

What Safari can and cannot do for a userscript manager — and how OpenMonkey works within those limits.

## No `userScripts` API

Safari's Web Extensions implementation does **not** expose Chrome's `chrome.userScripts` API (the API that lets an extension register and execute user scripts dynamically at runtime).

Consequences for OpenMonkey:

- Scripts cannot be registered with the browser as first-class "user scripts". Instead, OpenMonkey injects scripts itself through its content scripts and the GM bridge (see [architecture.md](architecture.md)).
- Script registration, enable/disable, and per-site matching are implemented in the extension's own background logic, not delegated to the browser.
- There is no browser-level isolation between registered scripts beyond what OpenMonkey's own injection model provides; the isolated-world bridge is what keeps page code away from privileged APIs.

## Content Security Policy (CSP) cannot be bypassed

On desktop Chrome/Firefox, Tampermonkey can inject scripts in ways that bypass a page's Content Security Policy. **Safari cannot do this.**

- A page's CSP applies to extension-injected content as well. If a page's CSP blocks inline scripts, `eval`, remote fetches, or particular sources, OpenMonkey's injection may be blocked or limited on that page.
- `GM_xmlhttpRequest` goes through the extension's background context, which is not subject to the page's CSP in the same way, so cross-origin requests listed in `@connect` still work — but DOM-level injection on a strict-CSP page may not.
- Some scripts that work in desktop Tampermonkey will not work in OpenMonkey (or in any Safari userscript manager) for this reason. This is a platform limit, not an OpenMonkey bug. If a script fails only on a strict-CSP site, CSP is the first thing to check.

## 7-day self-signing limit

Apps and extensions built in Xcode and signed with a **free Apple ID** provisioning profile expire after **7 days**.

- After expiry the app/extension stops launching until it is rebuilt and reinstalled from Xcode.
- This affects the self-build install path only. A paid Apple Developer Program membership ($99/year) uses a one-year certificate instead.
- OpenMonkey cannot work around this; it is an Apple code-signing rule.

Practical advice: keep the Xcode project around after your first build so rebuilding is a one-click re-run, and set a reminder before the 7-day expiry.

## iOS vs macOS differences

| Area | macOS | iOS (iPhone / iPad) |
|---|---|---|
| Extension enablement | Safari → Settings → Extensions | Settings → Safari → Extensions |
| Editor | Full editor in the app / popup | Full editor in the app — the key differentiator; no other free manager offers a real editor on iOS |
| File access | Open `.user.js` files from Finder | Open from Files / share sheet, clipboard, or paste |
| Developer tools | Safari Web Inspector for debugging | Web Inspector via a connected Mac |
| Background execution | Background service worker / native host | More aggressively suspended by the OS; script storage is persistent, but background work may be deferred |
| Keyboard / shortcuts | Full keyboard support | On-screen keyboard; external keyboard supported on iPad |

Both platforms share the same extension code, the same GM bridge, and the same storage model (see [architecture.md](architecture.md)).

## WWDC26: unsigned-extension developer load and the packager

Per WWDC26, Safari supports loading an **unsigned extension in developer mode without Xcode**:

- Enable Developer mode in Safari settings, then load the extension directory directly. This is a development-only flow: it is meant for testing while developing, not for everyday use, and the loaded extension does not survive the way a signed install does.
- The `safari-web-extension-converter` (`xcrun safari-web-extension-converter`) converts the web extension in `extension/` into an Xcode project. The hand-maintained project in `xcode/` is NOT generated this way — do not run the converter over it.
- The `safari-web-extension-packager` (`xcrun safari-web-extension-packager`) packages a built extension for distribution — see `scripts/package.sh`.

Both tools require Xcode command-line tools (`xcrun`) and therefore macOS. Neither tool is available on iOS or Linux; the scripts print a clear message and exit when `xcrun` is absent.

## Other Safari constraints worth knowing

- **Manifest V3 only.** Safari Web Extensions use Manifest V3; Manifest V2 extensions are not supported. Background logic runs in a service worker, not a persistent background page.
- **No `webRequest` blocking API.** Safari does not expose the blocking `webRequest` API to extensions. This is why `GM_webRequest` is unsupported (see [gm-support.md](gm-support.md)).
- **No cookies API for extensions.** Safari does not expose a cookies API to extensions. This is why `GM_cookie` is unsupported.
- **Storage limits.** `chrome.storage.local` has a quota (historically 10 MB for extensions in Chromium-based browsers; Safari's exact quota is undocumented and may differ). Large script libraries should live in the App Group files, with only metadata in `chrome.storage.local` — see [architecture.md](architecture.md).
- **App Store review.** Userscript managers face Guideline 2.5.2 (apps may not download, install, or execute code). See the README's App Store review section: approval is not guaranteed, and OpenMonkey mitigates the risk with a real editor, source-visible install, and default-deny grants.
