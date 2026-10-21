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
const pageErrors = [];
const consoleErrors = [];
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
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ base: base.origin, webgl: 'disabled; card and overlay checks only', results, blockedWrites, pageErrors, consoleErrors, apiReads: Object.fromEntries(apiReads) }, null, 2));
}

function observePage(page) {
  page.on('pageerror', error => pageErrors.push({ message: error.message, url: page.url() }));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: page.url() });
  });
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
  await page.waitForFunction(() => !document.querySelector('.vo3d-sheet-body .loading-panel'), undefined, { timeout: 45_000 });
}

async function closeOfficePanel(page) {
  const close = page.getByRole('button', { name: 'Tutup panel', exact: true });
  if (await close.isVisible().catch(() => false)) {
    await close.click({ force: true });
    await close.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
}

async function closeTablet(page) {
  const close = page.getByRole('button', { name: 'Tutup tablet dan kembali ke kantor', exact: true });
  if (await close.isVisible().catch(() => false)) {
    await close.click({ force: true });
    await close.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
}

async function checkOfficePanels(page, viewport) {
  await closeOfficePanel(page);
  await closeTablet(page);
  await check(`${viewport.name}: office roster, floors, view and tablet`, async () => {
    const floorOne = page.getByRole('button', { name: 'Lantai 1', exact: true });
    const floorTwo = page.getByRole('button', { name: 'Lantai 2', exact: true });
    await floorTwo.click();
    assert.equal(await floorTwo.getAttribute('aria-pressed'), 'true', 'floor 2 becomes active');
    await floorOne.click();
    assert.equal(await floorOne.getAttribute('aria-pressed'), 'true', 'floor 1 becomes active');
    const topView = page.getByRole('button', { name: 'Tampilan denah atas' });
    const threeDView = page.getByRole('button', { name: 'Tampilan 3D' });
    await topView.click();
    assert.equal(await topView.getAttribute('aria-pressed'), 'true', 'top view becomes active');
    await threeDView.click();
    assert.equal(await threeDView.getAttribute('aria-pressed'), 'true', '3D view becomes active');
    const toggle = page.locator('.vo3d-roster-toggle');
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'roster opens');
    await assertFits(page);
    const agent = page.locator('#office-roster button').first();
    assert(await agent.count(), 'office roster has an agent control');
    await agent.click();
    await page.getByRole('tab', { name: 'Agen', exact: true }).waitFor();
    await closeOfficePanel(page);
    await page.getByRole('button', { name: 'Buka tablet Mission Control' }).click();
    const tabletNav = page.locator('nav[aria-label="Semua modul"]');
    await tabletNav.waitFor({ state: 'visible' });
    assert.equal(await tabletNav.locator('a').count(), 15, 'tablet exposes all remodeled modules');
    await assertFits(page, true);
    await page.screenshot({ path: resolve(output, `${viewport.name}-tablet.png`) });
    await closeTablet(page);
    await page.getByRole('button', { name: 'Buka tablet Mission Control' }).focus();
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => document.activeElement?.checkVisibility()), 'keyboard focus remains visible after office Tab');
  });
  await closeTablet(page);
  await closeOfficePanel(page);
  for (const label of ['Pemilik', 'Agen', 'Aktivitas', 'Kanal']) await check(`${viewport.name}: office ${label} panel`, async () => {
    await closeOfficePanel(page);
    await page.getByRole('button', { name: 'Pemilik', exact: true }).click();
    await page.getByRole('tab', { name: label, exact: true }).click();
    const panel = page.locator('[aria-label="Panel detail"]');
    const bounds = await panel.boundingBox();
    assert(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, 'office detail panel stays within viewport');
    assert(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 2), 'office panel has no horizontal overflow');
    const disclosure = panel.locator('details').first();
    if (await disclosure.count() && !(await disclosure.evaluate(element => element.open))) await disclosure.evaluate(element => { element.open = true; });
    await page.screenshot({ path: resolve(output, `${viewport.name}-panel-${label.toLowerCase()}.png`) });
  });
  await closeOfficePanel(page);
}

async function checkOfficeAgentSemantics(page, viewport) {
  await closeOfficePanel(page);
  await closeTablet(page);
  await check(`${viewport.name}: agent selection and state display`, async () => {
    const toggle = page.locator('.vo3d-roster-toggle');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    const agents = page.locator('#office-roster button.vo3d-agent');
    assert(await agents.count(), 'office roster exposes real agent controls');
    const first = agents.first();
    const name = (await first.locator('strong').innerText()).trim();
    const state = (await first.locator('small').innerText()).trim();
    assert(name, 'agent has a name');
    assert(/Bekerja|Meninjau|Berkolaborasi|Idle|Offline|Tidak diketahui/.test(state), `agent state is explicit: ${state}`);
    await first.click();
    const panel = page.locator('[aria-label="Panel detail"]');
    await panel.waitFor();
    assert.equal(await panel.locator('h3').first().innerText(), name, 'selected agent matches roster entry');
    assert(await panel.locator('dt').filter({ hasText: 'Alasan status' }).count(), 'selected agent shows status reason');
    assert(await panel.locator('dt').filter({ hasText: 'Tugas saat ini' }).count(), 'selected agent shows task status');
    const collaboration = page.locator('#office-roster button.vo3d-agent').filter({ hasText: 'Berkolaborasi' });
    if (await collaboration.count()) {
      await closeOfficePanel(page);
      await collaboration.first().click();
      await panel.waitFor();
      assert(await panel.getByText('Berkolaborasi', { exact: true }).count(), 'collaborating agent state appears in detail panel');
      assert(await panel.getByText('Ruang Rapat', { exact: true }).count(), 'collaborating agent is assigned to meeting room');
    }
    await closeOfficePanel(page);
  });
  await check(`${viewport.name}: reduced motion and idle ambient guard`, async () => {
    assert.equal(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches), true, 'E2E context enables reduced motion');
    const tour = page.getByRole('button', { name: 'Tur', exact: true });
    assert.equal(await tour.isDisabled(), true, 'camera tour disabled under reduced motion');
    assert.equal(await page.getByText('Gerak santai · animasi', { exact: true }).count(), 0, 'idle ambient animation affordance hidden under reduced motion');
  });
}

