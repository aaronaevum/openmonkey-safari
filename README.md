# OpenMonkey for Safari

> **v0.5.3 Developer Preview — NOT on the App Store**

A free, open, Tampermonkey-compatible Safari userscript manager — with a real editor on iPhone and iPad, and one-tap install.

> **v0.5.3 开发者预览版 — 尚未上架 App Store**
>
> 免费、开源、兼容 Tampermonkey 的 Safari 用户脚本管理器 —— 在 iPhone / iPad 上提供真正的编辑器，一键安装脚本。

---

## What is OpenMonkey? / OpenMonkey 是什么？

OpenMonkey for Safari is a free and open-source userscript manager for Safari on iOS and macOS. It lets you install, manage, edit, and run userscripts (`.user.js`) and user styles (`.user.css`) in Safari — including a real code editor on iPhone and iPad, where no other free manager offers one.

OpenMonkey for Safari 是一款免费开源的 Safari 用户脚本管理器，支持 iOS 与 macOS。它可以在 Safari 中安装、管理、编辑和运行用户脚本（`.user.js`）与用户样式（`.user.css`），并在 iPhone / iPad 上提供真正的代码编辑器。

It is Tampermonkey-compatible: scripts written for Tampermonkey / Greasemonkey / Violentmonkey using the standard `GM_*` / `GM.*` APIs and `@grant` metadata should work, within the limits Safari imposes (see [docs/gm-support.md](docs/gm-support.md) and [docs/safari.md](docs/safari.md)).

它兼容 Tampermonkey：使用标准 `GM_*` / `GM.*` API 与 `@grant` 元数据、为 Tampermonkey / Greasemonkey / Violentmonkey 编写的脚本，在 Safari 允许的范围内均可运行（限制见 [docs/gm-support.md](docs/gm-support.md) 与 [docs/safari.md](docs/safari.md)）。

**License:** Mozilla Public License 2.0 (MPL-2.0) — see [LICENSE](LICENSE).
**许可证：** Mozilla Public License 2.0（MPL-2.0），见 [LICENSE](LICENSE)。

**Status:** v0.5.3 Developer Preview. This is early software. It is **not** on the App Store and has **not** been submitted for App Store review. v0.5.3 was verified on an iPhone 13 Pro Max simulator (full-screen window, dark mode, Home + My tabs); it has not yet been tested in real Safari on a device.
**状态：** v0.5.3 开发者预览版，属于早期软件。**尚未上架 App Store，也尚未提交 App Store 审核。** v0.5.3 已在 iPhone 13 Pro Max 模拟器上验证通过（全屏窗口、深色模式、首页 + 我的标签栏）；尚未在真机 Safari 中实测。

---

## Features / 功能

- **One-tap install** — install a script from any `.user.js` URL, from Greasy Fork, from a local file, from the clipboard, or by pasting code directly.
  **一键安装** —— 可从任意 `.user.js` 链接、Greasy Fork、本地文件、剪贴板或直接粘贴代码安装脚本。
- **Real editor on iPhone / iPad** — create and edit scripts on iOS, not just on macOS.
  **iPhone / iPad 真实编辑器** —— 不仅在 macOS 上，在 iOS 上也能创建和编辑脚本。
- **Script management** — enable / disable per script, per-site toggles, update checks, and import / export.
  **脚本管理** —— 按脚本启用 / 禁用、按站点开关、更新检查、导入 / 导出。
- **User styles (`.user.css`)** — install and manage user styles alongside userscripts.
  **用户样式（`.user.css`）** —— 与用户脚本并列安装和管理用户样式。
- **Tampermonkey-compatible GM APIs** — `GM_info`, `GM_addStyle`, `GM_setValue` / `GM_getValue` / `GM_deleteValue` / `GM_listValues`, `GM_xmlhttpRequest` (with `@connect`), `GM_getResourceText` / `GM_getResourceURL`, `GM_registerMenuCommand`, `GM_setClipboard`, `GM_openInTab`, `GM_log` — in both `GM_*` and `GM.*` styles. Full matrix: [docs/gm-support.md](docs/gm-support.md).
  **兼容 Tampermonkey 的 GM API** —— 支持 `GM_info`、`GM_addStyle`、`GM_setValue` / `GM_getValue` / `GM_deleteValue` / `GM_listValues`、`GM_xmlhttpRequest`（需 `@connect`）、`GM_getResourceText` / `GM_getResourceURL`、`GM_registerMenuCommand`、`GM_setClipboard`、`GM_openInTab`、`GM_log`，`GM_*` 与 `GM.*` 两种写法均支持。完整矩阵见 [docs/gm-support.md](docs/gm-support.md)。
