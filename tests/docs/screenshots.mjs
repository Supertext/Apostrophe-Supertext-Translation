#!/usr/bin/env node
/**
 * Screenshots for docs/USER_GUIDE.md and docs/INSTALLATION.md, taken from the demo in a
 * headless browser. Run against a freshly set-up demo (nothing localized yet) whose module
 * talks to the stand-in API (stand-in.mjs), so the pages show real Supertext output:
 *
 *   BASE_URL=http://127.0.0.1:3000 DEMO_EDITOR_EMAIL=… DEMO_EDITOR_PASSWORD=… \
 *   DEMO_ADMIN_EMAIL=… DEMO_ADMIN_PASSWORD=… npm run screenshots
 *
 * Writes docs/images/*.png at 1× scale, cropped to the relevant part. The status screen
 * shows the live API address instead of the stand-in's (and example.ch as ping address).
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const base = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const out = new URL('../../docs/images/', import.meta.url).pathname
mkdirSync(out, { recursive: true })
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

const shot = async (page, name, target, pad = 0) => {
  const box = typeof target === 'string' ? await page.locator(target).last().boundingBox() : target
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: Math.min(1400, box.width + 2 * pad),
    height: Math.min(900, box.height + 2 * pad)
  }
  await page.screenshot({ path: out + name, clip })
  console.log('docs/images/' + name)
}

async function login (user, password) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 })
  await page.goto(base + '/login')
  await page.waitForSelector('input[type=password]', { timeout: 120000 })
  await page.locator('input:not([type=password])').first().fill(user)
  await page.locator('input[type=password]').fill(password)
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-apos-test=adminBar]', { timeout: 60000 })
  return page
}

async function openLocalize (page, path) {
  await page.goto(base + path)
  await page.locator('#apos-busy .apos-is-busy').waitFor({ state: 'detached', timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(1500)
  // The page may already be in edit mode (Apostrophe remembers it per session).
  const edit = page.getByRole('button', { name: 'Edit', exact: true })
  if (await edit.isVisible()) {
    await edit.click()
    await page.waitForTimeout(1500)
  }
  await page.getByRole('button', { name: 'More Options' }).first().click()
  await page.waitForTimeout(800)
}

const modal = '.apos-modal__inner'

// --- Editor: translate a page with "Localize..." ---------------------------------------
let page = await login(process.env.DEMO_EDITOR_EMAIL, process.env.DEMO_EDITOR_PASSWORD)
// RESUME=1 skips the first localization (for re-running against a demo that has it already).
if (!process.env.RESUME) {
await openLocalize(page, '/swiss-chocolate')
await shot(page, 'localize-menu.png', { x: 1000, y: 56, width: 400, height: 330 })
await page.getByText('Localize', { exact: false }).first().click()
await page.waitForTimeout(1500)
await page.getByText('Select All').click()
await page.waitForTimeout(500)
await shot(page, 'localize-locales.png', modal)
await page.getByRole('button', { name: /Next/ }).click()
await page.waitForTimeout(1000)
await page.getByText('Translate text content').click()
await page.waitForTimeout(1000)
await shot(page, 'localize-translate.png', modal)
await page.getByRole('button', { name: 'Localize Content' }).click()
await page.getByText('successfully localized').waitFor({ timeout: 180000 })
await page.waitForTimeout(500)
await shot(page, 'localize-done.png', { x: 400, y: 820, width: 600, height: 80 })

// The German draft (new localizations are drafts, so they are only visible when logged in).
await page.goto(base + '/de/schweizer-schokolade-weltweit-versandt?aposMode=draft')
await page.waitForTimeout(2500)
await shot(page, 'translated-page-german.png', { x: 0, y: 0, width: 1400, height: 720 })
}

// Localizing again into a locale that already has the page.
await openLocalize(page, '/swiss-chocolate')
await page.getByText('Localize', { exact: false }).first().click()
await page.waitForTimeout(1500)
// Apostrophe has no overwrite warning for the document itself: the filled dots mark the
// locales the page already exists in, and localizing again replaces that draft.
await page.getByText('Deutsch', { exact: false }).first().click()
await page.waitForTimeout(500)
await shot(page, 'localize-again.png', modal)
await page.getByRole('button', { name: 'Cancel' }).first().click()
await page.close()

// --- Administrator: locales and the Supertext status screen ---------------------------
page = await login(process.env.DEMO_ADMIN_EMAIL, process.env.DEMO_ADMIN_PASSWORD)
await page.goto(base + '/')
await page.waitForTimeout(1500)
await page.locator('[data-apos-test=localePickerTrigger]').first().click()
await page.waitForTimeout(1000)
await shot(page, 'locales.png', { x: 900, y: 0, width: 500, height: 330 })
await page.keyboard.press('Escape')
await page.goto(base + '/')
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Supertext', exact: true }).first().click()
await page.locator('.supertext-status__body').waitFor({ timeout: 30000 })
await page.locator('.supertext-test').click()
await page.locator('.supertext-test-result').waitFor({ timeout: 30000 })
// Show the live API address, not the stand-in's, and a public site instead of the local one.
await page.evaluate(() => {
  for (const el of document.querySelectorAll('.supertext-api-url')) el.textContent = 'https://api.supertext.com/v1/'
  for (const el of document.querySelectorAll('.supertext-ping-url')) el.textContent = 'https://www.example.ch/api/v1/supertext-apostrophe-translation/ping'
})
await shot(page, 'status.png', { x: 474, y: 0, width: 926, height: 820 })
// The language mapping: one combo box per locale, then "Save languages".
await page.locator('.supertext-languages').scrollIntoViewIfNeeded()
await page.locator('.supertext-save-languages').click()
await page.locator('.supertext-save-result').waitFor({ timeout: 30000 })
await page.mouse.move(0, 0)
await page.waitForTimeout(1000)
await shot(page, 'status-languages.png', '.supertext-languages', 8)
await page.close()
await browser.close()
