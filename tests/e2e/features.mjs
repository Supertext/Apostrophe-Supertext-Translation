#!/usr/bin/env node
/**
 * Language pairs against the REAL Supertext API, without any plugin or SDK code: asks
 * `GET features` (cost-free) and checks that every pair the demo translates is offered.
 * Uses GitHub Actions annotations. See "End-to-end tests" in docs/DEVELOPER.md.
 *
 *   SUPERTEXT_API_KEY=… E2E_SOURCE=en E2E_TARGETS=de-CH,fr-CH,it-CH node test/e2e/features.mjs
 */
const key = (process.env.SUPERTEXT_API_KEY ?? '').replace(/^\s*Supertext-Auth-Key\s*/i, '').trim();
const base = (process.env.SUPERTEXT_API_URL || 'https://api.supertext.com/v1/').replace(/\/?$/, '/');
const source = process.env.E2E_SOURCE ?? 'en';
const targets = (process.env.E2E_TARGETS ?? '').split(',').map((t) => t.trim()).filter(Boolean);

if (!key) {
	console.log('::error::SUPERTEXT_API_KEY is not set');
	process.exit(1);
}
if (!targets.length) {
	console.log('::error::E2E_TARGETS is not set (the demo\'s target languages as Supertext codes)');
	process.exit(1);
}

const res = await fetch(`${base}features`, { headers: { Authorization: `Supertext-Auth-Key ${key}`, 'User-Agent': 'Supertext-Plugin-E2E' } });
if (!res.ok) {
	console.log(`::error::GET features answered HTTP ${res.status}${res.status === 401 || res.status === 403 ? ' (is SUPERTEXT_API_KEY valid?)' : ''}`);
	process.exit(1);
}
const pairs = (await res.json()).supported_features ?? [];
const sources = new Set(pairs.map((p) => p.source_lang));
const targetSet = new Set(pairs.map((p) => p.target_lang));
console.log(`Live API: ${pairs.length} pairs, ${sources.size} sources, ${targetSet.size} targets.`);

let errors = 0;
for (const target of targets) {
	if (pairs.some((p) => p.source_lang === source && p.target_lang === target)) {
		console.log(`ok   ${source} → ${target}`);
	} else {
		console.log(`::error::The API doesn't offer ${source} → ${target}, which the demo translates`);
		errors++;
	}
}
process.exit(errors ? 1 : 0);