async function checkHermesMemory(page, viewport) {
  await closeOfficePanel(page);
  await closeTablet(page);
  await check(`${viewport.name}: Hermes memory UI and read-only API`, async () => {
    const response = await page.request.get(new URL('/api/office-learning', base).href, { timeout: 15_000 });
    if (response.status() === 404) { console.log('SKIP Hermes memory: running server has no office-learning API'); return; }
    assert.equal(response.status(), 200, 'Hermes learning GET succeeds');
    await page.getByRole('button', { name: 'Buka tablet Mission Control' }).click();
    await page.locator('.vo3d-tablet-nav a[href="/agents"]').click();
    await waitForCard(page);
    await page.getByRole('heading', { name: 'Ruang belajar tim', exact: true }).waitFor({ timeout: 45_000 });
    const learningReads = apiReads.get('/api/office-learning');
    assert(learningReads && learningReads.count > 0, 'Hermes memory status loaded through GET API');
    if (await page.getByText('Hermes belum tersedia untuk sesi belajar.').count()) return;
    assert(await page.getByRole('heading', { name: 'Ingatan karyawan', exact: true }).count(), 'Hermes memory section is present');
    assert(await page.getByText(/Catatan AI belum diverifikasi/, { exact: false }).count(), 'memory warning explains unverified AI notes');
    assert.equal(await page.getByRole('button', { name: 'Mulai sesi' }).count(), 1, 'learning action is visible but not activated');
  });
  if (new URL(page.url()).pathname !== '/') {
    await page.keyboard.press('Escape');
    await page.waitForURL(base.href);
  }
}

async function checkOperationsTabs(page, viewport) {
  for (const tab of ['Klien & progres', 'Invoice', 'Jadwal pemilik', 'WhatsApp', 'Google Calendar', 'Laporan tim', 'Bid browser']) await check(`${viewport.name}: operations ${tab}`, async () => {
    await page.locator('.vo3d-sheet-body').evaluate((element, label) => {
      element.scrollTo({ top: 0 });
      [...element.querySelectorAll('[role="tab"]')].find(tab => tab.textContent === label)?.click();
    }, tab);
    await waitForCard(page);
    const disclosure = page.locator('.vo3d-sheet-body details').first();
    if (await disclosure.count() && !(await disclosure.evaluate(element => element.open))) await disclosure.evaluate(element => { element.open = true; });
    await assertFits(page, true);
    await page.locator('.vo3d-sheet-body').evaluate(element => element.scrollTo({ top: 0 }));
    await page.screenshot({ path: resolve(output, `${viewport.name}-operations-${tab.toLowerCase().replace(/[^a-z]+/g, '-')}.png`) });
    await assertFocusTrap(page);
  });
}

async function assertFocusTrap(page) {
  await page.evaluate(() => {
    const items = [...document.querySelector('.vo3d-sheet').querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')].filter(element => element.checkVisibility());
    if (!items.length) throw new Error('card has focusable controls');
    items.at(-1).focus();
  });
  await page.keyboard.press('Tab');
  assert(await page.evaluate(() => {
    const items = [...document.querySelector('.vo3d-sheet').querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')].filter(element => element.checkVisibility());
    return items[0] === document.activeElement;
  }), 'Tab must wrap to the first card control');
  await page.keyboard.press('Shift+Tab');
  assert(await page.evaluate(() => {
    const items = [...document.querySelector('.vo3d-sheet').querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')].filter(element => element.checkVisibility());
    return items.at(-1) === document.activeElement;
  }), 'Shift+Tab must wrap to the last card control');
}

try {
  const page = await context.newPage();
  observePage(page);
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
      await page.waitForFunction(() => document.querySelector('[aria-label="Status kantor"]')?.textContent?.includes('Koneksi pembaruan aplikasi terhubung'), undefined, { timeout: 45_000 });
    });
    if (!targeted) {
      await checkOfficePanels(page, viewport);
      await checkOfficeAgentSemantics(page, viewport);
      await checkHermesMemory(page, viewport);
    }
    await page.getByRole('button', { name: 'Buka tablet Mission Control' }).click();
    for (const path of routes) {
      await check(`${viewport.name}: ${path}`, async () => {
        if (new URL(page.url()).pathname !== path) {
          await page.locator(`.vo3d-tablet-nav a[href="${path}"]`).click();
        }
        await waitForCard(page);
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
  await check('no uncaught page exceptions or console errors', async () => {
    assert.deepEqual(pageErrors, [], 'page must not throw uncaught exceptions');
    assert.deepEqual(consoleErrors, [], 'page must not emit console errors');
  });
  await page.close();

  if (!targeted) {
  // Only this isolated page receives fixture data and a controllable EventSource.
  const fixture = await context.newPage();
  observePage(fixture);
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
    await fixture.getByText('Pipeline belum dapat dimuat.', { exact: false }).waitFor({ timeout: 10_000 });
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
