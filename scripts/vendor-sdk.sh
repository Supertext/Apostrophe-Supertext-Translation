#!/usr/bin/env bash
# Copies the Supertext TypeScript SDK (built JavaScript) into vendor/supertext-sdk.
# Source: https://github.com/Supertext/Supertext-API-SDK-and-Guide (sdk/typescript).
#
#   scripts/vendor-sdk.sh                  # latest main
#   scripts/vendor-sdk.sh <commit|branch>  # a tag, branch or commit
#   SDK_DIR=/path/to/clone scripts/vendor-sdk.sh   # a local clone, as it is
#
# The module ships this copy, so sites install nothing besides the module (Apostrophe
# modules have no build step that could bundle the SDK). The copy's package.json only
# marks the files as ES modules for require(); lib/sdk.js loads the v1 folder.
set -euo pipefail
cd "$(dirname "$0")/.."
ref="${1:-main}"
dest=vendor/supertext-sdk
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
rm -rf "$work/ts/node_modules" "$work/ts/dist"
(cd "$work/ts" && npm ci --no-audit --no-fund --silent && npm run --silent build)
rm -rf "$dest"
mkdir -p "$dest"
# dist/ has the version-neutral index and one folder per API version (v1/).
(cd "$work/ts/dist" && find . \( -name '*.js' -o -name '*.d.ts' \) | while read -r f; do mkdir -p "$OLDPWD/$dest/$(dirname "$f")"; cp "$f" "$OLDPWD/$dest/$f"; done)
cp "$src/sdk/typescript/LICENSE" "$dest/LICENSE"
printf '{\n  "name": "supertext-sdk",\n  "version": "%s",\n  "private": true,\n  "type": "module",\n  "main": "./index.js",\n  "types": "./index.d.ts",\n  "exports": {\n    ".": { "types": "./index.d.ts", "default": "./index.js" },\n    "./v1": { "types": "./v1/index.d.ts", "default": "./v1/index.js" },\n    "./package.json": "./package.json"\n  },\n  "license": "MIT"\n}\n' "$version" > "$dest/package.json"
printf '%s\n' "$commit" > "$dest/COMMIT"
printf '%s\n' "$version" > "$dest/VERSION"
cat > "$dest/README.md" <<README
# Supertext SDK (bundled copy)

Built JavaScript of the TypeScript part of the [Supertext SDK](https://github.com/Supertext/Supertext-API-SDK-and-Guide) (\`sdk/typescript\`), version $version, commit \`$commit\`. \`package.json\` only marks the files as ES modules.

Don't edit these files: fix the SDK in its own repository, then run \`scripts/vendor-sdk.sh\`.
README
echo "$dest: Supertext SDK (TypeScript) $version from commit $commit"
