import type { Page, Route } from 'playwright-core';
import type { ProjectOpportunity } from '@fvh/domain';
import { BrowserBidError } from './browser-bid-types.js';
import { parseProjectsCoIdProject, projectsCoIdPath, PROJECTS_CO_ID_ORIGIN, type ProjectsCoIdObservation } from './projects-co-id-types.js';

export class ProjectsCoIdPage {
  blockedWrites = 0;
  private readonly gate = (route: Route) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue();
    this.blockedWrites++;
    this.onBlockedWrite?.();
    return route.abort('blockedbyclient');
  };
  private protected = false;
  private lastNavigation = 0;
  constructor(private page: Page, private origin = PROJECTS_CO_ID_ORIGIN, private onBlockedWrite?: (() => void) | undefined) {}
  async protect() {
    if (!this.protected) {
      await this.page.route('**/*', this.gate);
      await this.page.routeWebSocket('**/*', socket => socket.close());
      this.protected = true;
    }
  }
  private assertOrigin() {
    if (new URL(this.page.url()).origin !== this.origin) throw new BrowserBidError('wrong_origin', 'Halaman projects.co.id berpindah ke origin lain.');
  }
  private async navigate(path: string, authorize?: () => Promise<void>) {
    await this.protect();
    const delay = 3000 - (Date.now() - this.lastNavigation);
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    await authorize?.();
    this.lastNavigation = Date.now();
    const response = await this.page.goto(`${this.origin}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    this.assertOrigin();
    return response?.status() ?? null;
  }
  private async observe(pageStatus: number | null): Promise<ProjectsCoIdObservation> {
    const account = await this.page.locator('a[href]').evaluateAll(es => es.filter(e => {
      const url = new URL(e.getAttribute('href') ?? '', location.href);
      return url.origin === location.origin && url.pathname === '/user/home' && /^Logged in as\s+[A-Za-z0-9_-]+\s*$/.test(e.textContent?.trim() ?? '');
    }).map(e => e.textContent!.trim().replace(/^Logged in as\s+/, '')));
    const challenge = await this.page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], input[name="bid[captcha]"]').first().isVisible().catch(() => false)
      || /just a moment|tunggu sebentar/i.test(await this.page.title().catch(() => ''))
      || await this.page.getByText(/verify you are human|checking your browser|just a moment|verifikasi bahwa anda manusia|performing security verification|melakukan verifikasi keamanan/i).first().isVisible().catch(() => false);
    this.assertOrigin();
    return { username: account.length === 1 ? account[0]! : null, remaining: null, pageStatus, checkedAt: new Date().toISOString(), challenge };
  }
  private assertAccount(observed: ProjectsCoIdObservation, expected: string) {
    if (observed.challenge) throw new BrowserBidError('challenge', 'Selesaikan verifikasi manusia di Chrome.');
    if (observed.pageStatus !== 200) throw new BrowserBidError('http', 'Halaman projects.co.id tidak tersedia.');
    if (!observed.username) throw new BrowserBidError('login_required', 'Login di tab Chrome biasa pada profil yang sama, lalu periksa akun.');
    if (observed.username.toLowerCase() !== expected.toLowerCase()) throw new BrowserBidError('account_mismatch', 'Akun berubah selama pemindaian.');
  }
  async readProject(project: ProjectOpportunity, expectedUsername: string, authorize: () => Promise<void>): Promise<ProjectOpportunity> {
    await authorize();
    const status = await this.navigate(projectsCoIdPath(project), authorize);
    this.assertAccount(await this.observe(status), expectedUsername);
    const items = await this.page.locator('h1.title').evaluateAll(es => es.map(e => {
      const container = e.parentElement!;
      return { title: e.textContent ?? '', description: container.querySelector('.blog-content')?.textContent ?? '', text: container.innerText,
        skills: [...container.querySelectorAll('a[href*="listing?search="]')].map(a => a.textContent ?? ''),
        clientName: container.querySelector('a[href*="/browse_users/view/"]')?.textContent ?? '', href: location.href };
    }));
    const parsed = items.length === 1 ? parseProjectsCoIdProject(items[0]!, new Date(), this.origin) : null;
    if (!parsed || parsed.id !== project.id) throw new BrowserBidError('form_changed', 'Detail proyek belum dapat diverifikasi.');
    await authorize();
    return parsed;
  }
  async inspect(): Promise<ProjectsCoIdObservation> {
    const status = await this.navigate('/');
    return this.observe(status);
  }
  /** Without searches: up to three listing pages. With searches: page one of up to three searches. */
  async listOpenProjects(expectedUsername: string, authorize: () => Promise<void>, searches: string[] = []): Promise<ProjectOpportunity[]> {
    if (searches.length > 3) throw new Error('Maksimum tiga halaman per pemindaian.');
    const paths = searches.length ? searches.map(term => `/public/browse_projects/listing?search=${encodeURIComponent(term)}`) : [1, 2, 3].map(page => `/public/browse_projects/listing?page=${page}`);
    const projects = new Map<string, ProjectOpportunity>();
    for (let number = 1; number <= paths.length; number++) {
      await authorize();
      const status = await this.navigate(paths[number - 1]!, authorize);
      const observation = await this.observe(status);
      this.assertAccount(observation, expectedUsername);
      const items = await this.page.locator('#ds h2').evaluateAll(es => es.map(e => {
        const content = e.parentElement!; const row = content.parentElement!;
        return {
          href: e.querySelector('a')?.getAttribute('href') ?? '', title: e.textContent ?? '', text: content.innerText,
          description: [...content.querySelectorAll(':scope > p')].filter(p => !p.querySelector('.tag')).map(p => p.textContent ?? '').join('\n'),
          skills: [...content.querySelectorAll('a[href*="listing?search="]')].map(a => a.textContent ?? ''),
          clientName: row.querySelector('a[href*="/browse_users/view/"]')?.textContent ?? '',
        };
      }));
      if (!items.length && !await this.page.locator('#ds').getByText(/no record|tidak ada (?:data|project|proyek)/i).first().isVisible().catch(() => false)) throw new BrowserBidError('form_changed', 'Struktur daftar projects.co.id belum dikenali.');
      let added = 0;
      for (const item of items) {
        const project = parseProjectsCoIdProject(item, new Date(), this.origin);
        if (!project) throw new BrowserBidError('form_changed', 'Data proyek tidak lengkap atau struktur daftar berubah; hasil pemindaian tidak disimpan.');
        if (!projects.has(project.id)) { projects.set(project.id, project); added++; }
      }
      await authorize();
      if (searches.length) continue;
      if (added === 0) break;
      const hasNext = await this.page.locator('.pagination a').evaluateAll((es, next) => es.some(e => e.getAttribute('href') === `javascript:dsLoadPage('page', '${next}');`), String(number + 1));
      if (!hasNext) break;
    }
    return [...projects.values()];
  }
}
