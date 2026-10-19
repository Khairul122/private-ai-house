// Run against a running local build: node scripts/verify-card-remodel.mjs [screenshot-directory]
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const { chromium } = createRequire(new URL('../apps/server/package.json', import.meta.url))('playwright-core');
const base = new URL(process.env.FVH_E2E_URL ?? 'http://127.0.0.1:3001');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'E2E target must be loopback');
const output = resolve(process.argv[2] ?? '.local/card-remodel-e2e');
await mkdir(output, { recursive: true });
const allRoutes = ['/overview', '/agents', '/tasks', '/calendar', '/opportunities', '/pipeline', '/inbox', '/work', '/profile', '/policy', '/knowledge', '/activity', '/capabilities', '/projects-co-id', '/operations'];
const targeted = Boolean(process.env.FVH_E2E_ROUTES);
const fixturesOnly = process.env.FVH_E2E_FIXTURES_ONLY === '1';
const mobileOnly = process.env.FVH_E2E_MOBILE_ONLY === '1';
const routes = process.env.FVH_E2E_ROUTES?.split(',') ?? allRoutes;
assert(routes.every(route => allRoutes.includes(route)), 'Targeted routes must be known cards');
const results = [];
const blockedWrites = [];
const pendingApi = new Map();
const apiReads = new Map();
// Cards and overlays do not need the 3D renderer; software WebGL exhausts RAM on the owner's machine.
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-webgl'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
await context.route('**/*', route => {
  const request = route.request();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
    blockedWrites.push({ method: request.method(), path: new URL(request.url()).pathname });
    return route.abort();
  }
  return route.continue();
});

async function check(name, run) {
  try { await run(); results.push({ name, ok: true }); console.log(`PASS ${name}`); }
  catch (error) {
    const current = context.pages()[0];
    const dataStatus = await current?.locator('.sheet-data-status').textContent({ timeout: 1000 }).catch(() => null);
    const pending = [...pendingApi.values()].map(request => ({ path: request.path, elapsedMs: Date.now() - request.started }));
    results.push({ name, ok: false, error: error.message, dataStatus, pending });
    console.log(`FAIL ${name}: ${error.message}; ${dataStatus ?? ''}; pending=${JSON.stringify(pending)}`);
    if (current) await current.screenshot({ path: resolve(output, `failed-${name.replace(/[^a-z0-9]+/gi, '-')}.png`) }).catch(() => {});
  }
  await writeReport();
}

async function writeReport() {
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ base: base.origin, webgl: 'disabled; card and overlay checks only', results, blockedWrites, apiReads: Object.fromEntries(apiReads) }, null, 2));
}

async function assertFits(page, dialog = false) {
  const problem = await page.evaluate(isDialog => {
    const width = window.innerWidth;
    if (document.documentElement.scrollWidth > width + 2) return 'page overflows horizontally';
    if (isDialog) {
      const sheet = document.querySelector('.vo3d-sheet');
      const rect = sheet.getBoundingClientRect();
      if (rect.left < -1 || rect.right > width + 1 || rect.top < -1 || rect.bottom > window.innerHeight + 1) return 'card exceeds viewport';
      if (sheet.scrollWidth > sheet.clientWidth + 2) return 'card overflows horizontally';
      const body = document.querySelector('.vo3d-sheet-body');
      if (body.scrollWidth > body.clientWidth + 2) return 'card body overflows horizontally';
      return null;
    }
    const selectors = ['.vo3d-card', '.vo3d-roster-toggle', '.vo3d-roster', '.vo3d-tools', '.vo3d-dock', '.vo3d-seg', '.vo3d-map'];
    const visible = selectors.flatMap(selector => {
      const element = document.querySelector(selector);
      if (!element || !element.checkVisibility() || element.getBoundingClientRect().width === 0) return [];
      return [{ selector, rect: element.getBoundingClientRect() }];
    });
    for (const { selector, rect } of visible) {
      if (rect.left < -1 || rect.right > width + 1 || rect.top < -1 || rect.bottom > window.innerHeight + 1) return `${selector} exceeds viewport`;
    }
    for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i], b = visible[j];
      if (Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > 2 && Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > 2) return `${a.selector} overlaps ${b.selector}`;
    }
    return null;
  }, dialog);
  assert.equal(problem, null, problem ?? 'layout fits');
}

async function waitForCard(page) {
  await page.locator('[role="dialog"]').waitFor();
  await page.waitForFunction(() => !document.querySelector('.vo3d-sheet-body .loading-panel') && !/Memuat sumber|Menunggu data/.test(document.querySelector('.sheet-data-status')?.textContent ?? ''), undefined, { timeout: 45_000 });
}

