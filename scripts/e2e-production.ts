// Read-only UI sweep of the running production app (pnpm private:start). Opens every card, never clicks write actions.
// Run: pnpm --filter @fvh/server exec tsx ../../scripts/e2e-production.ts [screenshotDir]
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { BrowserType } from '../apps/server/node_modules/playwright-core/index.js';

const { chromium } = createRequire(new URL('../apps/server/package.json', import.meta.url))('playwright-core') as { chromium: BrowserType };

const BASE = process.env.FVH_E2E_URL ?? 'http://127.0.0.1:3001';
const ROUTES = ['/', '/overview', '/agents', '/tasks', '/calendar', '/opportunities', '/pipeline', '/inbox', '/work', '/profile', '/policy', '/knowledge', '/activity', '/capabilities', '/projects-co-id', '/operations'];
const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let failures = 0;
for (const route of ROUTES) {
  const problems: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`); };
  const onError = (e: Error) => problems.push(`pageerror: ${e.message.slice(0, 200)}`);
  const onResponse = (r: { url(): string; status(): number; request(): { method(): string } }) => { if (r.url().includes('/api/') && r.status() >= 400) problems.push(`api ${r.request().method()} ${r.status()} ${r.url().replace(BASE, '')}`); };
  page.on('console', onConsole); page.on('pageerror', onError); page.on('response', onResponse);
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  // Cards load several queries; wait until loading indicators are gone or 25 s pass.
  await page.waitForFunction(() => !document.querySelector('.loading-panel, [role=status][aria-live]'), undefined, { timeout: 25_000 }).catch(() => problems.push('masih memuat setelah 25 dtk'));
  await page.waitForTimeout(1500);
  const alerts = (await page.locator('[role=alert]').allInnerTexts()).map(t => t.trim()).filter(Boolean);
  const heading = (await page.locator('.vo3d-sheet h2, main h2, h1').first().innerText().catch(() => '')).trim();
  if (shots) await page.screenshot({ path: join(shots, `${route === '/' ? 'office' : route.slice(1)}.png`) });
  page.off('console', onConsole); page.off('pageerror', onError); page.off('response', onResponse);
  if (problems.length) failures += 1;
  console.log(`${problems.length ? 'FAIL' : 'OK  '} ${route.padEnd(16)} ${heading.slice(0, 60)}`);
  for (const p of problems) console.log(`       ${p}`);
  for (const a of alerts) console.log(`       alert: ${a.replace(/\s+/g, ' ').slice(0, 220)}`);
}
await browser.close();
console.log(failures ? `${failures} halaman bermasalah.` : 'Semua halaman termuat tanpa error.');
process.exitCode = failures ? 1 : 0;
