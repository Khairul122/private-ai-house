import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { FreelancerWriteError, type FreelancerWriteResult } from '@fvh/adapter-freelancer';
import { FreelancerBrowserPage } from './browser-bid-page.js';
import { BrowserBidError, type BrowserBidInput, type BrowserBidMode, type BrowserBidStatus, type BrowserIdentity } from './browser-bid-types.js';

export function canFallbackToBrowser(error: unknown): boolean {
  return error instanceof FreelancerWriteError && [401, 403, 429].includes(error.statusCode ?? 0) && !/BID_LIMIT_EXCEEDED/.test(error.message);
}

export type BrowserBidConnection = { page: Page; disconnect: () => Promise<void>; onDisconnect: (listener: () => void) => void };
export async function connectExistingChrome(connect: () => Promise<Browser> = () => chromium.connectOverCDP('chrome', { noDefaults: true, timeout: 15_000 })): Promise<BrowserBidConnection> {
  const browser = await connect();
  let workerPage: Page | undefined;
  try {
    const context = browser.contexts()[0];
    if (!context) throw new BrowserBidError('context', 'Sesi Chrome yang berjalan tidak tersedia.');
    const page = await context.newPage();
    workerPage = page;
    const network = await context.newCDPSession(page);
    // Service-worker requests can escape page.route; bypass them only on the worker tab.
    await network.send('Network.setBypassServiceWorker', { bypass: true });
    return {
      page,
      disconnect: async () => { await page.close().catch(() => undefined); await browser.close().catch(() => undefined); },
      onDisconnect: listener => { browser.on('disconnected', listener); page.on('close', listener); },
    };
  } catch (error) { await workerPage?.close().catch(() => undefined); await browser.close().catch(() => undefined); throw error; }
}

