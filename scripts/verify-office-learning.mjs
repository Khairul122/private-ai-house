// Isolated browser fixtures only: node scripts/verify-office-learning.mjs [output-directory]
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const { chromium } = createRequire(new URL('../apps/server/package.json', import.meta.url))('playwright-core');
const base = new URL(process.env.FVH_E2E_URL ?? 'http://127.0.0.1:5174');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Audit target must be loopback');
const output = resolve(process.argv[2] ?? '.local/office-learning-fixtures');
await mkdir(output, { recursive: true });
const results = [];
const interceptedWrites = [];
const unexpectedWrites = [];
const pageErrors = [];
const fixture = () => ({
  available: true, enabled: true, busy: false, reason: 'DATA UJI: Hermes siap untuk pengujian antarmuka.',
  intervalMinutes: 60, sessionsToday: 0, dailyLimit: 4, nextRunAt: null, current: null,
  sessions: [
    { id: 'fixture-session-a', topic: 'FIXTURE: Pelajaran pengujian antarmuka', participantIds: ['qa-engineer', 'knowledge-curator'], state: 'completed', startedAt: '2026-10-21T02:00:00.000Z', turns: [{ employeeId: 'qa-engineer', message: 'DATA UJI: periksa keadaan gagal dan kosong.' }], error: null },
    { id: 'fixture-session-b', topic: 'FIXTURE: Istirahat dan ritme kerja', participantIds: ['market-scout', 'chief-of-staff'], state: 'completed', startedAt: '2026-10-21T01:00:00.000Z', turns: [{ employeeId: 'market-scout', message: 'DATA UJI: jeda singkat menjaga ritme kerja.' }], error: null },
  ],
  memories: [
    { sessionId: 'fixture-session-a', employeeId: 'qa-engineer', lesson: 'FIXTURE: Verifikasi kondisi error.', createdAt: '2026-10-21T02:01:00.000Z' },
    { sessionId: 'fixture-session-b', employeeId: 'market-scout', lesson: 'FIXTURE: Ambil jeda singkat.', createdAt: '2026-10-21T01:01:00.000Z' },
  ],
});
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-webgl'] });
const deadline = setTimeout(() => {
  console.error('FAIL: browser audit exceeded 90 seconds');
  void browser.close().finally(() => process.exit(1));
}, 90_000);
deadline.unref();
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
    context.setDefaultTimeout(8_000);
    context.setDefaultNavigationTimeout(12_000);
    let data = fixture();
    let failing = false;
    await context.addInitScript(() => {
      // Polling remains usable; fixtures never open a live event connection.
      window.EventSource = class extends EventTarget { readyState = 2; close() {} };
    });
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const write = { viewport: viewport.name, path: url.pathname, method, body: request.postDataJSON() };
        interceptedWrites.push(write);
        if (url.pathname === '/api/office-learning/enabled' && method === 'PUT') data.enabled = write.body.enabled;
        else if (url.pathname === '/api/office-learning/run' && method === 'POST') data = { ...data, busy: true, reason: 'DATA UJI: sesi dimulai.', current: { participantIds: ['qa-engineer', 'knowledge-curator'], topic: 'FIXTURE: sesi berjalan' } };
        else { unexpectedWrites.push(write); return route.abort(); }
        return route.fulfill({ json: data });
      }
      if (url.pathname === '/api/office-learning') return route.fulfill(failing ? { status: 503, json: { error: 'Fixture unavailable' } } : { json: data });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'Isolated fixture: source unavailable' } });
      if (url.origin !== base.origin) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push({ viewport: viewport.name, message: error.message }));
    const card = page.locator('.office-learning');
    async function check(name, run) {
      try { await run(); results.push({ name: `${viewport.name}: ${name}`, ok: true }); console.log(`PASS ${viewport.name}: ${name}`); }
      catch (error) { results.push({ name: `${viewport.name}: ${name}`, ok: false, error: error.message }); console.error(`FAIL ${viewport.name}: ${name}: ${error.message}`); }
    }
    async function refresh() {
      await page.getByRole('button', { name: 'Perbarui', exact: true }).click();
    }
    async function screenshot(name) {
      await page.evaluate(() => {
        let banner = document.querySelector('#fixture-banner');
        if (!banner) { banner = document.createElement('div'); banner.id = 'fixture-banner'; document.body.append(banner); }
        banner.textContent = 'DATA UJI — FIXTURE BROWSER, BUKAN STATUS NYATA';
        banner.setAttribute('style', 'position:fixed;inset:0 0 auto;z-index:99999;background:#693600;color:white;text-align:center;font:700 12px sans-serif;padding:6px;pointer-events:none');
      });
      await page.screenshot({ path: resolve(output, `FIXTURE-${viewport.name}-${name}.png`) });
    }
    await page.goto(new URL('/agents', base).href, { waitUntil: 'domcontentloaded' });
    await check('populated, layout and fixture screenshot', async () => {
      await card.getByText('FIXTURE: Verifikasi kondisi error.').waitFor();
      assert.equal(await card.locator('.office-conversation').count(), 2);
      assert.equal(await card.locator('.office-memories > li').count(), 2);
      assert(await card.getByText('Catatan AI belum diverifikasi.', { exact: false }).isVisible());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      assert(await card.evaluate(element => element.scrollWidth <= element.clientWidth + 2), 'learning card fits viewport');
      await card.scrollIntoViewIfNeeded();
      await screenshot('populated');
    });
    await check('employee filter and keyboard access', async () => {
      const filter = card.getByLabel('Karyawan', { exact: true });
      await filter.focus();
      assert(await filter.evaluate(element => document.activeElement === element));
      await filter.selectOption('qa-engineer');
      assert.equal(await card.locator('.office-conversation').count(), 1);
      assert.equal(await card.locator('.office-memories > li').count(), 1);
      assert.equal(await card.getByText('FIXTURE: Istirahat dan ritme kerja', { exact: false }).count(), 0);
      await filter.selectOption('profile-editor');
      await card.getByText('Belum ada percakapan tersimpan untuk pilihan ini.').waitFor();
      await card.getByText('Belum ada pelajaran tersimpan untuk pilihan ini.').waitFor();
      await screenshot('filtered-empty');
      await filter.selectOption('');
    });
    await check('error removes stale conversations and recovers', async () => {
      failing = true; await refresh();
      await page.getByText('Percakapan dan memori tim tidak tersedia.', { exact: true }).waitFor();
      assert.equal(await card.count(), 0, 'failed query must hide cached session and memory data');
      await screenshot('unavailable');
      failing = false; await refresh();
      await card.getByText('FIXTURE: Verifikasi kondisi error.').waitFor();
    });
    await check('empty history', async () => {
      data = { ...fixture(), sessions: [], memories: [] }; await refresh();
      await card.getByText('Belum ada percakapan tersimpan untuk pilihan ini.').waitFor();
      await card.getByText('Belum ada pelajaran tersimpan untuk pilihan ini.').waitFor();
      await screenshot('empty');
    });
    await check('run and enable controls never reach backend', async () => {
      data = fixture(); await refresh();
      const pause = card.getByRole('button', { name: 'Jeda belajar', exact: true });
      await pause.click();
      await card.getByRole('button', { name: 'Aktifkan belajar', exact: true }).waitFor();
      assert(await card.getByRole('button', { name: 'Mulai sesi', exact: true }).isDisabled());
      await card.getByRole('button', { name: 'Aktifkan belajar', exact: true }).click();
      await pause.waitFor();
      await card.getByRole('button', { name: 'Mulai sesi', exact: true }).click();
      await card.getByText('DATA UJI: sesi dimulai.', { exact: true }).waitFor();
      assert(await card.getByRole('button', { name: 'Mulai sesi', exact: true }).isDisabled());
      assert.deepEqual(interceptedWrites.filter(write => write.viewport === viewport.name).map(({ method, path, body }) => ({ method, path, body })), [
        { method: 'PUT', path: '/api/office-learning/enabled', body: { enabled: false } },
        { method: 'PUT', path: '/api/office-learning/enabled', body: { enabled: true } },
        { method: 'POST', path: '/api/office-learning/run', body: {} },
      ]);
    });
    await check('unavailable, daily limit and cooldown block starts', async () => {
      for (const blocked of [{ available: false }, { sessionsToday: 4 }, { nextRunAt: new Date(Date.now() + 60_000).toISOString() }]) {
        data = { ...fixture(), ...blocked }; await refresh();
        await page.waitForFunction(() => document.querySelector('.office-learning-actions button')?.disabled);
        assert(await card.getByRole('button', { name: 'Mulai sesi', exact: true }).isDisabled());
      }
    });
    await context.close();
  }
  assert.deepEqual(unexpectedWrites, [], 'Only explicit fixture mutations are allowed');
  assert.deepEqual(pageErrors, [], 'No uncaught browser errors');
} finally {
  clearTimeout(deadline);
  await writeFile(resolve(output, 'FIXTURE-report.json'), JSON.stringify({ source: 'Isolated browser fixtures, not runtime data', base: base.origin, webgl: 'disabled', results, interceptedWrites, unexpectedWrites, pageErrors }, null, 2));
  await browser.close();
}
if (results.some(result => !result.ok)) process.exitCode = 1;
