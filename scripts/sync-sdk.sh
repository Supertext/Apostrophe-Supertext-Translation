#!/usr/bin/env bash
# Copies the Supertext TypeScript SDK (built JavaScript) into vendor/supertext-sdk.
# Source: https://github.com/Supertext/Supertext-API-SDK-and-Guide (sdk/typescript).
#
#   scripts/sync-sdk.sh            # latest main
#   scripts/sync-sdk.sh v0.2.0     # a tag or commit
#   SDK_DIR=../Supertext-API-SDK-and-Guide scripts/sync-sdk.sh   # a local checkout
#
# Until the SDK is published on npm, the module ships this copy; then it becomes a
# normal dependency ("supertext-sdk") and this script goes away.
set -euo pipefail
cd "$(dirname "$0")/.."
ref="${1:-main}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
if [ -n "${SDK_DIR:-}" ]; then
  src="$(cd "$SDK_DIR" && pwd)"
else
  git clone -q https://github.com/Supertext/Supertext-API-SDK-and-Guide "$work/sdk"
  git -C "$work/sdk" checkout -q "$ref"
  src="$work/sdk"
fi
commit="$(git -C "$src" rev-parse --short HEAD)"
version="$(node -p "require('$src/sdk/typescript/package.json').version")"
cp -R "$src/sdk/typescript" "$work/ts"
(cd "$work/ts" && npm ci --no-audit --no-fund --silent && npm run --silent build)
rm -rf vendor/supertext-sdk
mkdir -p vendor/supertext-sdk
cp "$work"/ts/dist/*.js "$work"/ts/dist/*.d.ts vendor/supertext-sdk/
cp "$src/sdk/typescript/LICENSE" vendor/supertext-sdk/LICENSE
printf '{\n  "name": "supertext-sdk",\n  "version": "%s",\n  "private": true,\n  "type": "module",\n  "main": "./index.js",\n  "types": "./index.d.ts",\n  "license": "MIT"\n}\n' "$version" > vendor/supertext-sdk/package.json
printf 'Supertext SDK for TypeScript %s, commit %s\nhttps://github.com/Supertext/Supertext-API-SDK-and-Guide/tree/%s/sdk/typescript\nCopied by scripts/sync-sdk.sh. Do not edit: change the SDK repository and sync again.\n' "$version" "$commit" "$commit" > vendor/supertext-sdk/SOURCE
echo "vendor/supertext-sdk: supertext-sdk $version ($commit)"
