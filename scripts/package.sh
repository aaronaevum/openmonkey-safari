#!/usr/bin/env bash
# package.sh — package the built OpenMonkey Safari extension for distribution
# using Apple's safari-web-extension-packager.
#
# Usage:
#   ./scripts/package.sh [packager options...]
#
# Requires macOS with Xcode command-line tools (xcrun). On other platforms
# this script prints a message and exits without doing anything.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "package.sh: macOS only — safari-web-extension-packager requires Xcode (xcrun) on macOS." >&2
    echo "You are running: $(uname -s). Nothing was packaged." >&2
    exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
    echo "package.sh: xcrun not found. Install Xcode (or the Xcode command-line tools) and try again." >&2
    echo "See: https://developer.apple.com/xcode/" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -d "${ROOT_DIR}/extension" ]]; then
    echo "package.sh: extension/ directory not found at ${ROOT_DIR}/extension" >&2
    exit 1
fi

xcrun safari-web-extension-packager "${ROOT_DIR}/extension" "$@"

echo "package.sh: done."
