#!/usr/bin/env node
/**
 * End-to-end test against the REAL Supertext API: a fresh demo (nothing localized yet) with
 * a real SUPERTEXT_API_KEY. The editor localizes every English page and article into every
 * other locale with Apostrophe's own "Localize…" wizard ("Translate text content" ticked,
 * so the module's Supertext provider translates), then the results are read back through
 * Apostrophe's REST API as the editor: every document has a translated draft in every
 * locale, nothing new got published, the texts are really in the target language (de-CH
 * without "ß"), formatting and links survived, no protocol leftovers, and localizing again
 * updates the same drafts instead of duplicating them.
 * See "End-to-end tests" in docs/DEVELOPER.md.
 *
 *   BASE_URL=http://127.0.0.1:8081 EDITOR_EMAIL=… EDITOR_PASSWORD=… node tests/e2e/live.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const B = (process.env.BASE_URL ?? 'http://127.0.0.1:8081').replace(/\/$/, '');
const need = (name) => process.env[name] || (() => { throw new Error(`Set ${name}`); })();
const artifacts = fileURLToPath(new URL('./artifacts/', import.meta.url));
mkdirSync(artifacts, { recursive: true });
const SOURCE = 'en';

const failures = [];
function check(name, ok, detail = '') {
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
	if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
	return ok;
}

// Common words, to tell the target languages apart. Lower case, whole words.
const STOPWORDS = {
	en: ['the', 'and', 'is', 'are', 'with', 'for', 'you', 'your', 'our', 'of', 'to', 'we', 'who', 'what', 'in', 'on', 'from'],
	de: ['der', 'die', 'das', 'und', 'ist', 'sind', 'mit', 'für', 'sie', 'ihre', 'ihr', 'unser', 'unsere', 'unserer', 'wir', 'eine', 'ein', 'den', 'zu', 'von', 'was', 'wird', 'auf', 'um'],
	fr: ['le', 'la', 'les', 'et', 'est', 'sont', 'avec', 'pour', 'vous', 'votre', 'vos', 'notre', 'nos', 'nous', 'des', 'une', 'un', 'du', 'de', 'qui', 'que', 'dans', 'en'],
	it: ['il', 'lo', 'la', 'gli', 'e', 'è', 'sono', 'con', 'per', 'lei', 'sua', 'suo', 'nostro', 'nostra', 'noi', 'una', 'un', 'del', 'della', 'di', 'che', 'chi', 'nel', 'nella'],
};
const words = (text) => text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
const score = (text, lang) => words(text).filter((w) => STOPWORDS[lang].includes(w)).length;
const plain = (v) => String(v ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
const count = (haystack, needle) => String(haystack ?? '').split(needle).length - 1;
const LEFTOVERS = ['data-st-id', 'data-st-ph', 'st-ph-'];
const FORMATTING = [['links', '<a '], ['bold', '<strong'], ['italics', '<em'], ['link targets', 'href="https://www.supertext.com"']];

// --- Apostrophe's REST API, as the editor ----------------------------------------------------
let token;
async function api(path) {
	const res = await fetch(`${B}/api/v1/${path}`, { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status}`);
	return res.json();
}
async function login() {
	const res = await fetch(`${B}/api/v1/@apostrophecms/login/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username: need('EDITOR_EMAIL'), password: need('EDITOR_PASSWORD') }),
	});
	token = res.ok ? (await res.json()).token : null;
	return Boolean(token);
}
/** Pages and articles of a locale and mode (archive excluded), by aposDocId. */
async function docs(locale, mode = 'draft') {
	const pages = (await api(`@apostrophecms/page?aposLocale=${locale}&aposMode=${mode}&all=1&flat=1`)).results
		.filter((p) => p.type !== '@apostrophecms/archive-page' && !p.archived);
	const articles = (await api(`article?aposLocale=${locale}&aposMode=${mode}&perPage=100`)).results;
	// The page list leaves out the areas of child pages: read every document on its own.
	const full = [
		...(await Promise.all(pages.map((p) => api(`@apostrophecms/page/${encodeURIComponent(p._id)}`)))),
		...(await Promise.all(articles.map((a) => api(`article/${encodeURIComponent(a._id)}`)))),
	];
	return new Map(full.map((d) => [d.aposDocId, d]));
}
/** Rich-text widget contents of a document, in schema order (areas, nested widgets). */
function richTexts(doc) {
	const out = [];
	(function walk(v) {
		if (Array.isArray(v)) return v.forEach(walk);
		if (!v || typeof v !== 'object') return;
		if (v.type === '@apostrophecms/rich-text' && typeof v.content === 'string') out.push(v.content);
		for (const [k, sub] of Object.entries(v)) if (!k.startsWith('_')) walk(sub);
	})(doc);
	return out;
}
/** Paragraph-level text units of a rich text (innermost block elements), else the whole. */
function blocks(html) {
	const found = [...html.matchAll(/<(p|h[1-6]|li|blockquote|td|th|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
	return found.length ? found : [html];
}
/** The translatable fields of a document as [name, value] (value may contain HTML). */
function fields(doc) {
	const out = [['title', doc.title]];
	if (typeof doc.summary === 'string' && doc.summary.trim()) out.push(['summary', doc.summary]);
	richTexts(doc).forEach((html, w) => blocks(html).forEach((b, i) => out.push([`rich text ${w + 1} block ${i + 1}`, b])));
	return out.filter(([, v]) => plain(v).trim());
}

// --- Setup -------------------------------------------------------------------------------
if (!check('editor can log in (DEMO_EDITOR_*)', await login())) throw new Error(failures.join('\n'));
const locales = Object.keys((await api('@apostrophecms/i18n/locales').catch(() => null)) ?? {});
const targets = (locales.length ? locales : ['de', 'fr', 'it']).filter((l) => l !== SOURCE);
const source = await docs(SOURCE);
const sourceList = [...source.values()];
console.log(`English: ${sourceList.map((d) => `${d.type} "${d.title}"`).join(', ')}; targets: ${targets.join(', ')}`);
check('demo has target locales', targets.length > 0);
check('demo has English sample content', sourceList.some((d) => d.type === 'article') && sourceList.some((d) => d.slug === '/swiss-chocolate'));
for (const locale of targets) {
	const there = await docs(locale);
	const done = sourceList.filter((s) => there.get(s.aposDocId) && fields(there.get(s.aposDocId)).length > 1);
	check(`fresh demo: nothing localized into ${locale} yet`, done.length === 0, done.map((d) => d.title).join(', '));
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'en-US' });
page.setDefaultTimeout(60_000);

await page.goto(`${B}/login`);
await page.waitForSelector('input[type=password]', { timeout: 120_000 });
await page.locator('input:not([type=password])').first().fill(need('EDITOR_EMAIL'));
await page.locator('input[type=password]').fill(need('EDITOR_PASSWORD'));
await page.keyboard.press('Enter');
await page.waitForSelector('[data-apos-test=adminBar]');

const settle = async (ms = 1200) => {
	await page.locator('#apos-busy .apos-is-busy').waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {});
	await page.waitForTimeout(ms);
};

/** Opens the document's "More Options" menu: pages on the page itself, articles in the manager. */
async function openMenu(doc) {
	if (doc.type === 'article') {
		await page.goto(`${B}/`);
		await settle();
		await page.locator('[data-apos-test=adminBar]').getByRole('button', { name: 'Articles', exact: true }).click();
		const row = page.locator('.apos-modal tr', { hasText: doc.title });
		await row.waitFor();
		await row.getByRole('button', { name: 'More Options' }).click();
	} else {
		await page.goto(`${B}${doc.slug}`);
		await settle(1500);
		const edit = page.getByRole('button', { name: 'Edit', exact: true });
		if (await edit.isVisible()) {
			await edit.click();
			await settle();
		}
		await page.getByRole('button', { name: 'More Options' }).first().click();
	}
	await page.waitForTimeout(600);
}

/** Apostrophe keeps notifications until they are closed, across page loads. */
async function dismissNotifications() {
	const close = page.locator('.apos-notification').getByRole('button', { name: 'Close Notification' });
	while (await close.count()) {
		await close.first().click().catch(() => {});
		await page.waitForTimeout(300);
	}
}

/** "Localize…" with every other locale and "Translate text content". */
async function localize(doc, label) {
	const tag = `${label}: ${doc.type} "${doc.title}"`;
	await dismissNotifications();
	await openMenu(doc);
	await page.getByText(/^\s*Localize/).filter({ visible: true }).first().click();
	const modal = page.locator('.apos-modal__inner').last();
	await modal.getByText('Select All').click();
	await page.waitForTimeout(400);
	await modal.getByRole('button', { name: /Next/ }).click();
	await modal.getByText('Translate text content').click();
	await page.locator('.apos-wizard__translation-spinner').waitFor({ state: 'detached' }).catch(() => {});
	await page.waitForTimeout(800);
	const wizardError = (await modal.locator('.apos-wizard__translation-error').allTextContents()).join(' ').trim();
	check(`${tag}: every locale offered for translation`, !wizardError, wizardError);
	const started = Date.now();
	await modal.getByRole('button', { name: 'Localize Content' }).click();
	const success = page.getByText(/documents? successfully localized/);
	const report = page.getByText(/could not be localized/);
	await success.or(report).first().waitFor({ timeout: 900_000 });
	await page.waitForTimeout(500);
	const file = `${artifacts}${label}-${doc.type.replace(/\W+/g, '-')}-${doc.aposDocId}.png`;
	await page.screenshot({ path: file, fullPage: true });
	console.log(`${tag}: ${Math.round((Date.now() - started) / 1000)} s`);
	const notifications = (await page.locator('.apos-notification').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
	const ok = await success.first().isVisible();
	check(`${tag}: localized into every locale`, ok && notifications.some((n) => n.includes(`${targets.length} document`)), notifications.join(' | '));
	const errors = notifications.filter((n) => /supertext|error|fail|unable/i.test(n));
	check(`${tag}: no error shown`, !(await report.first().isVisible()) && errors.length === 0, errors.join(' | '));
	await page.keyboard.press('Escape').catch(() => {});
}

async function localizeAll(label) {
	for (const doc of sourceList) await localize(doc, label);
}

// --- First translation -------------------------------------------------------------------
await localizeAll('first-run');
const first = {};
for (const locale of targets) {
	first[locale] = { draft: await docs(locale), published: await docs(locale, 'published') };
	const lang = locale.toLowerCase().split(/[-_]/)[0];
	const { draft, published } = first[locale];
	let total = 0;
	let changed = 0;
	let text = '';
	for (const s of sourceList) {
		const t = draft.get(s.aposDocId);
		const tag = `${locale}: ${s.type} "${s.title}"`;
		if (!check(`${tag}: translated draft exists`, Boolean(t))) continue;
		const pub = published.get(s.aposDocId);
		check(`${tag}: translation not published`, !pub || (pub.title !== t.title && pub.updatedAt !== t.updatedAt), pub ? `published title "${pub.title}"` : '');

		const sf = fields(s);
		const tf = new Map(fields(t));
		check(`${tag}: same number of text fields`, sf.length === fields(t).length, `${fields(t).length}/${sf.length}`);
		for (const [name, sv] of sf) {
			total++;
			const tv = tf.get(name);
			if (!check(`${tag}: ${name} filled`, Boolean(tv && plain(tv).trim()))) continue;
			if (tv !== sv) changed++;
			else console.log(`note ${tag}: ${name} unchanged ("${plain(sv).trim()}")`);
			text += ` ${plain(tv)}`;
		}
		const all = JSON.stringify(t);
		const left = LEFTOVERS.filter((l) => all.includes(l));
		check(`${tag}: no protocol leftovers`, left.length === 0, left.join(', '));
		const sHtml = richTexts(s).join('');
		const tHtml = richTexts(t).join('');
		for (const [what, needle] of FORMATTING) {
			if (count(sHtml, needle)) check(`${tag}: keeps its ${what}`, count(tHtml, needle) === count(sHtml, needle), `${count(tHtml, needle)}/${count(sHtml, needle)}`);
		}
		if (t.slug !== s.slug) console.log(`note ${tag}: slug ${t.slug}`);
	}
	check(`${locale}: texts were changed by the translation`, total > 0 && changed / total >= 0.8, `${changed}/${total} fields`);
	if (STOPWORDS[lang]) {
		const scores = Object.fromEntries(Object.keys(STOPWORDS).map((l) => [l, score(text, l)]));
		const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
		check(`${locale}: text is in the target language`, best === lang, JSON.stringify(scores));
	}
	if (lang === 'de') check(`${locale}: Swiss German spelling (no "ß")`, !text.includes('ß'));
}

// --- Translating again updates in place ---------------------------------------------------
await localizeAll('second-run');
for (const locale of targets) {
	const before = first[locale].draft;
	const after = await docs(locale);
	const ids = (m) => [...m.values()].map((d) => d._id).sort().join(',');
	check(`${locale}: localizing again updates the drafts in place (no duplicates)`, ids(before) === ids(after), `${before.size} → ${after.size} documents`);
	const stale = sourceList.filter((s) => before.get(s.aposDocId) && after.get(s.aposDocId)?.updatedAt === before.get(s.aposDocId).updatedAt);
	check(`${locale}: every draft was updated again`, stale.length === 0, stale.map((d) => d.title).join(', '));
	const lost = sourceList.filter((s) => {
		const t = after.get(s.aposDocId);
		return !t || fields(t).length !== fields(s).length || fields(t).some(([, v]) => !plain(v).trim());
	});
	check(`${locale}: still translated after the second run`, lost.length === 0, lost.map((d) => d.title).join(', '));
}

await browser.close();

if (failures.length) {
	console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
	process.exit(1);
}
console.log('\nAll end-to-end checks passed.');
