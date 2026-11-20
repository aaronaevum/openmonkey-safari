#!/usr/bin/env bash
# release-check.sh — pre-release sanity check for OpenMonkey for Safari.
#
# Runs:
#   1. npm run build
#   2. npm test
#   3. JSON validation of extension/manifest.json
#
# Usage:
#   ./scripts/release-check.sh
#
# The build/test steps require Node.js and npm. The manifest check requires
# python3. On Linux this script runs the Node/python steps normally (only the
# Xcode converter/packager scripts are macOS-only); it does not attempt any
# macOS-only work.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

echo "==> npm run build"
npm run build

echo "==> npm test"
npm test

echo "==> Validating extension/manifest.json"
if [[ ! -f "${ROOT_DIR}/extension/manifest.json" ]]; then
    echo "release-check.sh: extension/manifest.json not found at ${ROOT_DIR}/extension/manifest.json" >&2
    exit 1
fi
python3 -m json.tool "${ROOT_DIR}/extension/manifest.json" > /dev/null
echo "extension/manifest.json: valid JSON"

echo "==> release-check passed"
