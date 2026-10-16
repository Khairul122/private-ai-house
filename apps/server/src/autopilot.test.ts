import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FreelancerProfile } from '@fvh/adapter-freelancer';
import type { ProjectOpportunity } from '@fvh/domain';
import { WorkspaceRepository } from '@fvh/persistence';
import { FreelancerAutopilot } from './autopilot.js';

const now = new Date('2026-10-15T11:00:00.000Z');
const profile: FreelancerProfile = {
  id: '42', username: 'sample-user', displayName: 'Sample User', country: 'Indonesia', profileUrl: 'https://www.freelancer.com/u/sample-user',
  description: 'Python developer for APIs', hourlyRate: 18, currency: 'USD', jobs: [{ id: 15, name: 'Python' }], jobIds: [15],
};
const project: ProjectOpportunity = {
  id: 'freelancer:71', title: 'Python API implementation', description: 'Build and document a Python REST API with clear acceptance criteria and integration checks.',
  clientName: 'Client', budgetMin: 100, budgetMax: 400, currency: 'USD', projectType: 'fixed', skills: ['Python'], deadlineDays: null,
  briefQuality: 0.95, riskScore: 0.1, status: 'open', source: 'freelancer', createdAt: now.toISOString(),
};

describe('FreelancerAutopilot', () => {
  let repository: WorkspaceRepository | undefined;
  let autopilot: FreelancerAutopilot | undefined;

  afterEach(() => {
    autopilot?.stop();
    repository?.close();
    autopilot = undefined;
    repository = undefined;
  });

  it('bootstraps from public profile data and submits an eligible fixed price bid once', async () => {
    repository = await WorkspaceRepository.open();
    const submitBid = vi.fn(async () => ({ statusCode: 200, resultId: '9001' }));
    const syncProfileJobs = vi.fn(async () => ({ statusCode: 200 }));
    autopilot = new FreelancerAutopilot({
      repository,
      now: () => now,
      intervalMs: 60_000,
      readProfile: async () => profile,
      readProjects: async () => ({ projects: [project], skipped: 0 }),
      syncProfileJobs,
      submitBid,
    });

    expect((await autopilot.getStatus()).cycleInProgress).toBe(false);
    await autopilot.start();
    expect(await autopilot.getStatus()).toMatchObject({ state: 'running', lastSubmitted: 1 });
    await autopilot.runCycle();

    expect(await repository.getPolicy()).toMatchObject({ state: 'active', simulationOnly: false, allowedActions: ['bid.submit'], specializations: ['Python'] });
    expect(submitBid).toHaveBeenCalledTimes(1);
    expect(syncProfileJobs).toHaveBeenCalledExactlyOnceWith([15]);
    expect(await repository.hasAudit('marketplace.production.edit_profile', 'freelancer-profile-sync')).toBe(true);
    expect(submitBid).toHaveBeenCalledWith(expect.objectContaining({ projectId: 71, amount: 100, period: 14 }));
    expect((await repository.listProjects()).find((item) => item.id === project.id)?.pipelineStatus).toBe('submitted');
    expect(await autopilot.getStatus()).toMatchObject({ state: 'running', lastSubmitted: 0 });
  });

  it('keeps the owner-saved profile instead of reseeding it from Freelancer on restart', async () => {
    repository = await WorkspaceRepository.open();
    await repository.saveProfile({ ...repository.getProfile(), primaryField: 'Backend Engineer', specializations: ['Laravel', 'Python'], facts: [{ label: 'Catatan', value: 'Isi pemilik', source: 'manual' }] });
    autopilot = new FreelancerAutopilot({
      repository, now: () => now, intervalMs: 60_000, readProfile: async () => profile,
      readProjects: async () => ({ projects: [], skipped: 0 }), submitBid: vi.fn(async () => ({ statusCode: 200 })),
    });

    await autopilot.start();

    expect(await repository.getProfile()).toMatchObject({ primaryField: 'Backend Engineer', specializations: ['Laravel', 'Python'], facts: [{ value: 'Isi pemilik' }] });
  });

  it.each([
    ['uses the Hermes proposal at the policy price', async () => ({ proposal: 'Halo, saya siap membangun Python REST API Anda dengan dokumentasi dan uji integrasi. Harga USD 100 untuk 14 hari.', proposedPrice: 100, durationDays: 14, confidence: 0.8, evidence: [{ label: 'README.md', source: 'https://github.com/me/api' }], assumptions: [] }), 'Halo, saya siap', false],
    ['falls back when Hermes names a different price', async () => ({ proposal: 'I can deliver this Python REST API with clear documentation for $350 in two weeks, including tests.', proposedPrice: 100, durationDays: 14, confidence: 0.8, evidence: [], assumptions: [] }), 'Hello Client,', true],
    ['falls back when Hermes fails', async () => { throw new Error('Hermes Agent melewati batas waktu.'); }, 'Hello Client,', true],
  ] as const)('%s', async (_name, draftProposal, expectedStart, fellBack) => {
    repository = await WorkspaceRepository.open();
    const submitBid = vi.fn<(input: { description: string }) => Promise<{ statusCode: number; resultId: string }>>(async () => ({ statusCode: 200, resultId: '9001' }));
    const draft = vi.fn(draftProposal);
    autopilot = new FreelancerAutopilot({
      repository, now: () => now, intervalMs: 60_000, readProfile: async () => profile,
      readProjects: async () => ({ projects: [project], skipped: 0 }), submitBid, draftProposal: draft,
    });

    await autopilot.start();

    expect(draft).toHaveBeenCalledWith(expect.objectContaining({ fixedBid: { amount: 100, currency: 'USD', durationDays: 14 } }));
    expect(submitBid).toHaveBeenCalledTimes(1);
    expect(submitBid.mock.calls[0]![0].description.startsWith(expectedStart)).toBe(true);
    expect(await repository.hasAudit('autopilot.draft_fallback', project.id)).toBe(fellBack);
    expect((await autopilot.getStatus()).draftsInProgress).toBe(0);
  });

  it('stays blocked when the public profile does not support any listed skill', async () => {
    repository = await WorkspaceRepository.open();
    const submitBid = vi.fn();
    autopilot = new FreelancerAutopilot({
      repository,
      now: () => now,
      readProfile: async () => ({ ...profile, description: 'A general freelance profile', jobs: [{ id: 22, name: 'Python' }] }),
      readProjects: async () => ({ projects: [project], skipped: 0 }),
      submitBid,
    });

    await autopilot.start();

    expect(await autopilot.getStatus()).toMatchObject({ state: 'blocked' });
    expect(submitBid).not.toHaveBeenCalled();
    expect((await repository.getPolicy()).state).toBe('draft');
  });

  it('skips projects without supported fixed USD price semantics', async () => {
    repository = await WorkspaceRepository.open();
    const submitBid = vi.fn();
    autopilot = new FreelancerAutopilot({
      repository,
      now: () => now,
      intervalMs: 60_000,
      readProfile: async () => profile,
      readProjects: async () => ({ projects: [{ ...project, projectType: 'hourly' }], skipped: 0 }),
      submitBid,
    });

    await autopilot.start();

    expect(submitBid).not.toHaveBeenCalled();
    expect(await autopilot.getStatus()).toMatchObject({ state: 'running', lastSubmitted: 0 });
  });
});