async function checkOfficePanels(page, viewport) {
  await check(`${viewport.name}: office roster, floors and board menu`, async () => {
    await page.getByRole('button', { name: 'Lantai 2', exact: true }).click();
    await page.getByRole('button', { name: 'Lantai 1', exact: true }).click();
    const toggle = page.locator('.vo3d-roster-toggle');
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    await toggle.click();
    await assertFits(page);
    await toggle.click();
    await page.getByLabel('Menu papan', { exact: true }).click();
    const menu = page.locator('nav[aria-label="Papan Mission Control"]');
    await menu.waitFor({ state: 'visible' });
    const bounds = await menu.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, 'board menu stays within viewport');
    await page.screenshot({ path: resolve(output, `${viewport.name}-board-menu.png`) });
    await page.getByLabel('Menu papan', { exact: true }).click();
    await toggle.click();
    await page.locator('#office-roster button').first().click();
  });
  for (const label of ['Pemilik', 'Agen', 'Aktivitas', 'Kanal']) await check(`${viewport.name}: office ${label} panel`, async () => {
    if (!(await page.locator('[aria-label="Panel detail"]').isVisible())) await page.getByRole('button', { name: 'Pemilik', exact: true }).click();
    await page.getByRole('tab', { name: label, exact: true }).click();
    const panel = page.locator('[aria-label="Panel detail"]');
    const bounds = await panel.boundingBox();
    assert(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, 'office detail panel stays within viewport');
    assert(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 2), 'office panel has no horizontal overflow');
    const disclosure = panel.locator('details').first();
    if (await disclosure.count() && !(await disclosure.evaluate(element => element.open))) await disclosure.locator('summary').first().click();
    await page.screenshot({ path: resolve(output, `${viewport.name}-panel-${label.toLowerCase()}.png`) });
  });
  await page.getByRole('button', { name: 'Tutup panel', exact: true }).click();
}

async function checkOperationsTabs(page, viewport) {
  for (const tab of ['Klien & progres', 'Invoice', 'Jadwal pemilik', 'WhatsApp', 'Google Calendar', 'Laporan tim', 'Bid browser']) await check(`${viewport.name}: operations ${tab}`, async () => {
    await page.getByRole('combobox', { name: /Bagian operasional/ }).selectOption(tab);
    await waitForCard(page);
    const disclosure = page.locator('.vo3d-sheet-body details').first();
    if (await disclosure.count() && !(await disclosure.evaluate(element => element.open))) await disclosure.locator('summary').first().click();
    await assertFits(page, true);
    await page.locator('.vo3d-sheet-body').evaluate(element => element.scrollTo({ top: 0 }));
    await page.screenshot({ path: resolve(output, `${viewport.name}-operations-${tab.toLowerCase().replace(/[^a-z]+/g, '-')}.png`) });
    await assertFocusTrap(page);
  });
}

