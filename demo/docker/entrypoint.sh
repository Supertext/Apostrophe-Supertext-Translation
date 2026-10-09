#!/bin/bash
# Demo container start: database, migrations, demo setup (accounts, sample content), Apostrophe.
# Variables: demo/.env.example. Passwords are never printed.
set -euo pipefail
cd /app/demo
echo "[demo] Starting…"

if [ -z "${APOS_SESSION_SECRET:-}" ]; then echo "[demo] APOS_SESSION_SECRET is not set. See demo/.env.example."; exit 1; fi

# DATABASE_URL (Railway's Postgres service) → the demo's own database APOSTROPHE_DB_NAME on
# that server, created here if missing (app.js derives APOS_DB_URI the same way, so
# `docker exec … node app <task>` works too). APOS_DB_URI set directly wins.
if [ -z "${APOS_DB_URI:-}" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then echo "[demo] Set DATABASE_URL (Postgres) or APOS_DB_URI."; exit 1; fi
  name="${APOSTROPHE_DB_NAME:-supertext_apostrophe}"
  if ! [[ "$name" =~ ^[a-z0-9_]+$ ]]; then echo "[demo] APOSTROPHE_DB_NAME: lower-case letters, digits and _ only."; exit 1; fi
  export APOSTROPHE_TARGET_DB="$name"
  for attempt in $(seq 1 30); do
    if node -e '
      const { Client } = require("pg");
      const target = process.env.APOSTROPHE_TARGET_DB;
      const c = new Client({ connectionString: process.env.DATABASE_URL });
      c.connect()
        .then(() => c.query("SELECT 1 FROM pg_database WHERE datname = $1", [ target ]))
        .then((r) => r.rowCount ? null : c.query(`CREATE DATABASE "${target}"`))
        .then(() => c.end())
        .catch((e) => { console.error(e.message); process.exit(1); });
    ' 2>/tmp/db.log; then break; fi
    if [ "$attempt" = 30 ]; then echo "[demo] Database not reachable:"; cat /tmp/db.log; exit 1; fi
    echo "[demo] Database not ready yet, retrying…"; sleep 3
  done
fi
if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ] && [ -z "${APOS_BASE_URL:-}" ]; then
  export APOS_BASE_URL="https://${RAILWAY_PUBLIC_DOMAIN}"
fi

node app @apostrophecms/migration:migrate > /tmp/migrate.log 2>&1 || { echo "[demo] Migration failed:"; tail -30 /tmp/migrate.log; exit 1; }
node app supertext-demo:setup 2>&1 | grep '\[demo\]' || true
echo "[demo] Starting Apostrophe on port ${PORT:-8080} (${APOS_BASE_URL:-local})."
exec node app
