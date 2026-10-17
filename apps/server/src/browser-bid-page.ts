import type { Page, Route } from 'playwright-core';
import { BrowserBidError, confirmedBrowserBid, isBidEndpoint, matchesBrowserBid, readRemainingBids, type BrowserBidInput, type BrowserIdentity, type BrowserObservation } from './browser-bid-types.js';

export class FreelancerBrowserPage {
  constructor(private page: Page, private origin = 'https://www.freelancer.com', private responseTimeoutMs = 30_000) {}
  private assertOrigin() {
    if (new URL(this.page.url()).origin !== this.origin) throw new BrowserBidError('wrong_origin', 'Browser bukan pada halaman Freelancer yang diizinkan.');
  }
  private async challenge() {
    return await this.page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"]').count() > 0 && await this.page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"]').first().isVisible()
      || await this.page.getByText(/verify you are human|verifikasi bahwa anda manusia|checking your browser/i).first().isVisible();
  }
  private async username(): Promise<string | null> {
    const menu = this.page.getByRole('button', { name: /^(Menu|User menu|Account menu)$/i });
    if (await menu.count() !== 1) return null;
    return (await menu.innerText()).match(/@([A-Za-z0-9_-]{1,64})\b/)?.[1] ?? null;
  }
  async inspect(): Promise<BrowserObservation> {
    const response = await this.page.goto(`${this.origin}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    this.assertOrigin();
    await this.page.getByRole('button', { name: /^(Menu|User menu|Account menu)$/i }).waitFor({ state: 'visible', timeout: 12_000 }).catch(() => undefined);
    const username = await this.username();
    if (username) await this.page.locator('main').filter({ hasText: /\d+\s+(?:penawaran tersisa dari|bids? left out of|bids? remaining (?:out )?of)\s+\d+/i }).waitFor({ state: 'visible', timeout: 12_000 }).catch(() => undefined);
    const main = await this.page.locator('main').innerText({ timeout: 10_000 }).catch(() => '');
    return { username, remaining: username ? readRemainingBids(main) : null, pageStatus: response?.status() ?? null, checkedAt: new Date().toISOString(), challenge: await this.challenge() };
  }
  async submit(input: BrowserBidInput, identity: BrowserIdentity, authorize: () => Promise<void>) {
    if (!Number.isSafeInteger(input.projectId) || input.projectId < 1 || input.amount <= 0 || !Number.isFinite(input.amount) || !Number.isInteger(input.period) || input.period < 1 || input.milestonePercentage !== 100 || !input.description.trim() || input.description.length > 4000) throw new BrowserBidError('invalid_bid', 'Data bid browser tidak valid.');
    let permit = false; let sent = false; let clicked = false; let requestBlocked = false;
    const activeRoutes = new Set<Promise<void>>();
    const handleRoute = async (route: Route) => {
      const request = route.request();
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue();
      let body: unknown; try { body = request.postDataJSON(); } catch { body = null; }
      if (permit && !sent && request.method() === 'POST' && isBidEndpoint(request.url(), this.origin) && matchesBrowserBid(body, input, identity)) {
        try { await authorize(); } catch { requestBlocked = true; return route.abort('blockedbyclient'); }
        if (!permit || sent || this.page.isClosed()) { requestBlocked = true; return route.abort('blockedbyclient'); }
        sent = true; return route.continue();
      }
      if (isBidEndpoint(request.url(), this.origin)) requestBlocked = true;
      return route.abort('blockedbyclient');
    };
    const gate = (route: Route) => {
      const pending = handleRoute(route).catch(() => { requestBlocked = true; });
      activeRoutes.add(pending);
      void pending.then(() => activeRoutes.delete(pending), () => activeRoutes.delete(pending));
      return pending;
    };
    await this.page.route('**/*', gate);
    try {
      const observation = await this.inspect();
      if (observation.challenge) throw new BrowserBidError('challenge', 'Selesaikan verifikasi manusia pada browser khusus.');
      if (observation.username?.toLowerCase() !== identity.username.toLowerCase()) throw new BrowserBidError('account_mismatch', 'Akun browser harus sama dengan akun API Freelancer.');
      if (observation.remaining === null || observation.remaining <= 0) throw new BrowserBidError('quota', 'Kuota bid website tidak tersedia atau habis; tidak ada submit.');
      await this.page.goto(`${this.origin}/projects/${input.projectId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      this.assertOrigin();
      const main = this.page.locator('main');
      await main.getByRole('button', { name: /^(Place Bid|Submit Bid|Ajukan Penawaran|Pasang Penawaran|Tempatkan Penawaran)$/i }).waitFor({ state: 'visible', timeout: 15_000 });
      const content = await main.innerText();
      if (!new RegExp(`(?:Project ID|ID Proyek)\\s*:\\s*${input.projectId}\\b`, 'i').test(content) || !/\bUSD\b/.test(content) || /out of bids|kehabisan kuota penawaran|sign (?:an? |the )?(?:IP|NDA)|menandatangani Perjanjian/i.test(content)) throw new BrowserBidError('project_blocked', 'Proyek, mata uang atau persyaratan halaman tidak cocok; periksa secara manual.');
      if (await this.challenge()) throw new BrowserBidError('challenge', 'Verifikasi manusia diperlukan; bid tidak dikirim.');
      // Each selector must resolve exactly once; a changed form fails closed.
      const amount = main.locator('input[name="amount"], input[name="bidAmount"]');
      const period = main.locator('input[name="period"], input[name="deliveryTime"]');
      const description = main.locator('textarea[name="description"], textarea[name="proposal"]');
      if (await amount.count() !== 1 || await period.count() !== 1 || await description.count() !== 1) throw new BrowserBidError('form_changed', 'Formulir Freelancer belum dikenali. Tidak ada bid dikirim.');
      const form = amount.locator('xpath=ancestor::form');
      if (await form.count() !== 1) throw new BrowserBidError('form_changed', 'Batas formulir penawaran tidak dapat dipastikan.');
      await amount.fill(String(input.amount)); await period.fill(String(input.period)); await description.fill(input.description);
      const checked = form.locator('input[type="checkbox"]:checked, input[type="radio"]:checked');
      if (await checked.count() > 0) throw new BrowserBidError('optional_upgrade', 'Ada opsi tambahan terpilih. Worker tidak menyetujui upgrade atau perjanjian.');
      const milestone = form.locator('input[name="milestonePercentage"], input[name="milestone_percentage"]');
      if (await milestone.count() === 1) await milestone.fill('100');
      if (await amount.inputValue() !== String(input.amount) || await period.inputValue() !== String(input.period) || await description.inputValue() !== input.description) throw new BrowserBidError('form_changed', 'Nilai formulir berubah; bid dibatalkan.');
      this.assertOrigin();
      if ((await this.username())?.toLowerCase() !== identity.username.toLowerCase()) throw new BrowserBidError('account_mismatch', 'Akun browser berubah sebelum submit.');
      await authorize();
      permit = true;
      const responsePromise = this.page.waitForResponse(response => response.request().method() === 'POST' && isBidEndpoint(response.url(), this.origin) && matchesBrowserBid(response.request().postDataJSON(), input, identity), { timeout: this.responseTimeoutMs }).catch(() => null);
      clicked = true;
      await form.getByRole('button', { name: /^(Place Bid|Submit Bid|Ajukan Penawaran|Pasang Penawaran|Tempatkan Penawaran)$/i }).click({ timeout: 10_000 });
      const response = await responsePromise;
      if (!response) throw new BrowserBidError('uncertain', requestBlocked ? 'Request bid tidak cocok dan diblokir. Periksa hasil di Freelancer.' : 'Tidak ada hasil submit yang dapat dipastikan. Proyek ditahan untuk rekonsiliasi.', true);
      if (response.status() !== 200) throw new BrowserBidError('rejected', `Submit browser menghasilkan HTTP ${response.status()}.`, false, response.status());
      const bidId = confirmedBrowserBid(await response.json().catch(() => null), input, identity);
      if (!bidId) throw new BrowserBidError('uncertain', 'HTTP 200 belum disertai bukti ID bid dan nilai yang cocok; perlu rekonsiliasi.', true, 200);
      return { statusCode: 200, resultId: bidId, transport: 'browser' as const };
    } catch (error) {
      if (error instanceof BrowserBidError) throw error;
      throw new BrowserBidError(clicked ? 'uncertain' : 'form_unavailable', clicked ? 'Hasil submit browser tidak dapat dipastikan; jangan kirim ulang otomatis.' : 'Halaman atau formulir browser belum tersedia. Tidak ada submit terkonfirmasi.', clicked);
    } finally {
      permit = false;
      // Keep interception installed until delayed policy checks have rejected their requests.
      await Promise.allSettled([...activeRoutes]);
      await this.page.unroute('**/*', gate).catch(() => undefined);
    }
  }
}