async function assertFocusTrap(page) {
  await page.evaluate(() => {
    const items = [...document.querySelector('.vo3d-sheet').querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')].filter(element => element.checkVisibility());
    window.cardFocusEdges = { first: items[0], last: items.at(-1) };
    window.cardFocusEdges.last.focus();
  });
  await page.keyboard.press('Tab');
  assert(await page.evaluate(() => window.cardFocusEdges.first === document.activeElement), 'Tab must wrap to the first card control');
  await page.keyboard.press('Shift+Tab');
  assert(await page.evaluate(() => window.cardFocusEdges.last === document.activeElement), 'Shift+Tab must wrap to the last card control');
}

try {
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.name));
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/') || path === '/api/events') return;
    pendingApi.set(request, { path, started: Date.now() });
    const summary = apiReads.get(path) ?? { count: 0, completed: 0, failed: 0, maxMs: 0 };
    summary.count++; apiReads.set(path, summary);
  });
  page.on('requestfinished', request => {
    const pending = pendingApi.get(request);
    if (pending) { const summary = apiReads.get(pending.path); summary.completed++; summary.maxMs = Math.max(summary.maxMs, Date.now() - pending.started); }
    pendingApi.delete(request);
  });
  page.on('requestfailed', request => { const pending = pendingApi.get(request); if (pending) apiReads.get(pending.path).failed++; pendingApi.delete(request); });
  const desktop = { name: 'desktop', width: 1440, height: 900 };
  const mobile = { name: 'mobile', width: 390, height: 844 };
  for (const viewport of fixturesOnly ? [] : mobileOnly ? [mobile] : targeted ? [desktop] : [desktop, mobile]) {
    await page.setViewportSize(viewport);
    await page.goto(base.href, { waitUntil: 'domcontentloaded' });
    await page.locator('[aria-label="Status kantor"]').waitFor();
    await check(`${viewport.name}: office overlay layout`, async () => {
      await page.waitForFunction(() => !document.querySelector('.vo3d-canvas')?.textContent?.includes('Memuat kantor visual') && !document.querySelector('[aria-label="Status kantor"]')?.textContent?.includes('Memuat status kru'), undefined, { timeout: 45_000 });
      await assertFits(page);
      await page.screenshot({ path: resolve(output, `${viewport.name}-office.png`) });
    });
    await check(`${viewport.name}: actual SSE connection`, async () => {
      await page.waitForFunction(() => document.querySelector('[aria-label="Status kantor"]')?.textContent?.includes('Koneksi pembaruan aplikasi terhubung'), undefined, { timeout: 15_000 });
    });
    if (!targeted) await checkOfficePanels(page, viewport);
    await page.getByLabel('Menu papan', { exact: true }).click();
    await page.locator('nav[aria-label="Papan Mission Control"] a[href="/overview"]').click();
    for (const path of routes) {
      await check(`${viewport.name}: ${path}`, async () => {
        if (new URL(page.url()).pathname !== path) {
          const menu = page.locator('.sheet-navigation');
          if (!(await menu.getAttribute('open')) && await menu.getAttribute('open') !== '') await menu.locator('summary').click();
          await menu.locator(`a[href="${path}"]`).click();
        }
        await waitForCard(page);
        const menu = page.locator('.sheet-navigation');
        if (await menu.evaluate(element => element.open)) await menu.locator('summary').click();
        assert.equal(new URL(page.url()).pathname, path, 'card navigation reaches requested route');
        await assertFits(page, true);
        await page.locator('.vo3d-sheet-body').evaluate(element => element.scrollTo({ top: 0 }));
        await page.screenshot({ path: resolve(output, `${viewport.name}-${path.slice(1)}.png`) });
        await assertFocusTrap(page);
      });
    }
    if (new URL(page.url()).pathname === '/operations') await checkOperationsTabs(page, viewport);
    await check(`${viewport.name}: Escape returns to office`, async () => {
      await page.keyboard.press('Escape');
      await page.waitForURL(base.href);
      await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
      assert(await page.evaluate(() => document.activeElement !== document.body && document.activeElement?.checkVisibility()), 'keyboard focus returns to a visible office control');
      await page.screenshot({ path: resolve(output, `${viewport.name}-office-ready.png`) });
    });
  }
  await check('no uncaught page exceptions', async () => assert.deepEqual(pageErrors, []));
  await page.close();

  if (!targeted) {
  // Only this isolated page receives fixture data and a controllable EventSource.
  const fixture = await context.newPage();
  await fixture.addInitScript(() => {
    const sources = [];
    class FixtureEventSource extends EventTarget {
      constructor() {
        super(); sources.push(this); this.readyState = 0;
        queueMicrotask(() => { if (this.readyState !== 2) { this.readyState = 1; this.onopen?.(new Event('open')); } });
      }
      close() { this.readyState = 2; }
    }
    window.EventSource = FixtureEventSource;
    window.emitCardFixtureEvent = (topics = ['pipeline']) => sources.filter(source => source.readyState === 1).forEach(source => source.dispatchEvent(new MessageEvent('change', { data: JSON.stringify({ topics }) })));
  });
  let phase = 'first';
  let reads = 0;
  const fixtureProject = title => ({ id: 'card-e2e-fixture', externalId: 'card-e2e-fixture', source: 'freelancer', title, description: 'Isolated E2E browser fixture; never stored.', clientName: 'E2E fixture', skills: ['TypeScript'], budgetMin: 100, budgetMax: 200, currency: 'USD', projectType: 'fixed', deadlineDays: null, status: 'open', pipelineStatus: 'scored', score: 80, factors: [], briefQuality: 0.8, riskScore: 0.1, latestDraft: null });
  await fixture.route('**/api/pipeline', route => {
    reads++;
    return route.fulfill(phase === 'error' ? { status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Isolated E2E failure' }) } : { json: [fixtureProject(phase === 'first' ? 'E2E initial pipeline snapshot' : 'E2E updated through SSE')] });
  });
  await fixture.goto(new URL('/pipeline', base).href, { waitUntil: 'domcontentloaded' });
  await check('fixture: SSE invalidates pipeline before polling', async () => {
    await fixture.getByRole('heading', { name: 'E2E initial pipeline snapshot' }).waitFor();
    const before = reads;
    phase = 'updated';
    await fixture.evaluate(() => window.emitCardFixtureEvent());
    await fixture.getByRole('heading', { name: 'E2E updated through SSE' }).waitFor({ timeout: 5_000 });
    assert(reads > before, 'SSE must trigger a new GET');
    assert.equal(await fixture.getByRole('heading', { name: 'E2E initial pipeline snapshot' }).count(), 0);
  });
  await check('fixture: failed refresh hides cached pipeline', async () => {
    phase = 'error';
    await fixture.evaluate(() => window.emitCardFixtureEvent());
    await fixture.getByText('Pipeline belum dapat dimuat.', { exact: true }).waitFor({ timeout: 10_000 });
    assert.equal(await fixture.getByRole('heading', { name: 'E2E updated through SSE' }).count(), 0, 'cached data cannot remain presented as live');
    await fixture.screenshot({ path: resolve(output, 'fixture-pipeline-unavailable.png') });
  });
  await check('fixture: retry restores pipeline', async () => {
    phase = 'updated';
    await fixture.getByRole('button', { name: 'Coba lagi', exact: true }).click();
    await fixture.getByRole('heading', { name: 'E2E updated through SSE' }).waitFor();
  });
  let opportunityPhase = 'ready';
  await fixture.route('**/api/projects', route => route.fulfill(opportunityPhase === 'error' ? { status: 503, json: { error: 'Isolated E2E opportunity failure' } } : { json: [fixtureProject('E2E proposal editing')] }));
  let draftReads = 0;
  await fixture.route('**/api/projects/card-e2e-fixture/draft', route => {
    draftReads++;
    return route.fulfill({ json: { draft: { id: 'e2e-draft', projectId: 'card-e2e-fixture', proposal: `E2E stored proposal version ${draftReads}. This fixture never reaches the server.`, proposedPrice: 100 + draftReads, currency: 'USD', durationDays: 14, confidence: 0.8, evidence: [], assumptions: [], status: 'draft_ready', createdAt: '2026-10-20T00:00:00.000Z' } } });
  });
  await check('fixture: proposal edit survives SSE and failed project refresh', async () => {
    await fixture.goto(new URL('/opportunities?project=card-e2e-fixture', base).href, { waitUntil: 'domcontentloaded' });
    const proposal = fixture.getByLabel('Isi proposal');
    await proposal.waitFor();
    const localText = 'E2E local changes that must survive an incoming server update. No save is performed.';
    await proposal.fill(localText);
    await fixture.getByLabel('Harga (USD)', { exact: true }).fill('175');
    const before = draftReads;
    const refreshed = fixture.waitForResponse(response => response.url().endsWith('/api/projects/card-e2e-fixture/draft') && response.status() === 200);
    await fixture.evaluate(() => window.emitCardFixtureEvent());
    await refreshed;
    assert(draftReads > before);
    assert.equal(await proposal.inputValue(), localText);
    assert.equal(await fixture.getByLabel('Harga (USD)', { exact: true }).inputValue(), '175');
    opportunityPhase = 'error';
    await fixture.evaluate(() => window.emitCardFixtureEvent());
    await fixture.getByText('Peluang belum dapat dimuat.', { exact: true }).waitFor();
    assert.equal(await proposal.count(), 0, 'stale project is hidden on error');
    opportunityPhase = 'ready';
    await fixture.locator('.vo3d-sheet-body').getByRole('button', { name: 'Coba lagi', exact: true }).click();
    await proposal.waitFor();
    assert.equal(await proposal.inputValue(), localText, 'unsaved proposal survives parent query error recovery');
    assert.equal(await fixture.getByLabel('Harga (USD)', { exact: true }).inputValue(), '175');
  });
  let profilePhase = 'first';
  const profileData = () => ({ primaryField: profilePhase === 'first' ? 'Fullstack Engineer' : 'Backend Engineer', specializations: ['Python'], language: 'id', currency: 'USD', timezone: 'Asia/Jakarta', minPrice: 100, maxPrice: 800, facts: [{ label: 'API', value: 'Pekerjaan fixture', source: 'Catatan E2E' }] });
  await fixture.route('**/api/profile', route => route.fulfill(profilePhase === 'error' ? { status: 503, json: { error: 'Isolated E2E profile failure' } } : { json: profileData() }));
  await check('fixture: profile edit survives SSE and failed refresh', async () => {
    await fixture.goto(new URL('/profile', base).href, { waitUntil: 'domcontentloaded' });
    const timezone = fixture.getByLabel('Zona waktu', { exact: true });
    await timezone.fill('Asia/Singapore');
    profilePhase = 'updated';
    const refreshed = fixture.waitForResponse(response => response.url().endsWith('/api/profile') && response.status() === 200);
    await fixture.evaluate(() => window.emitCardFixtureEvent(['profile']));
    await refreshed;
    await fixture.locator('.metric strong').filter({ hasText: 'Backend Engineer' }).waitFor();
    assert.equal(await timezone.inputValue(), 'Asia/Singapore');
    profilePhase = 'error';
    await fixture.evaluate(() => window.emitCardFixtureEvent(['profile']));
    await fixture.getByText('Profil belum dapat dimuat.', { exact: true }).waitFor();
    assert.equal(await timezone.count(), 0, 'stale server form is hidden on error');
    profilePhase = 'updated';
    await fixture.locator('.vo3d-sheet-body').getByRole('button', { name: 'Coba lagi', exact: true }).click();
    await timezone.waitFor();
    assert.equal(await timezone.inputValue(), 'Asia/Singapore', 'unsaved profile edit survives error recovery');
  });
  let projectsPhase = 'ready';
  const projectsFixture = { ...fixtureProject('Fixture proyek'), id: 'projects_co_id:abcdef', source: 'projects_co_id', budgetMin: 1000000, budgetMax: 3000000, currency: 'IDR', pipelineStatus: 'draft_ready', createdAt: '2026-10-19T00:00:00Z', closesAt: '2026-10-27T00:00:00Z', url: 'https://projects.co.id/public/browse_projects/view/abcdef/fixture', ownerActionAt: null, latestDraft: { id: 'draft-fixture', projectId: 'projects_co_id:abcdef', proposal: 'Proposal fixture awal yang cukup panjang untuk disalin dan ditinjau.', proposedPrice: 1000000, currency: 'IDR', durationDays: 7, confidence: 0.85, evidence: [], assumptions: [], status: 'draft_ready', createdAt: '2026-10-19T00:00:00Z', author: 'hermes' } };
  await fixture.route('**/api/projects-co-id', route => route.fulfill({ json: null }));
  await fixture.route('**/api/projects-co-id/drafts', route => route.fulfill(projectsPhase === 'error' ? { status: 503, json: { error: 'Isolated E2E projects failure' } } : { json: [projectsFixture] }));
  await check('fixture: projects.co.id edit survives filters and failed refresh', async () => {
    await fixture.goto(new URL('/projects-co-id', base).href, { waitUntil: 'domcontentloaded' });
    const editor = fixture.getByLabel('Proposal untuk Fixture proyek');
    await fixture.getByText(/^Tinjau dan edit proposal/).click();
    await editor.fill('Perubahan E2E lokal yang belum disimpan; wajib bertahan setelah filter dan error sumber.');
    const localText = await editor.inputValue();
    await fixture.getByRole('combobox', { name: /^Tahap/ }).selectOption('scanned');
    assert.equal(await editor.count(), 0);
    await fixture.getByRole('combobox', { name: /^Tahap/ }).selectOption('ready');
    await fixture.getByText(/^Tinjau dan edit proposal/).click();
    assert.equal(await editor.inputValue(), localText);
    projectsPhase = 'error';
    await fixture.evaluate(() => window.emitCardFixtureEvent(['projects-co-id']));
    await fixture.getByRole('alert').filter({ hasText: 'Proyek dan draf tidak tersedia.' }).waitFor();
    assert.equal(await editor.count(), 0, 'stale projects are hidden on error');
    projectsPhase = 'ready';
    await fixture.getByRole('button', { name: 'Muat ulang', exact: true }).click();
    await fixture.getByText(/^Tinjau dan edit proposal/).click();
    assert.equal(await editor.inputValue(), localText);
  });
  await fixture.close();
  }
  await check('no browser write requests attempted', async () => assert.deepEqual(blockedWrites, []));
} finally {
  await context.close();
  await browser.close();
  await writeReport();
}
console.log(`${results.filter(result => result.ok).length}/${results.length} checks passed. Report: ${resolve(output, 'report.json')}`);
process.exitCode = results.some(result => !result.ok) ? 1 : 0;
