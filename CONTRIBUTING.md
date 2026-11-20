# Contributing to OpenMonkey for Safari

Thank you for considering a contribution. OpenMonkey is a free, open-source, Tampermonkey-compatible Safari userscript manager, licensed under the Mozilla Public License 2.0 (MPL-2.0).

## Code of conduct

Be respectful and constructive. Assume good faith. Disagreements about technical direction are welcome; personal attacks are not.

## What we need

- Bug fixes and Safari-compatibility work (see [docs/safari.md](docs/safari.md) for platform limits).
- GM API implementations, following the priority order in [docs/gm-support.md](docs/gm-support.md) (P0 first, then P1; do not add `GM_webRequest` / `GM_cookie` — Safari has no equivalent API).
- Editor improvements on iOS and macOS.
- Documentation, examples, and translations (English / Chinese).
- Tests for the extension, the GM bridge, and the native host.

## Development setup

Prerequisites:

- macOS with Xcode installed (for the native app and Safari extension work). The web-extension code itself can be built on any platform with Node.js.
- Node.js 20 (see `.github/workflows/build.yml` — CI uses Node 20).
- npm (bundled with Node.js).

Setup:

```sh
git clone https://github.com/aaronaevum/openmonkey-safari.git
cd openmonkey-safari
npm install
npm run build
npm test
```

Validate the extension manifest:

```sh
python3 -m json.tool extension/manifest.json > /dev/null
```

Or run the full release check:

```sh
./scripts/release-check.sh
```

The Xcode project in `xcode/` is hand-maintained — do not regenerate it with Apple's `safari-web-extension-converter` (that would overwrite the SwiftUI host app). To package the built extension for distribution (macOS only):

```sh
./scripts/package.sh
```

See `scripts/` for the packager wrapper. It requires `xcrun` (Xcode command-line tools) and prints a clear message when it is absent.

## Code style

- **TypeScript:** strict mode (`"strict": true`). No `any` without justification in a comment. Prefer explicit types on exported functions. Run the project's formatter/linter before submitting (see `package.json` scripts).
- **Swift:** follow standard Swift style; SwiftLint configuration, if present in the repo, is authoritative. Keep native code minimal — business logic belongs in the web extension where possible, with Swift as a thin host.
- **Web extension code:** keep the content-script / GM bridge split clean — page-world scripts must never receive privileged APIs directly; all privileged calls go through the isolated-world bridge and the native message handler (see [docs/architecture.md](docs/architecture.md)).
- **Comments:** explain *why*, not *what*. Security-relevant code (grants, `@connect` checks, `@require` pinning) must carry a comment stating the invariant it enforces.
- **No dead code, no commented-out code** in submitted PRs.

## Pull request process

1. Fork the repository and create a branch from `main` (or the current development branch). Use a descriptive branch name, e.g. `gm-notification` or `fix/update-check`.
2. Make focused changes — one concern per PR. Include tests for behaviour changes.
3. Run the full check before pushing:
   ```sh
   npm run build
   npm test
   ./scripts/release-check.sh
   ```
4. Write a clear PR description: what changed, why, how it was tested, and any Safari-specific behaviour (iOS vs macOS) you verified.
5. A maintainer will review. Expect review comments on security-sensitive areas (permissions, network, script execution) — these are held to a higher bar.
6. Once approved, a maintainer merges. Squash-merge is the default; keep your commit history tidy.

## Licensing of contributions (inbound = outbound)

OpenMonkey is licensed under the **Mozilla Public License 2.0**. By contributing, you agree that your contributions are licensed under the same MPL-2.0 terms (inbound = outbound). There is no separate Contributor License Agreement and no Developer Certificate of Origin sign-off required.

## No GPL code

**Do not contribute code copied from GPL-licensed projects.** In particular:

- Do not copy code from quoid/userscripts (GPL-3.0) or any other GPL-licensed userscript manager.
- Do not copy code from proprietary apps (e.g. Stay, Tampermonkey).
- OpenMonkey is a clean-room implementation. If you have studied another manager's source, write your contribution from the specification (the GM API docs, the metadata format, Safari's extension APIs) — not from memory of their code.
- Dependencies must be license-compatible with MPL-2.0. GPL-licensed dependencies are not acceptable. When in doubt, ask in the PR or an issue before adding a dependency.

## Reporting issues

- Bugs: open a GitHub issue with steps to reproduce, expected vs actual behaviour, Safari version, iOS/macOS version, and device.
- Feature requests: open an issue describing the use case, not just the API name. GM API requests should reference the matrix in [docs/gm-support.md](docs/gm-support.md).
- Security vulnerabilities: **do not** open a public issue — see [SECURITY.md](SECURITY.md).
