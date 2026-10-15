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

  it('overrides scout while marketplace sync is running', () => {
    expect(agent(deriveOfficeAgents(autopilot(), [], true), 'market-scout')).toMatchObject({ state: 'working', room: 'workspace' });
  });

  it('marks bid strategist reviewing during business sync', () => {
    const sync: BusinessSyncStatus = { state: 'running', outcomes: { state: 'running', checked: 0, error: null }, step: 'outcomes', lastRunAt: null, lastMessage: null };
    expect(agent(deriveOfficeAgents(autopilot(), [], sync), 'bid-strategist')).toMatchObject({ state: 'reviewing', room: 'workspace', reason: 'Memeriksa hasil bid di Freelancer.', task: 'Memeriksa status bid yang menunggu.' });
  });

  it('summarizes derived states', () => {
    const agents = deriveOfficeAgents(autopilot({ cycleInProgress: true }), []);
    expect(summarize(agents)).toEqual({ working: 3, idle: 4, offline: 2, unknown: 0 });
    expect(summarize(deriveOfficeAgents(undefined, []))).toEqual({ working: 0, idle: 0, offline: 2, unknown: 7 });
  });
});
