#!/usr/bin/env bash
# CI: starts the demo image twice against PostgreSQL with the stand-in API, checks the demo
# accounts (created once, never duplicated, passwords never logged), runs `check`, translates
# the sample page and article through Apostrophe's own localize step and reads the results
# back through Apostrophe's REST API as the editor. Needs: docker image
# supertext-apostrophe-demo, Postgres at $DATABASE_URL, and the stand-in on 127.0.0.1:8765.
set -euo pipefail
PORT=${PORT:-8080}
B=http://127.0.0.1:$PORT
export DEMO_ADMIN_EMAIL=ci-admin@example.com DEMO_ADMIN_PASSWORD="Ci-$(openssl rand -hex 12)"
export DEMO_EDITOR_EMAIL=ci-editor@example.com DEMO_EDITOR_PASSWORD="Ci-$(openssl rand -hex 12)"
export APOS_SESSION_SECRET="$(openssl rand -hex 24)"
app() { docker exec demo node app "$@"; }

start() {
	docker rm -f demo >/dev/null 2>&1 || true
	docker run -d --name demo --network host -e PORT=$PORT -e DATABASE_URL -e APOS_SESSION_SECRET \
		-e DEMO_ADMIN_EMAIL -e DEMO_ADMIN_PASSWORD -e DEMO_EDITOR_EMAIL -e DEMO_EDITOR_PASSWORD \
		-e SUPERTEXT_API_KEY=anything -e SUPERTEXT_API_URL=http://127.0.0.1:8765/v1/ supertext-apostrophe-demo >/dev/null
	for _ in $(seq 120); do curl -sf -o /dev/null "$B/health" && break; sleep 2; done
	curl -sf -o /dev/null "$B/health"
	docker logs demo 2>&1 | grep '\[demo\]' || true
}

start
start   # second start: nothing duplicated or changed
logs=$(docker logs demo 2>&1)
grep -qF 'DEMO_EDITOR: account exists, left unchanged' <<< "$logs"
if grep -qF -e "$DEMO_ADMIN_PASSWORD" -e "$DEMO_EDITOR_PASSWORD" <<< "$logs"; then echo "A password appeared in the log"; exit 1; fi
echo "accounts OK"

out=$(app supertext-apostrophe-translation:check)
echo "$out"
grep -qF 'The API key works' <<< "$out"
out=$(app supertext-apostrophe-translation:translate --slug=/swiss-chocolate)
out+=$'\n'$(app supertext-apostrophe-translation:translate --slug=handmade-in-bern --type=article)
echo "$out"
test "$(grep -c ': translated' <<< "$out")" = 6
grep -qF 'de: translated /schweizer-schokolade-weltweit-versandt' <<< "$out"
grep -qF 'it: translated realizzato-a-mano-a-berna' <<< "$out"
out=$(app supertext-apostrophe-translation:translate --slug=/swiss-chocolate --to=de)
grep -qF 'skipped' <<< "$out"

# Read the drafts back through Apostrophe's REST API, logged in as the editor.
token=$(curl -sf -H 'Content-Type: application/json' \
	-d "{\"username\":\"$DEMO_EDITOR_EMAIL\",\"password\":\"$DEMO_EDITOR_PASSWORD\"}" \
	"$B/api/v1/@apostrophecms/login/login" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
auth="Authorization: Bearer $token"
pages=$(curl -sf -H "$auth" "$B/api/v1/@apostrophecms/page?aposLocale=de&aposMode=draft&all=1&flat=1")
grep -qF 'Schweizer Schokolade, weltweit versandt' <<< "$pages"
id=$(node -pe 'JSON.parse(require("fs").readFileSync(0)).results.find((p) => p.slug === "/schweizer-schokolade-weltweit-versandt")._id' <<< "$pages")
page=$(curl -sf -H "$auth" "$B/api/v1/@apostrophecms/page/$id?aposMode=draft")
grep -qF '<strong>Berner</strong>' <<< "$page"
grep -qF 'https://www.supertext.com' <<< "$page"
article=$(curl -sf -H "$auth" "$B/api/v1/article?aposLocale=it&aposMode=draft")
grep -qF 'Realizzato a mano a Berna' <<< "$article"
grep -qF '<em>scatola di degustazione</em>' <<< "$article"
echo "Demo check passed"
