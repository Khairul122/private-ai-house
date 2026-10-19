import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BrowserType } from '../apps/server/node_modules/playwright-core/index.js';
import { WorkspaceRepository } from '../packages/persistence/src/index.js';
import { PROJECTS_CO_ID_DEFAULTS } from '../packages/domain/src/index.js';
import { ProjectsCoIdService } from '../apps/server/src/projects-co-id.js';
import { connectExistingChrome } from '../apps/server/src/browser-bidding.js';
import { createApp } from '../apps/server/src/app.js';
import { parseProjectsCoIdProject } from '../apps/server/src/projects-co-id-types.js';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const { chromium } = require('playwright-core') as { chromium: BrowserType };
const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { createServer: createViteServer } = await import(pathToFileURL(webRequire.resolve('vite')).href) as typeof import('../apps/web/node_modules/vite/dist/node/index.js');
let username: string | null = null;
let challenge = false;
let ids = ['aa0001', 'aa0002'];
let writes = 0;
let listings = 0;
const searches: string[] = [];
const description = 'DATA UJI: membuat aplikasi TypeScript dengan alur akses, dokumentasi, pengujian dan kriteria selesai yang disepakati. '.repeat(5);
const metadata = 'Published Budget: Rp 500,000 - 1,000,000<br>Published Date: 19/10/2026 13:34:26 WIB<br>Select Deadline: 18/11/2099 13:34:26 WIB<br>Finish Days: 7<br>Project Status: Published';
const account = () => username ? `<a href="/user/home">Logged in as ${username}</a>` : '<a href="/public/home/login">Login</a>';
const content = (id: string) => `<h2><a href="/public/browse_projects/view/${id}/aplikasi-typescript">DATA UJI ${id}</a></h2><p>${description}</p><p><span class="tag"><a href="/public/browse_projects/listing?search=TypeScript">TypeScript</a></span></p><div>${metadata}</div>`;
const site = createServer((req, res) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? '')) { writes++; res.statusCode = 405; res.end(); return; }
  const url = new URL(req.url!, 'http://localhost');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Interstitial text observed live on projects.co.id (19 Oct 2026), Indonesian Chrome locale.
  const header = challenge ? '<title>Tunggu sebentar...</title><p>Melakukan verifikasi keamanan</p>' : account();
  const trap = '<script>fetch("/trap",{method:"POST",body:"must never arrive"}).catch(()=>{});</script>';
  if (url.pathname === '/') return res.end(header + trap);
  if (url.pathname === '/public/browse_projects/listing') {
    listings++;
    if (url.searchParams.has('search')) searches.push(url.searchParams.get('search')!);
    const number = Number(url.searchParams.get('page') ?? 1);
    const id = ids[number - 1];
    return res.end(`${header}<div id="ds">${id ? `<div><a href="/public/browse_users/view/111111/owner-fixture">owner-fixture</a><div>${content(id)}</div></div>` : '<p>No record</p>'}</div>${number < ids.length ? `<div class="pagination"><a href="javascript:dsLoadPage('page', '${number + 1}');">Next</a></div>` : ''}${trap}`);
  }
  const id = url.pathname.match(/^\/public\/browse_projects\/view\/(aa\d{4})\/aplikasi-typescript$/)?.[1];
  if (id) return res.end(`${header}<main><h1 class="title">DATA UJI ${id}</h1><div class="blog-content">${description}</div><a href="/public/browse_projects/listing?search=TypeScript">TypeScript</a><div>${metadata}</div><a href="/public/browse_users/view/111111/owner-fixture">owner-fixture</a></main>${trap}`);
  res.statusCode = 404; res.end();
});
await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
const address = site.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const repo = await WorkspaceRepository.open();
const policy = await repo.getPolicy();
await repo.savePolicy({ ...policy, state: 'active', allowedActions: ['bid.submit'], specializations: ['TypeScript'], minimumConfidence: 0.5, expiresAt: '2099-12-01T00:00:00Z', projectsCoId: { ...PROJECTS_CO_ID_DEFAULTS, useProfileSkills: false } });
await repo.saveProfile({ ...await repo.getProfile(), specializations: ['TypeScript'] });
const directory = await mkdtemp(join(tmpdir(), 'fvh-projects-co-id-fixture-'));
const context = await chromium.launchPersistentContext(directory, { channel: 'chrome', headless: true, args: ['--remote-debugging-port=0'] });
const ownerTab = context.pages()[0]!;
const port = Number((await readFile(join(directory, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
let badHermes = false;
const service = new ProjectsCoIdService(repo, () => connectExistingChrome(() => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true })), origin, async input => ({
  proposal: badHermes ? 'Harga Rp1,5 juta untuk aplikasi TypeScript, dengan pengujian dan dokumentasi sesuai kesepakatan.' : 'Saya akan membuat alur aplikasi TypeScript, menguji skenario utama, dan menyerahkan dokumentasi penggunaan.',
  proposedPrice: input.fixedBid!.amount, durationDays: input.fixedBid!.durationDays, confidence: 0.9, evidence: [], assumptions: [],
}));
let app: Awaited<ReturnType<typeof createApp>> | undefined;
let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
try {
  if (!process.argv.includes('--ui-only')) {
  await service.open(); assert.equal((await service.status()).state, 'login_required');
  await assert.rejects(service.scan()); assert.equal(listings, 0);
  username = 'other-fixture'; await service.check(); assert.equal((await service.status()).state, 'account_mismatch');
  username = 'KhairulHuda06'; challenge = true; await service.check(); assert.equal((await service.status()).state, 'challenge');
  await assert.rejects(service.scan()); assert.equal(listings, 0);
  challenge = false; await service.check(); assert.equal((await service.status()).state, 'ready');
  await service.scan(); const projects = await repo.listProjects(); assert.equal(projects.length, 2);
  assert.equal(projects[0]?.budgetMin, 500_000); assert.equal(projects[0]?.currency, 'IDR'); assert.ok(projects[0]!.deadlineDays! > 0);
  await service.setMode('drafts'); await service.scan();
  assert.equal((await repo.getLatestDraft('projects_co_id:aa0001'))?.proposedPrice, 500_000);
  assert.equal((await repo.listAuditForType('projects_co_id.draft_created')).length, 2);
  assert.ok((await repo.listProjects()).every(p => p.pipelineStatus === 'draft_ready'));
  ids = ['aa0003']; badHermes = true; await service.scan();
  assert.match((await repo.getLatestDraft('projects_co_id:aa0003'))!.proposal, /Harga Rp500.000/);
  assert.equal((await repo.listAuditForType('autopilot.draft_fallback')).length, 1);
  await repo.appendAudit({ type: 'projects_co_id.draft_created', resourceId: 'fixture-quota', status: 'recorded', reason: 'DATA UJI: kuota penuh', policyVersion: null, payloadHash: null });
  ids = ['aa0004']; await service.scan(); assert.equal(await repo.getLatestDraft('projects_co_id:aa0004'), undefined);
  await repo.savePolicy({ ...await repo.getPolicy(), state: 'paused' }); const before = listings;
  await assert.rejects(service.scan()); assert.equal(listings, before);
  await repo.savePolicy({ ...await repo.getPolicy(), state: 'active' }); await service.setMode('scan-only'); await service.check();
  // Field + profile search: three listing searches per scan, then the next three on the following scan.
  await repo.savePolicy({ ...await repo.getPolicy(), projectsCoId: { ...(await repo.getPolicy()).projectsCoId!, fields: ['ai'], useProfileSkills: true } });
  ids = ['aa0005']; await service.scan(); await service.check(); await service.scan();
  assert.deepEqual(searches, ['AI', 'Machine Learning', 'Chatbot', 'OpenAI', 'LLM', 'TypeScript']);
  assert.deepEqual((await service.status()).lastSearchTerms, ['OpenAI', 'LLM', 'TypeScript']);
  await repo.savePolicy({ ...await repo.getPolicy(), projectsCoId: { ...(await repo.getPolicy()).projectsCoId!, fields: [], useProfileSkills: false } });
  assert.equal(writes, 0); assert.ok((await service.status()).blockedWrites > 0);
  await service.close(); assert.equal(ownerTab.isClosed(), false); assert.equal(context.pages().length, 1);
  console.log('PASS: 11 worker scenarios (incl. field/profile search rotation); all marketplace writes blocked; CDP disconnect preserves owner tab.');
  } else {
    for (const id of ['aa0001', 'aa0002', 'aa0003']) {
      const project = parseProjectsCoIdProject({ href: `${origin}/public/browse_projects/view/${id}/aplikasi-typescript`, title: `DATA UJI ${id}`, description, clientName: 'owner-fixture', skills: ['TypeScript'], text: metadata.replaceAll('<br>', '\n') }, new Date(), origin)!;
      await repo.syncProjects([project]);
      await repo.createDraft({ id: `draft-${id}`, projectId: project.id, proposal: description.slice(0, 200), proposedPrice: 500_000, currency: 'IDR', durationDays: 14, confidence: 0.9, evidence: [], assumptions: [], status: 'draft_ready', createdAt: new Date().toISOString() });
    }
  }

  username = 'KhairulHuda06'; ids = ['aa0004'];
  app = await createApp({ repository: repo, projectsCoId: service });
  const apiOrigin = await app.listen({ host: '127.0.0.1', port: 0 });
  vite = await createViteServer({ configFile: false, root: fileURLToPath(new URL('../apps/web', import.meta.url)), esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 0, strictPort: true, proxy: { '/api': { target: apiOrigin, changeOrigin: false, configure: proxy => proxy.on('proxyReq', (request, incoming) => { request.setHeader('host', incoming.headers.host!); }) } } }, logLevel: 'error' });
  await vite.listen(); const webOrigin = vite.resolvedUrls!.local[0]!;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: webOrigin });
  await ownerTab.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = []; ownerTab.on('pageerror', error => errors.push(error.message));
  await ownerTab.goto(webOrigin, { waitUntil: 'domcontentloaded' });
  // Accessible board menu exercises the same route and camera target as the 3D board.
  await ownerTab.locator('summary[aria-label="Menu papan"]').click();
  await ownerTab.getByRole('link', { name: 'projects.co.id', exact: true }).click();
  await ownerTab.getByRole('heading', { name: 'Draf siap dikirim (3)' }).waitFor();
  const artifacts = fileURLToPath(new URL('../.local', import.meta.url)); await mkdir(artifacts, { recursive: true });
  await ownerTab.screenshot({ path: join(artifacts, 'projects-co-id-fixture-desktop.png') });
  const card = ownerTab.locator('.projects-draft-row').filter({ has: ownerTab.getByRole('heading', { name: 'DATA UJI aa0001', exact: true }) });
  const edited = 'DATA UJI: proposal yang telah disunting pemilik untuk alur aplikasi, pengujian dan dokumentasi penggunaan.';
  await card.getByRole('textbox').fill(edited);
  const savedResponse = ownerTab.waitForResponse(r => r.url().includes('/api/drafts/') && r.request().method() === 'PUT');
  await card.getByRole('button', { name: 'Simpan proposal' }).click();
  const saved = await savedResponse; assert.equal(saved.status(), 200, await saved.text());
  await card.getByText('Perubahan tersimpan.', { exact: true }).waitFor();
  assert.equal((await repo.getLatestDraft('projects_co_id:aa0001'))?.proposal, edited);
  await card.getByRole('button', { name: 'Salin proposal' }).click();
  assert.equal(await ownerTab.evaluate(() => navigator.clipboard.readText()), edited);
  assert.equal(await card.getByRole('link', { name: 'Buka di projects.co.id' }).getAttribute('href'), 'https://projects.co.id/public/browse_projects/view/aa0001/aplikasi-typescript');
  assert.equal(await card.getByRole('link', { name: 'Buka di projects.co.id' }).getAttribute('rel'), 'noopener noreferrer');
  ownerTab.once('dialog', dialog => dialog.accept());
  if (!process.argv.includes('--ui-only')) await card.getByText('Ditulis Hermes (Lead Agent)', { exact: true }).waitFor();
  // Field filter: fixture briefs are TypeScript only, so the AI field must hide every row.
  await ownerTab.getByLabel('Bidang', { exact: true }).selectOption('ai');
  await ownerTab.getByText(/Tidak ada proyek sesuai filter/).waitFor();
  await ownerTab.getByLabel('Bidang', { exact: true }).selectOption('all');
  await card.getByRole('button', { name: 'Sudah saya kirim' }).click();
  await card.waitFor({ state: 'detached' });
  await ownerTab.getByRole('button', { name: /Ditandai terkirim/ }).click();
  await ownerTab.getByText(/Ditandai terkirim oleh Anda ·/).waitFor();
  const sent = ownerTab.locator('.projects-draft-row').filter({ has: ownerTab.getByRole('heading', { name: 'DATA UJI aa0001', exact: true }) });
  ownerTab.once('dialog', dialog => dialog.accept());
  await sent.getByRole('button', { name: 'Saya menang' }).click();
  await ownerTab.getByRole('button', { name: /Menang/ }).click();
  await ownerTab.getByText(/Ditandai menang oleh Anda ·/).waitFor();
  const won = await repo.listClientProjects();
  assert.deepEqual(won.map(p => [p.source, p.externalProjectId, p.value, p.currency]), [['projects_co_id', 'projects_co_id:aa0001', 500_000, 'IDR']]);
  // Cross-card links keep the projects.co.id filter.
  await ownerTab.getByRole('link', { name: 'Lihat di Proyek & Pendapatan' }).click();
  await ownerTab.getByText('DATA UJI aa0001').first().waitFor();
  await ownerTab.goto(webOrigin + 'pipeline?source=projects_co_id');
  await ownerTab.getByLabel('Sumber').first().waitFor();
  assert.equal(await ownerTab.getByLabel('Sumber').first().inputValue(), 'projects_co_id');
  await ownerTab.getByText(/Ditandai menang|Berhasil/).first().waitFor();
  await ownerTab.goto(webOrigin + 'policy');
  await ownerTab.getByRole('checkbox', { name: /AI & Machine Learning/ }).waitFor();
  await ownerTab.goto(webOrigin + 'projects-co-id');
  await ownerTab.getByRole('heading', { name: 'Draf siap dikirim (2)' }).waitFor();
  await ownerTab.keyboard.press('Escape'); await ownerTab.waitForURL(webOrigin);
  await ownerTab.keyboard.press('Control+k');
  await ownerTab.getByRole('searchbox', { name: 'Cari agen atau papan' }).fill('projects.co.id');
  await ownerTab.getByRole('searchbox', { name: 'Cari agen atau papan' }).press('Enter');
  await ownerTab.getByRole('heading', { name: 'Draf siap dikirim (2)' }).waitFor();
  await ownerTab.getByLabel('Mode worker').selectOption('off');
  await ownerTab.getByText('Worker projects.co.id dinonaktifkan.', { exact: true }).waitFor();
  await ownerTab.getByLabel('Mode worker').selectOption('scan-only');
  await ownerTab.getByRole('button', { name: 'Hubungkan Chrome saya' }).click();
  await ownerTab.getByRole('button', { name: 'Periksa akun' }).click();
  await ownerTab.getByRole('button', { name: 'Pindai sekarang' }).click();
  await ownerTab.getByLabel('Tahap', { exact: true }).selectOption('all');
  const manual = ownerTab.locator('.projects-draft-row').filter({ has: ownerTab.getByRole('heading', { name: 'DATA UJI aa0004', exact: true }) });
  await manual.getByRole('button', { name: 'Buat draf' }).click();
  await manual.getByRole('textbox').waitFor();
  ownerTab.once('dialog', dialog => dialog.accept());
  await manual.getByRole('button', { name: 'Lewati' }).click();
  await ownerTab.getByText(/Dilewati oleh Anda ·/).waitFor();
  await ownerTab.getByRole('button', { name: 'Lepas sambungan' }).click();
  assert.equal(ownerTab.isClosed(), false);
  await ownerTab.setViewportSize({ width: 390, height: 844 });
  await ownerTab.goto(webOrigin + 'projects-co-id');
  await ownerTab.getByRole('heading', { name: 'Draf siap dikirim (2)' }).waitFor();
  assert.ok(await ownerTab.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await ownerTab.screenshot({ path: join(artifacts, 'projects-co-id-fixture-mobile.png') });
  assert.deepEqual(errors, []); assert.equal(writes, 0);
  console.log('PASS: boards/search, author label, field filter, sent → won → Proyek & Pendapatan, pipeline/policy links, worker controls, manual draft/skip, edit/save, clipboard, fixed-origin link, owner confirmation/history, Escape, mobile overflow.');
} finally {
  await service.close(); await vite?.close(); await app?.close(); await repo.close(); await context.close();
  await new Promise<void>((resolve, reject) => site.close(error => error ? reject(error) : resolve()));
}
