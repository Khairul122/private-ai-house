import { afterEach, describe, expect, it } from 'vitest';
import { PROJECTS_CO_ID_DEFAULTS } from '@fvh/domain';
import { WorkspaceRepository } from '@fvh/persistence';
import { createApp } from '../app.js';
import { ProjectsCoIdService } from '../services/projects-co-id.js';

const listingHtml = `<!doctype html><main id="ds"><section><h2><a href="/public/browse_projects/view/55601d/aplikasi-online">Aplikasi online</a></h2><p>Membangun aplikasi web dan integrasi database sesuai dokumentasi proyek.</p><p>Published Budget: Rp 500,000 - 1,000,000</p><p>Published Date: 19/10/2026 13:34:26 WIB</p><p>Select Deadline: 18/11/2026 13:34:26 WIB</p><p>Project Status: Published</p></section></main>`;

describe('projects.co.id read-only E2E', () => {
  let repository: WorkspaceRepository | undefined;
  let app: Awaited<ReturnType<typeof createApp>> | undefined;

  afterEach(async () => {
    await app?.close();
    await repository?.close();
  });

  it('reads listing through GET, stores opportunity, and exposes no browser write path', async () => {
    repository = await WorkspaceRepository.open();
    await repository.savePolicy({ ...await repository.getPolicy(), projectsCoId: { ...PROJECTS_CO_ID_DEFAULTS, mode: 'scan-only' } });
    const methods: string[] = [];
    const fetcher = async (_input: URL, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET');
      return new Response(listingHtml, { status: 200 });
    };
    const service = new ProjectsCoIdService(repository, undefined, fetcher);
    app = await createApp({ repository, projectsCoId: service });
    const origin = { origin: 'http://127.0.0.1:5174' };

    const scan = await app.inject({ method: 'POST', url: '/api/projects-co-id/scan', headers: origin, payload: {} });
    expect(scan.statusCode).toBe(200);
    expect(scan.json()).toMatchObject({ state: 'ready', lastResult: { imported: 1 } });
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every(method => method === 'GET')).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/projects-co-id/drafts' })).json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'projects_co_id:55601d' })]));
    expect((await app.inject({ method: 'POST', url: '/api/projects-co-id/open', headers: origin })).statusCode).toBe(410);
    expect((await app.inject({ method: 'POST', url: '/api/projects-co-id/submit', headers: origin })).statusCode).toBe(404);
  });
});
