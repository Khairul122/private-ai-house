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
    repository = new WorkspaceRepository();
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

    expect(autopilot.getStatus().cycleInProgress).toBe(false);
    await autopilot.start();
    expect(autopilot.getStatus()).toMatchObject({ state: 'running', lastSubmitted: 1 });
    await autopilot.runCycle();

    expect(repository.getPolicy()).toMatchObject({ state: 'active', simulationOnly: false, allowedActions: ['bid.submit'], specializations: ['Python'] });
    expect(submitBid).toHaveBeenCalledTimes(1);
    expect(syncProfileJobs).toHaveBeenCalledExactlyOnceWith([15]);
    expect(repository.hasAudit('marketplace.production.edit_profile', 'freelancer-profile-sync')).toBe(true);
    expect(submitBid).toHaveBeenCalledWith(expect.objectContaining({ projectId: 71, amount: 100, period: 14 }));
    expect(repository.listProjects().find((item) => item.id === project.id)?.pipelineStatus).toBe('submitted');
    expect(autopilot.getStatus()).toMatchObject({ state: 'running', lastSubmitted: 0 });
  });

  it('stays blocked when the public profile does not support any listed skill', async () => {
    repository = new WorkspaceRepository();
    const submitBid = vi.fn();
    autopilot = new FreelancerAutopilot({
      repository,
      now: () => now,
      readProfile: async () => ({ ...profile, description: 'A general freelance profile', jobs: [{ id: 22, name: 'Python' }] }),
      readProjects: async () => ({ projects: [project], skipped: 0 }),
      submitBid,
    });

    await autopilot.start();

    expect(autopilot.getStatus()).toMatchObject({ state: 'blocked' });
    expect(submitBid).not.toHaveBeenCalled();
    expect(repository.getPolicy().state).toBe('draft');
  });

  it('skips projects without supported fixed USD price semantics', async () => {
    repository = new WorkspaceRepository();
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
    expect(autopilot.getStatus()).toMatchObject({ state: 'running', lastSubmitted: 0 });
  });
});
