/**
 * Screenshots van de belangrijkste schermen op alle formaten (webapp).
 *
 *   BB_TEST_EMAIL=… BB_TEST_WACHTWOORD=… BB_URL=http://localhost:8099 \
 *   PLAYWRIGHT_CORE=/pad/naar/playwright-core node scripts/screenshots-formaten.mjs
 *
 * Schrijft naar docs/screenshots/formaten/<formaat>/<scherm>.png. Alleen voor
 * een testbedrijf; er wordt niets gewijzigd (alleen bekeken).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const BASIS = process.env.BB_URL ?? 'http://localhost:8099';
const UIT = new URL('../docs/screenshots/formaten/', import.meta.url).pathname;

export const FORMATEN = [
  ['iphone-se', 375, 667],
  ['iphone-13', 390, 844],
  ['iphone-17-pro-max', 440, 956],
  ['ipad-mini-staand', 744, 1133],
  ['ipad-mini-liggend', 1133, 744],
  ['ipad-air-staand', 820, 1180],
  ['ipad-air-liggend', 1180, 820],
  ['ipad-pro-12-9-staand', 1024, 1366],
  ['ipad-pro-12-9-liggend', 1366, 1024],
];

const SCHERMEN = (process.env.BB_SCHERMEN ?? '').split(',').filter(Boolean);
const ALLE = [
  ['vandaag', '/today'],
  ['agenda', '/planning'],
  ['werkbonnen', '/work-orders'],
  ['relaties', '/customers'],
  ['uren', '/hours'],
  ['menu', '/menu'],
  ['planning', '/planningbord'],
  ['projecten', '/projects'],
  ['pipeline', '/pipeline'],
  ['offertes', '/offers'],
  ['facturen', '/invoices'],
  ['kosten', '/expenses'],
  ['materialen', '/materialen'],
  ['activiteiten', '/activities'],
  ['instellingen', '/settings'],
  ...(process.env.BB_EXTRA ?? '').split(',').filter(Boolean).map((x) => x.split('=')),
];
const lijst = SCHERMEN.length ? ALLE.filter(([n]) => SCHERMEN.includes(n)) : ALLE;

const exe = process.env.CHROME ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
await page.goto(`${BASIS}/login`);
await page.waitForTimeout(6000);
const inputs = page.locator('input');
await inputs.nth(0).fill(process.env.BB_TEST_EMAIL);
await inputs.nth(1).fill(process.env.BB_TEST_WACHTWOORD);
await inputs.nth(1).press('Enter');
await page.waitForTimeout(12000);

for (const [formaat, w, h] of FORMATEN) {
  mkdirSync(join(UIT, formaat), { recursive: true });
  await page.setViewportSize({ width: w, height: h });
  for (const [naam, pad] of lijst) {
    await page.goto(`${BASIS}${pad}`);
    await page.waitForTimeout(Number(process.env.BB_WACHT ?? 9000));
    await page.screenshot({ path: join(UIT, formaat, `${naam}.png`) });
    // Horizontaal scrollen = iets valt buiten beeld.
    const breder = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`${formaat}\t${naam}\t${breder > 1 ? `TE BREED +${breder}px` : 'ok'}`);
  }
}
await browser.close();
