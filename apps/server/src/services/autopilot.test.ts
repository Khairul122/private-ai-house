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

  afterEach(async () => {
    autopilot?.stop();
    await repository?.close();
    autopilot = undefined;
    repository = undefined;
    vi.useRealTimers();
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
    await repository.saveProfile({ ...(await repository.getProfile()), primaryField: 'Backend Engineer', specializations: ['Laravel', 'Python'], facts: [{ label: 'Catatan', value: 'Isi pemilik', source: 'manual' }] });
    autopilot = new FreelancerAutopilot({
      repository, now: () => now, intervalMs: 60_000, readProfile: async () => profile,
      readProjects: async () => ({ projects: [], skipped: 0 }), submitBid: vi.fn(async () => ({ statusCode: 200 })),
    });

    await autopilot.start();

    expect(await repository.getProfile()).toMatchObject({ primaryField: 'Backend Engineer', specializations: ['Laravel', 'Python'], facts: [{ value: 'Isi pemilik' }] });
  });

  it('keeps owner-saved draft limits and requires activation instead of enabling live bids on restart', async () => {
    repository = await WorkspaceRepository.open();
    await repository.savePolicy({ ...(await repository.getPolicy()), keywords: ['PHP'], minPrice: 150, maxPrice: 900, activeHours: { start: 8, end: 20 } });
    await repository.appendAudit({ type: 'policy.updated', resourceId: 'policy', status: 'recorded', reason: 'Batas kebijakan diperbarui; perlu aktivasi ulang.', policyVersion: 1, payloadHash: null });
    autopilot = new FreelancerAutopilot({
      repository, now: () => now, intervalMs: 60_000, readProfile: async () => profile,
      readProjects: async () => ({ projects: [], skipped: 0 }), submitBid: vi.fn(async () => ({ statusCode: 200 })),
    });

    await autopilot.start();

    expect(await repository.getPolicy()).toMatchObject({ state: 'draft', simulationOnly: true, keywords: ['PHP'], minPrice: 150, maxPrice: 900, activeHours: { start: 8, end: 20 } });
    expect((await autopilot.getStatus()).state).toBe('blocked');
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
    expect((await autopilot.getStatus()).summary?.reasons).toMatchObject({ 'Tipe proyek bukan harga tetap': 1 });
  });

  it('rechecks a project after an outside-hours rejection without needing a policy edit', async () => {
    repository = await WorkspaceRepository.open();
    let currentTime = new Date('2026-10-15T16:00:00Z');
    await repository.savePolicy({ ...(await repository.getPolicy()), state: 'active', simulationOnly: false, allowedActions: ['bid.submit'], specializations: ['Python'], minimumConfidence: 0.5, activeHours: { start: 8, end: 19 }, allowUnknownDeadline: true });
    const submitBid = vi.fn(async () => ({ statusCode: 200, resultId: '9002' }));
    autopilot = new FreelancerAutopilot({ repository, now: () => currentTime, readProfile: async () => profile, readProjects: async () => ({ projects: [project], skipped: 0 }), submitBid });
    await autopilot.runCycle();
    expect(submitBid).not.toHaveBeenCalled();
    expect((await autopilot.getStatus()).waitingReason).toContain('jadwal');
    currentTime = new Date('2026-10-16T04:00:00Z');
    await autopilot.runCycle();
    expect(submitBid).toHaveBeenCalledTimes(1);
  });

  it('respects an owner deadline restriction on restart and rotates saved search terms', async () => {
    repository = await WorkspaceRepository.open();
    await repository.savePolicy({ ...(await repository.getPolicy()), state: 'active', simulationOnly: false, allowedActions: ['bid.submit'], specializations: ['Python'], keywords: ['React', 'Laravel', 'Flutter', 'Java', 'PHP', 'Rust', 'SQL', 'Docker', 'Linux'], allowUnknownDeadline: false });
    await repository.appendAudit({ type: 'autopilot.policy_bootstrapped', resourceId: 'policy', status: 'recorded', reason: 'test', policyVersion: 1, payloadHash: null });
    const readProjects = vi.fn(async () => ({ projects: [project], skipped: 0 }));
    const submitBid = vi.fn();
    autopilot = new FreelancerAutopilot({ repository, now: () => now, readProfile: async () => profile, readProjects, submitBid });
    await autopilot.start();
    await autopilot.runCycle();
    expect(submitBid).not.toHaveBeenCalled();
    expect((await repository.getPolicy()).allowUnknownDeadline).toBe(false);
    expect(readProjects.mock.calls).toHaveLength(4);
    expect((await autopilot.getStatus()).searchTerms).toEqual(['Laravel', 'Flutter']);
  });

  it('searches profile jobs in one request and rotates at most two keywords so every term is covered', async () => {
    repository = await WorkspaceRepository.open();
    const terms = ['Python', 'React', 'Laravel', 'Flutter', 'Java', 'PHP', 'Rust', 'SQL', 'Docker', 'Linux'];
    await repository.savePolicy({ ...(await repository.getPolicy()), state: 'active', simulationOnly: false, allowedActions: ['bid.submit'], specializations: ['Python'], keywords: terms.slice(1), allowUnknownDeadline: true });
    await repository.appendAudit({ type: 'autopilot.policy_bootstrapped', resourceId: 'policy', status: 'recorded', reason: 'test', policyVersion: 1, payloadHash: null });
    let clock = now;
    const readProjects = vi.fn(async () => ({ projects: [], skipped: 0 }));
    const readProjectsByJobs = vi.fn(async () => ({ projects: [], skipped: 0 }));
    autopilot = new FreelancerAutopilot({
      repository, now: () => clock, readProfile: async () => ({ ...profile, jobs: [{ id: 13, name: 'PHP' }, { id: 15, name: 'Python' }, { id: 99, name: 'Graphic Design' }] }),
      readProjects, readProjectsByJobs, submitBid: vi.fn(),
    });

    await autopilot.start();
    for (let cycle = 1; cycle < 5; cycle += 1) {
      clock = new Date(now.getTime() + cycle * 5 * 60_000);
      await autopilot.runCycle();
    }

    expect(readProjects).toHaveBeenCalledTimes(10);
    expect(new Set(readProjects.mock.calls.map((call) => (call as unknown as [string])[0]))).toEqual(new Set(terms));
    expect(readProjectsByJobs).toHaveBeenCalledTimes(5);
    const [jobIds, firstFrom, limit] = readProjectsByJobs.mock.calls[0] as unknown as [number[], number, number];
    expect([jobIds, limit]).toEqual([[13, 15], 50]);
    expect(firstFrom).toBe(Math.floor(now.getTime() / 1_000) - 3_600 - 120);
    expect((readProjectsByJobs.mock.calls[1] as unknown as [number[], number])[1]).toBe(Math.floor(now.getTime() / 1_000) - 120);
    expect((await autopilot.getStatus()).searchJobs).toEqual(['PHP', 'Python']);
  });

  it('doubles the scan interval after HTTP 429 and resets it after a successful scan', async () => {
    repository = await WorkspaceRepository.open();
    await repository.savePolicy({ ...(await repository.getPolicy()), state: 'active', simulationOnly: false, allowedActions: ['bid.submit'], specializations: ['Python'], scanIntervalMinutes: 5 });
    let limited = true;
    const readProjects = vi.fn(async () => {
      if (limited) throw Object.assign(new Error('Freelancer membatasi permintaan.'), { statusCode: 429 });
      return { projects: [], skipped: 0 };
    });
    autopilot = new FreelancerAutopilot({ repository, now: () => now, readProfile: async () => profile, readProjects, submitBid: vi.fn() });

    await autopilot.runCycle();
    expect(await autopilot.getStatus()).toMatchObject({ state: 'error', intervalMinutes: 10, nextRunAt: new Date(now.getTime() + 10 * 60_000).toISOString() });
    await autopilot.runCycle();
    await autopilot.runCycle();
    await autopilot.runCycle();
    expect((await autopilot.getStatus()).intervalMinutes).toBe(40);
    limited = false;
    await autopilot.runCycle();
    expect(await autopilot.getStatus()).toMatchObject({ state: 'running', intervalMinutes: 5 });
  });

  it('does not submit when the owner changes policy while Hermes is writing', async () => {
    repository = await WorkspaceRepository.open();
    const submitBid = vi.fn();
    const repo = repository;
    autopilot = new FreelancerAutopilot({ repository, now: () => now, readProfile: async () => profile, readProjects: async () => ({ projects: [project], skipped: 0 }), submitBid,
      draftProposal: async () => {
        const policy = await repo.getPolicy();
        await repo.savePolicy({ ...policy, minPrice: 500, version: policy.version + 1 });
        return { proposal: 'I will build and document your Python API for USD 100 over 14 days.', proposedPrice: 100, durationDays: 14, confidence: 0.9, evidence: [], assumptions: [] };
      },
    });
    await autopilot.start();
    expect(submitBid).not.toHaveBeenCalled();
    expect(await repo.hasAudit('marketplace.production.submit_bid', project.id)).toBe(false);
  });

  it('keeps its scheduler alive when a policy read fails temporarily', async () => {
    repository = await WorkspaceRepository.open();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let tickTime = now;
    autopilot = new FreelancerAutopilot({ repository, now: () => tickTime, intervalMs: 1_000, readProfile: async () => profile, readProjects: async () => ({ projects: [], skipped: 0 }), submitBid: vi.fn() });
    await autopilot.start();
    vi.spyOn(repository, 'getPolicy').mockRejectedValueOnce(new Error('temporary storage failure'));
    tickTime = new Date(now.getTime() + 1_001);
    await vi.advanceTimersByTimeAsync(1_001);
    expect((await autopilot.getStatus()).state).toBe('error');
    tickTime = new Date(now.getTime() + 2_002);
    await vi.advanceTimersByTimeAsync(1_001);
    expect((await autopilot.getStatus()).state).toBe('running');
  });

  it('keeps scanning but pauses new drafting for one hour after an API bid-quota rejection', async () => {
    repository = await WorkspaceRepository.open();
    await repository.savePolicy({ ...(await repository.getPolicy()), state: 'active', simulationOnly: false, allowedActions: ['bid.submit'], specializations: ['Python'], allowUnknownDeadline: true });
    await repository.appendAudit({ type: 'marketplace.production.submit_bid', resourceId: 'previous-project', status: 'failed', reason: 'HTTP 400: BID_LIMIT_EXCEEDED: You have used all of your bids.', policyVersion: 1, payloadHash: null, createdAt: now.toISOString() });
    let cycleTime = now;
    const draftProposal = vi.fn(async () => ({ proposal: 'I can build and document your Python API for USD 100 in 14 days.', proposedPrice: 100, durationDays: 14, confidence: 0.9, evidence: [], assumptions: [] }));
    const readProjects = vi.fn(async () => ({ projects: [project], skipped: 0 }));
    const submitBid = vi.fn(async () => ({ statusCode: 200, resultId: 'quota-recovered' }));
    autopilot = new FreelancerAutopilot({ repository, now: () => cycleTime, readProfile: async () => profile, readProjects, draftProposal, submitBid });
    await autopilot.start();
    expect(readProjects).toHaveBeenCalled();
    expect(draftProposal).not.toHaveBeenCalled();
    expect(submitBid).not.toHaveBeenCalled();
    expect((await autopilot.getStatus()).marketplaceNotice).toMatchObject({ quotaExhausted: true, retryAt: '2026-10-15T12:00:00.000Z' });
    cycleTime = new Date(now.getTime() + 61 * 60_000);
    await autopilot.runCycle();
    expect(submitBid).toHaveBeenCalledTimes(1);
  });

  it('does not draft or claim a browser bid while the transport is not ready', async () => {
    repository = await WorkspaceRepository.open();
    await repository.savePolicy({ ...(await repository.getPolicy()), state: 'active', simulationOnly: false, allowedActions: ['bid.submit'], specializations: ['Python'], allowUnknownDeadline: true });
    const submitBid = vi.fn(); const guardedSubmitBid = vi.fn();
    autopilot = new FreelancerAutopilot({ repository, now: () => now, readProfile: async () => profile, readProjects: async () => ({ projects: [project], skipped: 0 }), submitBid, guardedSubmitBid, bidTransportReady: () => ({ ready: false, reason: 'Login diperlukan.' }) });
    await autopilot.start();
    expect(guardedSubmitBid).not.toHaveBeenCalled(); expect(submitBid).not.toHaveBeenCalled();
    expect(await repository.hasAudit('marketplace.production.submit_bid', project.id)).toBe(false);
  });

  it('rechecks the kill switch through the browser callback before clicking submit', async () => {
    repository = await WorkspaceRepository.open();
    await repository.savePolicy({ ...(await repository.getPolicy()), state: 'active', simulationOnly: false, allowedActions: ['bid.submit'], specializations: ['Python'], allowUnknownDeadline: true });
    const clicked = vi.fn(); const submitBid = vi.fn();
    autopilot = new FreelancerAutopilot({ repository, now: () => now, readProfile: async () => profile, readProjects: async () => ({ projects: [project], skipped: 0 }), submitBid,
      guardedSubmitBid: async (_input, guard) => { await repository!.savePolicy({ ...(await repository!.getPolicy()), state: 'paused' }); await guard(); clicked(); return { statusCode: 200, resultId: '9999' }; },
    });
    await autopilot.start();
    expect(clicked).not.toHaveBeenCalled(); expect(submitBid).not.toHaveBeenCalled();
    expect((await repository.bidUsage(now, 'Asia/Jakarta')).today).toBe(0);
    expect((await repository.listProjects()).find(item=>item.id===project.id)?.pipelineStatus).toBe('reconciliation_required');
  });

  it('stops a pending draft before any live claim when the server shuts down', async () => {
    repository = await WorkspaceRepository.open();
    const submitBid = vi.fn();
    autopilot = new FreelancerAutopilot({ repository, now: () => now, readProfile: async () => profile, readProjects: async () => ({ projects: [project], skipped: 0 }), submitBid,
      draftProposal: async () => { autopilot!.stop(); return { proposal: 'I will document and build your Python API for USD 100 in 14 days.', proposedPrice: 100, durationDays: 14, confidence: 0.9, evidence: [], assumptions: [] }; },
    });
    await autopilot.start();
    expect(submitBid).not.toHaveBeenCalled();
    expect(await repository.hasAudit('marketplace.production.submit_bid', project.id)).toBe(false);
  });
});