export class BrowserBiddingService {
  private connection: BrowserBidConnection | null = null;
  private driver: FreelancerBrowserPage | null = null;
  private opening: Promise<void> | null = null;
  private generation = 0;
  private autoStart = false;
  private writes = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | undefined;
  private current: BrowserBidStatus = { mode: 'api', state: 'stopped', busy: false, reason: 'Belum tersambung ke Chrome berprofil Anda.', username: null, remaining: null, checkedAt: null, pageStatus: null, lastRunAt: null, lastResult: null };
  constructor(private directory: string, private readIdentity: () => Promise<BrowserIdentity>, private connect = connectExistingChrome) {}
  status(): BrowserBidStatus {
    const old = this.current.checkedAt && Date.now() - Date.parse(this.current.checkedAt) > 90_000;
    return old && !this.current.busy && this.current.state === 'ready' ? { ...this.current, state: 'error', reason: 'Status browser sudah lama. Periksa kembali sebelum pengiriman.' } : { ...this.current };
  }
  private persist() {
    const data = JSON.stringify({ mode: this.current.mode, autoStart: this.autoStart, connection: 'existing-chrome' });
    const next = this.writes.catch(() => undefined).then(async () => {
      await mkdir(this.directory, { recursive: true });
      const file = join(this.directory, 'browser-bid-settings.json');
      await writeFile(`${file}.tmp`, data, 'utf8');
      await rename(`${file}.tmp`, file);
    });
    this.writes = next;
    return next;
  }
  async restore() {
    const saved: unknown = await readFile(join(this.directory, 'browser-bid-settings.json'), 'utf8').then(s => JSON.parse(s)).catch(() => null);
    if (saved && typeof saved === 'object' && 'mode' in saved && ['api', 'api-fallback', 'browser'].includes(String(saved.mode))) {
      this.current.mode = saved.mode as BrowserBidMode;
      this.autoStart = 'autoStart' in saved && saved.autoStart === true && 'connection' in saved && saved.connection === 'existing-chrome';
    }
    if (this.autoStart) await this.open().catch(() => undefined);
  }
  async setMode(mode: BrowserBidMode) {
    if (this.current.busy) throw new BrowserBidError('busy', 'Tunggu proses browser selesai sebelum mengganti jalur.');
    const previous = this.current.mode;
    this.current.mode = mode;
    try { await this.persist(); } catch { this.current.mode = previous; throw new BrowserBidError('storage', 'Mode browser belum tersimpan.'); }
  }
  async open() {
    if (this.opening) return this.opening;
    if (this.connection) return this.check();
    this.opening = this.openContext().finally(() => { this.opening = null; });
    return this.opening;
  }
  private async openContext() {
    const generation = ++this.generation;
    this.current = { ...this.current, state: 'opening', busy: true, reason: 'Meminta sambungan ke Chrome yang sudah berjalan. Izinkan dialog Chrome jika Anda menyetujuinya.' };
    try {
      const connection = await this.connect();
      if (generation !== this.generation) { await connection.disconnect(); return; }
      this.connection = connection;
      const page = connection.page;
      page.setDefaultTimeout(10_000);
      this.driver = new FreelancerBrowserPage(page);
      connection.onDisconnect(() => {
        if (this.connection !== connection) return;
        if (this.timer) clearInterval(this.timer); this.timer = undefined;
        this.generation++; this.connection = null; this.driver = null;
        this.current = { ...this.current, state: 'stopped', busy: false, username: null, remaining: null, checkedAt: null, pageStatus: null, reason: 'Sambungan Chrome atau tab worker ditutup. Hubungkan kembali untuk melanjutkan.' };
        void connection.disconnect();
      });
      this.autoStart = true; await this.persist();
      this.current.busy = false;
      await this.check();
      if (generation === this.generation && this.connection) { this.timer = setInterval(() => { if (!this.current.busy && !['login_required', 'challenge', 'stopped'].includes(this.current.state)) void this.check(); }, 60_000); this.timer.unref?.(); }
    } catch {
      if (generation === this.generation) this.current = { ...this.current, state: 'error', reason: 'Chrome belum tersambung. Pada Chrome berprofil Anda, buka chrome://inspect/#remote-debugging dan aktifkan izin debugging, lalu hubungkan dan setujui dialog Chrome. Tidak ada Chrome baru yang dibuka.' };
    } finally { if (generation === this.generation) this.current.busy = false; }
  }
  async check() {
    if (this.current.busy) return;
    if (!this.driver) { this.current.state = 'stopped'; this.current.reason = 'Hubungkan Chrome berprofil Anda yang sudah login Freelancer.'; return; }
    this.current = { ...this.current, busy: true, state: 'checking', reason: 'Memeriksa akun dan kuota dari halaman dashboard.' };
    const generation = this.generation;
    try {
      const observed = await this.driver.inspect();
      if (generation !== this.generation || !this.connection) return;
      this.current = { ...this.current, ...observed };
      if (observed.challenge) { this.current.state = 'challenge'; this.current.reason = 'Selesaikan CAPTCHA/verifikasi manusia pada tab worker di Chrome Anda.'; return; }
      if (!observed.username) { this.current.state = 'login_required'; this.current.reason = 'Sesi Freelancer belum login pada profil Chrome yang tersambung. Gunakan profil yang sudah login, lalu periksa kembali.'; return; }
      const expected = await this.readIdentity();
      if (generation !== this.generation || !this.connection) return;
      if (observed.username.toLowerCase() !== expected.username.toLowerCase()) { this.current.state = 'account_mismatch'; this.current.reason = 'Akun pada browser berbeda dari akun API. Gunakan akun yang sama.'; return; }
      if (observed.remaining === null) { this.current.state = 'error'; this.current.reason = 'Jumlah bid tersisa belum dapat dibaca dari dashboard. Pengiriman browser ditahan.'; return; }
      this.current.state = observed.remaining > 0 ? 'ready' : 'quota_exhausted';
      this.current.reason = observed.remaining > 0 ? 'Akun dan kuota terverifikasi. Pengiriman tetap mengikuti kebijakan.' : 'Dashboard Freelancer melaporkan kuota bid habis. Menunggu kuota tersedia.';
    } catch { if (generation === this.generation && this.connection) this.current = { ...this.current, state: 'error', username: null, remaining: null, pageStatus: null, checkedAt: new Date().toISOString(), reason: 'Akun, halaman atau API identitas belum dapat diverifikasi. Periksa tab worker pada Chrome Anda.' }; }
    finally { if (generation === this.generation) this.current.busy = false; }
  }
  readiness() {
    const state = this.status();
    return { ready: state.mode !== 'browser' || state.state === 'ready', reason: state.reason };
  }
  async submit(input: BrowserBidInput, authorize: () => Promise<void>, apiSubmit: () => Promise<FreelancerWriteResult>): Promise<FreelancerWriteResult> {
    const mode = this.current.mode;
    if (mode === 'api') { await authorize(); return apiSubmit(); }
    if (mode === 'api-fallback') {
      await authorize();
      try { return await apiSubmit(); } catch (error) { if (!canFallbackToBrowser(error)) throw error; }
    }
    if (this.current.busy || !this.driver) throw new BrowserBidError('not_ready', 'Chrome berprofil Anda belum tersambung; tidak ada submit browser.');
    const driver = this.driver; const generation = this.generation;
    this.current = { ...this.current, busy: true, state: 'submitting', lastRunAt: new Date().toISOString(), reason: `Menyiapkan bid browser untuk proyek ${input.projectId}.` };
    try {
      const identity = await this.readIdentity();
      if (generation !== this.generation || !this.connection) throw new BrowserBidError('stopped', 'Sambungan Chrome dihentikan sebelum submit.');
      const result = await driver.submit(input, identity, async () => {
        if (generation !== this.generation || !this.connection || mode !== this.current.mode) throw new BrowserBidError('stopped', 'Browser atau jalur pengiriman berubah sebelum submit.');
        await authorize();
        if (generation !== this.generation || !this.connection || mode !== this.current.mode) throw new BrowserBidError('stopped', 'Sambungan Chrome dihentikan saat kebijakan diperiksa.');
      });
      this.current.lastResult = { projectId: input.projectId, statusCode: result.statusCode, bidId: result.resultId, outcome: 'submitted', at: new Date().toISOString() };
      this.current.reason = 'Bid browser terkonfirmasi dengan HTTP 200 dan ID bid.';
      return result;
    } catch (error) {
      const known = error instanceof BrowserBidError ? error : new BrowserBidError('unavailable', 'Browser belum dapat mengirim bid.');
      this.current.lastResult = { projectId: input.projectId, statusCode: known.statusCode ?? null, bidId: null, outcome: known.uncertain ? 'uncertain' : 'blocked', at: new Date().toISOString() };
      this.current.reason = known.message;
      throw known;
    } finally {
      if (generation === this.generation) {
        this.current.busy = false;
        // Re-read the dashboard instead of decrementing a guessed website quota.
        this.current.state = this.connection ? 'checking' : 'stopped';
        if (this.connection) void this.check();
      }
    }
  }
  async close(persist = false) {
    this.generation++; if (this.timer) clearInterval(this.timer); this.timer = undefined;
    if (persist) { this.autoStart = false; await this.persist(); }
    const connection = this.connection; this.connection = null; this.driver = null;
    await connection?.disconnect().catch(() => undefined);
    this.current = { ...this.current, state: 'stopped', busy: false, username: null, remaining: null, checkedAt: null, pageStatus: null, reason: 'Sambungan worker dilepas. Chrome berprofil Anda tetap terbuka.' };
  }
}
