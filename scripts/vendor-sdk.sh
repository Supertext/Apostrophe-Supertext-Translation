#!/usr/bin/env bash
# Copies the Supertext TypeScript SDK (built JavaScript) into vendor/supertext-sdk.
# Source: https://github.com/Supertext/Supertext-API-SDK-and-Guide (sdk/typescript).
#
#   scripts/vendor-sdk.sh            # latest main
#   scripts/vendor-sdk.sh v0.2.0     # a tag or commit
#   SDK_DIR=../Supertext-API-SDK-and-Guide scripts/vendor-sdk.sh   # a local checkout
#
# The module ships this copy, so sites install nothing besides the module (Apostrophe
# modules have no build step that could bundle the SDK).
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
commit="$(git -C "$src" rev-parse HEAD)"
version="$(node -p "require('$src/sdk/typescript/package.json').version")"
cp -R "$src/sdk/typescript" "$work/ts"
(cd "$work/ts" && npm ci --no-audit --no-fund --silent && npm run --silent build)
rm -rf vendor/supertext-sdk
mkdir -p vendor/supertext-sdk
cp "$work"/ts/dist/*.js "$work"/ts/dist/*.d.ts vendor/supertext-sdk/
cp "$src/sdk/typescript/LICENSE" vendor/supertext-sdk/LICENSE
printf '{\n  "name": "supertext-sdk",\n  "version": "%s",\n  "private": true,\n  "type": "module",\n  "main": "./index.js",\n  "types": "./index.d.ts",\n  "license": "MIT"\n}\n' "$version" > vendor/supertext-sdk/package.json
printf '%s\n' "$commit" > vendor/supertext-sdk/COMMIT
printf '# Supertext SDK (bundled copy)\n\nBuilt JavaScript of the TypeScript part of the [Supertext SDK](https://github.com/Supertext/Supertext-API-SDK-and-Guide),\nversion %s, commit `%s`.\n\nDo not edit these files: fix the SDK in its own repository, then run `scripts/vendor-sdk.sh`.\n' "$version" "$commit" > vendor/supertext-sdk/README.md
echo "vendor/supertext-sdk: supertext-sdk $version ($commit)"
