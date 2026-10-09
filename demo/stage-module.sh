#!/bin/sh
# Copies the module's files into demo/module, which the demo installs from (package.json:
# "supertext-apostrophe-translation": "file:./module", .npmrc install-links=true).
# Run it before `npm install` in demo/ whenever the module changed.
set -e
cd "$(dirname "$0")/.."
rm -rf demo/module
mkdir -p demo/module
cp -R package.json index.js lib i18n ui demo/module/