- **Review before install** — see a script's source, its `@grant` permissions, and its `@connect` / `@require` targets before you install it. See [docs/security.md](docs/security.md).
  **安装前审查** —— 安装前可查看脚本源码、`@grant` 权限以及 `@connect` / `@require` 目标。见 [docs/security.md](docs/security.md)。
- **Privacy by design** — no telemetry, no tracking, no analytics. Your scripts and data stay on your device. See [Privacy](#privacy--%E9%9A%90%E7%A7%81) below.
  **隐私优先** —— 无遥测、无追踪、无统计。脚本与数据只保存在你的设备上。见下文[隐私](#privacy--隐私)一节。

### Not supported / 不支持的功能

- `GM_webRequest` and `GM_cookie` are **not supported** — Safari's extension model provides no equivalent API. See [docs/gm-support.md](docs/gm-support.md).
  `GM_webRequest` 与 `GM_cookie` **不受支持** —— Safari 的扩展模型没有对应的 API。见 [docs/gm-support.md](docs/gm-support.md)。
- Safari cannot bypass Content Security Policy (CSP) the way desktop Tampermonkey can. Some scripts that rely on CSP bypass will not work. See [docs/safari.md](docs/safari.md).
  Safari 无法像桌面版 Tampermonkey 那样绕过内容安全策略（CSP），依赖 CSP 绕过的脚本可能无法运行。见 [docs/safari.md](docs/safari.md)。

---

## Install / 安装

There is no App Store download yet. Until OpenMonkey is submitted and approved (which is not guaranteed — see [App Store review](#app-store-review--app-store-%E5%AE%A1%E6%A0%B8) below), install it by building it yourself.

目前没有 App Store 下载。在 OpenMonkey 提交并通过审核之前（审核通过并不保证，见下文 [App Store 审核](#app-store-review--app-store-审核)），请自行构建安装。

### Option A — Self-build with Xcode (free Apple ID) / 方案 A：使用 Xcode 自行构建（免费 Apple ID）

1. Clone this repository and install dependencies:
   克隆本仓库并安装依赖：
   ```sh
   git clone https://github.com/aaronaevum/openmonkey-safari.git
   cd openmonkey-safari
   npm install
   python3 scripts/generate-icons.py  # PNG icons are generated from icon.svg, not committed
   npm run build
   ```
2. Open the hand-maintained Xcode project (macOS only):
   打开手工维护的 Xcode 工程（仅 macOS）：
   ```sh
   open xcode/OpenMonkey.xcodeproj
   ```
   Do NOT regenerate this project with Apple's `safari-web-extension-converter` — that would overwrite the SwiftUI host app.
   请勿用 Apple 的 `safari-web-extension-converter` 重新生成该工程——那会覆盖掉 SwiftUI 宿主 App。
3. In Xcode, sign in with your (free) Apple ID, select your team, and run it on your device or simulator.
   在 Xcode 中使用（免费）Apple ID 登录，选择你的开发团队，在设备或模拟器上运行。
4. Enable the extension in **Safari → Settings → Extensions** (macOS) or **Settings → Safari → Extensions** (iOS), and turn on OpenMonkey.
   在 **Safari → 设置 → 扩展**（macOS）或 **设置 → Safari → 扩展**（iOS）中启用 OpenMonkey。

**7-day certificate limit:** apps signed with a free Apple ID provisioning profile expire after 7 days. After expiry, rebuild and reinstall from Xcode. This is an Apple limitation for free accounts, not an OpenMonkey limitation.
**7 天证书限制：** 使用免费 Apple ID 签名的应用会在 7 天后过期。过期后需从 Xcode 重新构建并安装。这是 Apple 对免费账号的限制，不是 OpenMonkey 的限制。

### Option B — Safari unsigned-extension developer load (WWDC26) / 方案 B：Safari 未签名扩展开发者加载（WWDC26）

Per WWDC26, Safari supports loading an unsigned extension in developer mode without Xcode. See [docs/safari.md](docs/safari.md) for the current state of this path; it is a development-only flow and does not replace a signed install for everyday use.
根据 WWDC26，Safari 支持在开发者模式下加载未签名扩展，无需 Xcode。此路径的现状见 [docs/safari.md](docs/safari.md)；它仅适用于开发，不可替代日常使用的签名安装。

### TestFlight / App Store / TestFlight / App Store

Not yet submitted. There is no TestFlight link and no App Store link. When a submission happens, this section will be updated.
尚未提交。没有 TestFlight 链接，也没有 App Store 链接。提交后本节会更新。

---

## Usage / 使用方法

1. **Enable the extension** in Safari → Settings → Extensions (macOS) or Settings → Safari → Extensions (iOS).
   **启用扩展**：在 Safari → 设置 → 扩展（macOS）或设置 → Safari → 扩展（iOS）中启用。
2. **Install a script** — open any `.user.js` URL (for example a script page on Greasy Fork), or use the OpenMonkey popup / app to install from a file, from the clipboard, or by pasting code. Review the script source and requested permissions, then confirm.
   **安装脚本** —— 打开任意 `.user.js` 链接（例如 Greasy Fork 上的脚本页），或使用 OpenMonkey 弹窗 / App 从文件、剪贴板或粘贴代码安装。安装前请查看脚本源码与请求的权限，然后确认。
3. **Manage scripts** — open the OpenMonkey popup or app to enable / disable scripts, edit them in the built-in editor, check for updates, or export them.
   **管理脚本** —— 打开 OpenMonkey 弹窗或 App，可启用 / 禁用脚本、在内置编辑器中编辑、检查更新或导出。
4. **Per-site control** — scripts run only on the sites matched by their `@match` / `@include` rules, and can be toggled per site.
   **按站点控制** —— 脚本仅在 `@match` / `@include` 规则匹配的站点上运行，并可按站点开关。

Example scripts to try first: [examples/hello-openmonkey.user.js](examples/hello-openmonkey.user.js) (a minimal userscript) and [examples/dark-reader-lite.user.css](examples/dark-reader-lite.user.css) (a minimal user style).
可先试用示例：[examples/hello-openmonkey.user.js](examples/hello-openmonkey.user.js)（最小用户脚本）与 [examples/dark-reader-lite.user.css](examples/dark-reader-lite.user.css)（最小用户样式）。

---

## GM support matrix (summary) / GM 支持矩阵（摘要）

| Status / 状态 | APIs |
|---|---|
| ✅ Supported / 已支持 (P0) | `GM_info`, `GM_addStyle`, `GM_setValue`, `GM_getValue`, `GM_deleteValue`, `GM_listValues`, `GM_xmlhttpRequest` (with `@connect`), `GM_getResourceText`, `GM_getResourceURL`, `GM_registerMenuCommand`, `GM_setClipboard`, `GM_openInTab`, `GM_log` — both `GM_*` and `GM.*` styles |
| 🗓️ Planned / 计划中 (P1) | `GM_notification`, `GM_download`, `GM_addElement`, `window.onurlchange` |
| ❌ Not supported / 不支持 | `GM_webRequest`, `GM_cookie` — no Safari equivalent API |

Full matrix with notes and reasons: [docs/gm-support.md](docs/gm-support.md). 完整矩阵与说明见 [docs/gm-support.md](docs/gm-support.md)。

---

## Privacy / 隐私

- **No telemetry. No tracking. No analytics.** OpenMonkey collects no usage data and sends nothing to any server.
  **无遥测、无追踪、无统计。** OpenMonkey 不收集任何使用数据，不向任何服务器发送数据。
- **Data not collected.** Your scripts, settings, and stored values stay on your device (in the app's local storage / App Group).
  **不收集数据。** 你的脚本、设置与存储值只保存在你的设备上（应用本地存储 / App Group）。
- **Network requests come from your scripts, not from OpenMonkey.** A script's `GM_xmlhttpRequest` calls go only to hosts listed in its `@connect` metadata, and only after you approve the install. OpenMonkey itself makes no network requests.
  **网络请求来自你的脚本，而非 OpenMonkey。** 脚本的 `GM_xmlhttpRequest` 仅发往其 `@connect` 元数据中列出的主机，且仅在你批准安装后。OpenMonkey 自身不发起任何网络请求。
- See [docs/security.md](docs/security.md) for the permissions model. 权限模型见 [docs/security.md](docs/security.md)。

---

## Comparison / 对比

Honest comparison with the existing Safari userscript managers, based on the project's research. Prices and features are as publicly documented at the time of writing (November 2026) and may change.

以下为与现有 Safari 用户脚本管理器的诚实对比，基于本项目的研究。价格与功能以撰写时（2026 年 11 月）公开资料为准，可能发生变化。

|  | **OpenMonkey for Safari** | **Stay** | **Userscripts** | **Tampermonkey (Safari)** |
|---|---|---|---|---|
| Price / 价格 | Free / 免费 | Free + $4.99 lifetime Pro / 免费 + $4.99 终身 Pro | Free / 免费 | $2.99, proprietary / $2.99，专有软件 |
| License / 许可证 | MPL-2.0 (open source) / 开源 | MPL-2.0 repo; commercial app / 代码库 MPL-2.0；商业应用 | GPL-3.0 / GPL-3.0 | Proprietary / 专有 |
| iOS editor / iOS 编辑器 | ✅ Real editor on iPhone / iPad / iPhone / iPad 真实编辑器 | Editor available / 有编辑器 | ❌ No iOS editor / 无 iOS 编辑器 | Editor available / 有编辑器 |
| One-tap install / 一键安装 | ✅ / 是 | ✅ / 是 | ✅ / 是 | ✅ / 是 |
| GM API coverage / GM API 覆盖 | P0 set (see matrix) / P0 集合（见矩阵） | Broad / 较广 | Basic / 基础 | Broad / 较广 |
| Open source / 开源 | ✅ / 是 | ✅ (repo) / 是（代码库） | ✅ / 是 | ❌ / 否 |

OpenMonkey's differentiator is the combination: free, open (MPL-2.0), Tampermonkey-compatible, and a real editor on iPhone/iPad — with no paid tier.
OpenMonkey 的差异点在于组合：免费、开源（MPL-2.0）、兼容 Tampermonkey、且在 iPhone / iPad 上提供真实编辑器——没有任何付费档位。

---

## App Store review / App Store 审核

**Approval is NOT guaranteed.** Safari userscript managers face App Store Review Guideline 2.5.2, which restricts apps that download, install, or execute code. Apple has approved similar apps (Stay, Userscripts, Tampermonkey), but each submission is judged on its own, and a rejection or a request for changes is a real possibility.

**审核通过并不保证。** Safari 用户脚本管理器面临 App Store 审核指南 2.5.2 的限制，该条款限制下载、安装或执行代码的应用。Apple 曾批准过同类应用（Stay、Userscripts、Tampermonkey），但每次提交都会单独评审，被拒或被要求修改是真实存在的可能。

Mitigations built into OpenMonkey:
OpenMonkey 内置的缓解措施：

- A real editor, so scripts are user-authored and user-visible, not hidden downloaded code.
  提供真实编辑器，使脚本由用户编写、用户可见，而非隐藏的下载代码。
- Source-visible install: the full script source and its requested permissions are shown before install.
  安装时源码可见：安装前展示完整脚本源码与请求的权限。
- Default-deny grants and `@connect` allowlisting (see [docs/security.md](docs/security.md)).
  默认拒绝授权与 `@connect` 白名单（见 [docs/security.md](docs/security.md)）。

These reduce the risk; they do not remove it. Do not treat this project as App Store-approved until Apple says so.
这些措施能降低风险，但不能消除风险。在 Apple 明确批准之前，请勿将本项目视为已获 App Store 批准。

---

## Documentation / 文档

- [docs/architecture.md](docs/architecture.md) — message flow, storage model, injection model / 消息流、存储模型、注入模型
- [docs/safari.md](docs/safari.md) — Safari limits: no userScripts API, CSP, 7-day self-sign, iOS vs macOS, WWDC26 dev load / Safari 限制
- [docs/gm-support.md](docs/gm-support.md) — full GM support matrix / 完整 GM 支持矩阵
- [docs/security.md](docs/security.md) — permissions, grants, `@connect`, `@require` pinning, provenance / 权限与安全模型
- [examples/hello-openmonkey.user.js](examples/hello-openmonkey.user.js) — example userscript / 示例用户脚本
- [examples/dark-reader-lite.user.css](examples/dark-reader-lite.user.css) — example user style / 示例用户样式

---

## Contributing / 参与贡献

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, code style, and the PR process. In short: TypeScript strict, Swift, no GPL-licensed code — contributions are under MPL-2.0 (inbound = outbound).

欢迎参与贡献。开发环境、代码风格与 PR 流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。简言之：TypeScript 严格模式、Swift、不接受 GPL 许可的代码——贡献均遵循 MPL-2.0（ inbound = outbound）。

## Security / 安全

To report a vulnerability, see [SECURITY.md](SECURITY.md). Do not open a public issue for a security bug.
报告漏洞请见 [SECURITY.md](SECURITY.md)。请勿为安全问题开公开 issue。

## Changelog / 更新日志

See [CHANGELOG.md](CHANGELOG.md). 见 [CHANGELOG.md](CHANGELOG.md)。

## License / 许可证

Mozilla Public License 2.0 — see [LICENSE](LICENSE).
Mozilla Public License 2.0，见 [LICENSE](LICENSE)。
