import { describe, expect, it } from 'vitest';
import type { AuditEvent, Autopilot, BusinessSyncStatus } from '../api/api.js';
import { deriveOfficeAgents, summarize } from './office-state.js';
import type { ProjectsCoIdStatus } from '../api/projects-co-id-api.js';

const autopilot = (overrides: Partial<Autopilot> = {}): Autopilot => ({
  state: 'running', cycleInProgress: false, lastRunAt: null, nextRunAt: null, lastMessage: 'Memindai.',
  lastImported: 0, lastSubmitted: 0, specializations: [], ...overrides,
});
const event = (type: string, id = type): AuditEvent => ({ id, type, resourceId: id, status: 'recorded', reason: '', policyVersion: null, payloadHash: null, createdAt: '2026-10-15T00:00:00.000Z' });
const agent = (agents: ReturnType<typeof deriveOfficeAgents>, id: string) => agents.find((item) => item.id === id)!;

describe('office state', () => {
  it('shows actual learning participants and preserves active business work', () => {
    const learning = { available: true, phase: 'discussing' as const, participantIds: ['market-scout', 'profile-editor'], activeSpeakerId: 'profile-editor' };
    const idle = deriveOfficeAgents(autopilot(), [], { learning });
    expect(agent(idle, 'market-scout')).toMatchObject({ state: 'collaborating', room: 'meeting', task: 'Mendengarkan diskusi rekan.' });
    expect(agent(idle, 'profile-editor').task).toBe('Menyusun tanggapan dan catatan belajar.');
    expect(agent(idle, 'knowledge-curator').state).toBe('idle');
    expect(agent(deriveOfficeAgents(autopilot({ cycleInProgress: true }), [], { learning }), 'market-scout').state).toBe('working');
    expect(agent(deriveOfficeAgents(autopilot(), [], { learning: { ...learning, available: false } }), 'market-scout').state).toBe('idle');
    expect(agent(deriveOfficeAgents(autopilot(), [], { learning: { ...learning, phase: 'error' } }), 'profile-editor').state).toBe('idle');
    expect(agent(deriveOfficeAgents(autopilot(), [], { learning: undefined }), 'profile-editor').state).toBe('idle');
  });
  it('shows projects.co.id scanning as offline while keeping stored drafts available', () => {
    const worker: ProjectsCoIdStatus = { mode: 'off', state: 'stopped', busy: false, reason: 'Pemindaian dinonaktifkan.', username: null, remaining: null, checkedAt: null, pageStatus: null, lastScanAt: null, lastResult: null, lastSearchTerms: [], searchTerms: [], autoAvailable: false, draftsInProgress: 0, projectCount: 4, readyDrafts: 2, blockedWrites: 0, draftUsage: { today: 0, week: 0, dailyLimit: 4, weeklyLimit: 12 } };
    const scout = (changes: Partial<ProjectsCoIdStatus> = {}) => agent(deriveOfficeAgents(autopilot(), [], { projectsCoId: { ...worker, ...changes } }), 'projects-co-id-scout');
    expect(scout()).toMatchObject({ state: 'offline', room: null, reason: 'Pemindaian dinonaktifkan.', floor: 1 });
    expect(scout({ draftsInProgress: 1 })).toMatchObject({ state: 'working', room: 'workspace', task: 'Menyusun draf projects.co.id.' });
    expect(agent(deriveOfficeAgents(autopilot(), []), 'projects-co-id-scout').state).toBe('unknown');
  });
  it('shows Hermes kanban work only from running cards on the team board', () => {
    const task = { id: 't_1', title: 'Analisis bid minggu ini', assignee: 'fvh-market-scout', status: 'running', createdBy: 'mission-control', createdAt: null, startedAt: null, completedAt: null, error: null };
    const kanban = { available: true, team: ['fvh-chief-of-staff', 'fvh-market-scout', 'fvh-qa-engineer'], tasks: [task, { ...task, id: 't_2', assignee: 'fvh-chief-of-staff' }, { ...task, id: 't_3', assignee: 'fvh-qa-engineer', status: 'done' }] };
    const agents = deriveOfficeAgents(autopilot({ state: 'paused' }), [], { kanban });
    expect(agent(agents, 'market-scout')).toMatchObject({ state: 'working', room: 'workspace', task: 'Analisis bid minggu ini' });
    expect(agent(agents, 'chief-of-staff')).toMatchObject({ state: 'collaborating', room: 'meeting' });
    expect(agent(agents, 'qa-engineer')).toMatchObject({ state: 'idle', reason: 'Siap mengerjakan kartu kanban Hermes.' });
    expect(agent(deriveOfficeAgents(autopilot(), []), 'qa-engineer').state).toBe('unknown');
    expect(agent(deriveOfficeAgents(autopilot(), [], { kanban: null }), 'qa-engineer').state).toBe('offline');
    expect(agent(deriveOfficeAgents(autopilot(), [], { kanban: { available: false, team: [], tasks: [] } }), 'qa-engineer')).toMatchObject({ state: 'unknown', reason: 'Kanban Hermes tidak dapat dibaca.' });
  });
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

  it('collaborates only when a live collaboration signal exists', () => {
    const idle = deriveOfficeAgents(autopilot(), [event('unrelated')]);
    expect(agent(idle, 'bid-strategist')).toMatchObject({ state: 'idle', room: 'lounge', task: null });
    expect(agent(idle, 'compliance-auditor')).toMatchObject({ state: 'idle', room: 'lounge', task: null });

    const cycle = deriveOfficeAgents(autopilot({ cycleInProgress: true }), []);
    expect(agent(cycle, 'bid-strategist').state).toBe('collaborating');
    expect(agent(cycle, 'compliance-auditor').state).toBe('collaborating');

    const noLongerRunning = deriveOfficeAgents(autopilot(), [], {
      learning: { available: true, phase: 'discussing', participantIds: ['bid-strategist'], activeSpeakerId: 'bid-strategist' },
    });
    expect(agent(noLongerRunning, 'bid-strategist')).toMatchObject({ state: 'collaborating', room: 'meeting' });
  });

  it('does not fabricate idle work, routes, or activity without matching signals', () => {
    const agents = deriveOfficeAgents(autopilot(), [event('unrelated')]);
    for (const id of ['market-scout', 'bid-strategist', 'compliance-auditor', 'profile-editor']) {
      expect(agent(agents, id)).toMatchObject({ state: 'idle', room: 'lounge', task: null, recentActivity: [] });
    }
    expect(agent(agents, 'market-scout').reason).toContain('tidak sedang menjalankan siklus');
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
    expect(summarize(agents)).toEqual({ working: 3, idle: 4, offline: 0, unknown: 13 });
    expect(summarize(deriveOfficeAgents(undefined, []))).toEqual({ working: 0, idle: 0, offline: 0, unknown: 20 });
  });

  it('keeps every owner-visible agent state in a safe room', () => {
    const agents = deriveOfficeAgents(autopilot({ state: 'paused' }), undefined);
    for (const item of agents) {
      if (item.state === 'offline') expect(item.room).toBeNull();
      else if (item.state === 'unknown') expect(item.room).toBe('lobby');
      else if (item.state === 'idle') expect(item.room).toBe('lounge');
      else if (item.state === 'collaborating') expect(item.room).toBe('meeting');
      else expect(item.room).toBe('workspace');
      expect(item.recentActivity.length).toBeLessThanOrEqual(3);
    }
  });
  it('shows dedicated floor staff only from actual operation signals',()=>{
    const operations={runtime:{running:true,jobs:{'delivery-manager':{busy:true,lastRunAt:null,error:null,reason:'Mengirim laporan ke Lead'},'lead-operations':{busy:true,lastRunAt:null,error:null,reason:'Meninjau'}}},whatsapp:{state:'disconnected',reason:'Belum terhubung',provider:'Baileys'},google:{connected:false,configured:false,reason:'Belum terhubung',redirectUri:''}};
    const agents=deriveOfficeAgents(autopilot(),[],{operations});
    expect(agent(agents,'delivery-manager')).toMatchObject({floor:2,state:'collaborating',room:'meeting'});
    expect(agent(agents,'lead-agent')).toMatchObject({state:'reviewing'});
    expect(agent(agents,'whatsapp-operator')).toMatchObject({state:'offline'});
    expect(agent(agents,'invoice-specialist')).toMatchObject({state:'idle'});
    expect(agent(deriveOfficeAgents(autopilot(),[]),'delivery-manager')).toMatchObject({state:'unknown'});
  });
});
