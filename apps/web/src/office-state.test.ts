import { describe, expect, it } from 'vitest';
import type { AuditEvent, Autopilot, BusinessSyncStatus } from './api.js';
import { deriveOfficeAgents, summarize } from './office-state.js';

const autopilot = (overrides: Partial<Autopilot> = {}): Autopilot => ({
  state: 'running', cycleInProgress: false, lastRunAt: null, nextRunAt: null, lastMessage: 'Memindai.',
  lastImported: 0, lastSubmitted: 0, specializations: [], ...overrides,
});
const event = (type: string, id = type): AuditEvent => ({ id, type, resourceId: id, status: 'recorded', reason: '', policyVersion: null, payloadHash: null, createdAt: '2026-10-15T00:00:00.000Z' });
const agent = (agents: ReturnType<typeof deriveOfficeAgents>, id: string) => agents.find((item) => item.id === id)!;

describe('office state', () => {
  it('uses real knowledge sync activity and explains schedule waits', () => {
    expect(agent(deriveOfficeAgents(autopilot(), [], { knowledge: { state: 'running', provider: 'github', current: 'owner/repo' } }), 'knowledge-curator')).toMatchObject({ state: 'working', room: 'workspace', task: 'owner/repo' });
    expect(agent(deriveOfficeAgents(autopilot(), [], { knowledge: { state: 'completed', provider: 'github', current: null } }), 'knowledge-curator')).toMatchObject({ state: 'idle' });
    expect(agent(deriveOfficeAgents(autopilot({ waitingReason: 'Menunggu jadwal operasi.' }), []), 'market-scout').reason).toBe('Menunggu jadwal operasi.');
  });
  it('marks scout unknown when autopilot is undefined', () => {
    expect(agent(deriveOfficeAgents(undefined, undefined), 'market-scout')).toMatchObject({ state: 'unknown', room: 'lobby' });
  });

  it('maps running cycle to workspace work and collaboration', () => {
    const agents = deriveOfficeAgents(autopilot({ cycleInProgress: true }), []);
    expect(agent(agents, 'market-scout')).toMatchObject({ state: 'working', room: 'workspace' });
    expect(agent(agents, 'bid-strategist')).toMatchObject({ state: 'collaborating', room: 'meeting' });
  });

  it('maps running idle to lounge and paused to offline', () => {
    expect(agent(deriveOfficeAgents(autopilot(), []), 'market-scout')).toMatchObject({ state: 'idle', room: 'lounge' });
    expect(agent(deriveOfficeAgents(autopilot({ state: 'paused' }), []), 'market-scout')).toMatchObject({ state: 'offline', room: null, reason: 'Autopilot dijeda melalui kill switch.' });
  });

  it('routes activity to matching agents', () => {
    const agents = deriveOfficeAgents(autopilot(), [event('bid.created'), event('policy.checked'), event('knowledge.synced'), event('autopilot.policy_bootstrapped'), event('marketplace.projects_synced'), event('unrelated')]);
    expect(agent(agents, 'bid-strategist').recentActivity.map((item) => item.type)).toEqual(['bid.created']);
    expect(agent(agents, 'compliance-auditor').recentActivity.map((item) => item.type)).toEqual(['policy.checked']);
    expect(agent(agents, 'chief-of-staff').recentActivity).toHaveLength(3);
  });

  it('uses business sync, inbox, and deadlines as real signals', () => {
    const sync = (overrides: Partial<BusinessSyncStatus> = {}): BusinessSyncStatus => ({
      step: null, outcomes: { lastRunAt: null, ok: true, error: null, checked: 0 },
      messages: { lastRunAt: null, ok: true, error: null, threads: 2, selfId: '7' }, ...overrides,
    });
    expect(agent(deriveOfficeAgents(autopilot({ state: 'paused' }), [], { sync: sync({ step: 'outcomes' }) }), 'bid-strategist'))
      .toMatchObject({ state: 'reviewing', room: 'workspace', task: 'Memeriksa status bid yang menunggu.' });
    expect(agent(deriveOfficeAgents(autopilot(), [], { sync: sync({ step: 'messages' }) }), 'client-relations')).toMatchObject({ state: 'working', room: 'workspace' });
    expect(agent(deriveOfficeAgents(autopilot(), [], { sync: sync(), inboxWaiting: 2 }), 'client-relations')).toMatchObject({ state: 'idle', task: '2 pesan menunggu balasan' });
    expect(agent(deriveOfficeAgents(autopilot(), [], { sync: sync({ messages: { lastRunAt: null, ok: false, error: 'HTTP 429', threads: 0, selfId: null } }) }), 'client-relations'))
      .toMatchObject({ state: 'offline', reason: 'Sinkronisasi pesan gagal: HTTP 429' });
    expect(agent(deriveOfficeAgents(autopilot(), []), 'client-relations')).toMatchObject({ state: 'unknown', room: 'lobby' });
    expect(agent(deriveOfficeAgents(autopilot(), [], { dueSoon: 1 }), 'operations-analyst')).toMatchObject({ state: 'reviewing', room: 'workspace' });
    expect(agent(deriveOfficeAgents(autopilot(), [], { dueSoon: 0 }), 'operations-analyst')).toMatchObject({ state: 'idle' });
  });

  it('derives the Hermes lead from real drafting status', () => {
    const lead = (hermes?: { active: boolean; reason: string; draftsInProgress?: number }) => agent(deriveOfficeAgents(autopilot(), [], { hermes }), 'lead-agent');
    expect(lead()).toMatchObject({ state: 'unknown', room: 'lobby' });
    expect(lead({ active: false, reason: 'Persetujuan belum diberikan.' })).toMatchObject({ state: 'offline', room: null, reason: 'Persetujuan belum diberikan.' });
    expect(lead({ active: true, reason: '', draftsInProgress: 0 })).toMatchObject({ state: 'idle', room: 'lounge' });
    expect(lead({ active: true, reason: '', draftsInProgress: 1 })).toMatchObject({ state: 'working', room: 'workspace', task: 'Menyusun 1 draf proposal.' });
  });

  it('summarizes derived states', () => {
    const agents = deriveOfficeAgents(autopilot({ cycleInProgress: true }), []);
    expect(summarize(agents)).toEqual({ working: 3, idle: 4, offline: 1, unknown: 2 });
    expect(summarize(deriveOfficeAgents(undefined, []))).toEqual({ working: 0, idle: 0, offline: 1, unknown: 9 });
  });
});
