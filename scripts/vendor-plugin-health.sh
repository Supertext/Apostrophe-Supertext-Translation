#!/usr/bin/env bash
# Copies Supertext Plugin Health (TypeScript, built JavaScript) into vendor/supertext-plugin-health.
# Source: https://github.com/Supertext/Commando-Center-Supertext-Translation (plugin-health/typescript).
#
#   scripts/vendor-plugin-health.sh                  # latest main
#   scripts/vendor-plugin-health.sh <commit|branch>  # a tag (plugin-health-vX.Y.Z), branch or commit
#   PLUGIN_HEALTH_DIR=/path/to/clone scripts/vendor-plugin-health.sh   # a local clone, as it is
#
# The module ships this copy next to the Supertext SDK's, so sites install nothing besides
# the module. The copy's package.json only marks the files as ES modules for require();
# lib/reporting.js loads index.js.
set -euo pipefail
cd "$(dirname "$0")/.."
ref="${1:-main}"
dest=vendor/supertext-plugin-health
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
if [ -n "${PLUGIN_HEALTH_DIR:-}" ]; then
  src="$(cd "$PLUGIN_HEALTH_DIR" && pwd)"
else
  git clone -q https://github.com/Supertext/Commando-Center-Supertext-Translation "$work/center"
  git -C "$work/center" checkout -q "$ref"
  src="$work/center"
fi
commit="$(git -C "$src" rev-parse HEAD)"
version="$(node -p "require('$src/plugin-health/typescript/package.json').version")"
cp -R "$src/plugin-health/typescript" "$work/ts"
rm -rf "$work/ts/node_modules" "$work/ts/dist"
(cd "$work/ts" && npm ci --no-audit --no-fund --silent && npm run --silent build)
rm -rf "$dest"
mkdir -p "$dest"
(cd "$work/ts/dist" && find . \( -name '*.js' -o -name '*.d.ts' \) | while read -r f; do mkdir -p "$OLDPWD/$dest/$(dirname "$f")"; cp "$f" "$OLDPWD/$dest/$f"; done)
cp "$src/plugin-health/typescript/LICENSE" "$dest/LICENSE"
printf '{\n  "name": "supertext-plugin-health",\n  "version": "%s",\n  "private": true,\n  "type": "module",\n  "main": "./index.js",\n  "types": "./index.d.ts",\n  "exports": {\n    ".": { "types": "./index.d.ts", "default": "./index.js" },\n    "./package.json": "./package.json"\n  },\n  "license": "MIT"\n}\n' "$version" > "$dest/package.json"
printf '%s\n' "$commit" > "$dest/COMMIT"
printf '%s\n' "$version" > "$dest/VERSION"
cat > "$dest/README.md" <<README
# Supertext Plugin Health (bundled copy)

Built JavaScript of the TypeScript part of [Supertext Plugin Health](https://github.com/Supertext/Commando-Center-Supertext-Translation/tree/main/plugin-health) (\`plugin-health/typescript\`), version $version, commit \`$commit\`. \`package.json\` only marks the files as ES modules.

Don't edit these files: fix it in Commando-Center-Supertext-Translation/plugin-health, then run \`scripts/vendor-plugin-health.sh\`.
README
echo "$dest: Supertext Plugin Health (TypeScript) $version from commit $commit"
