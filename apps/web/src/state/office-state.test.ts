import { describe, expect, it } from 'vitest';
import type { AuditEvent, Autopilot, BusinessSyncStatus } from './api.js';
import { deriveOfficeAgents, summarize } from './office-state.js';
import type { ProjectsCoIdStatus } from './projects-co-id-api.js';

const autopilot = (overrides: Partial<Autopilot> = {}): Autopilot => ({
  state: 'running', cycleInProgress: false, lastRunAt: null, nextRunAt: null, lastMessage: 'Memindai.',
  lastImported: 0, lastSubmitted: 0, specializations: [], ...overrides,
});
const event = (type: string, id = type): AuditEvent => ({ id, type, resourceId: id, status: 'recorded', reason: '', policyVersion: null, payloadHash: null, createdAt: '2026-10-15T00:00:00.000Z' });
const agent = (agents: ReturnType<typeof deriveOfficeAgents>, id: string) => agents.find((item) => item.id === id)!;

describe('office state', () => {
  it('derives the projects.co.id scout only from its current worker signal', () => {
    const worker: ProjectsCoIdStatus = { mode: 'scan-only', state: 'ready', busy: false, reason: 'Fixture', username: 'KhairulHuda06', remaining: null, checkedAt: null, pageStatus: 200, lastScanAt: null, lastResult: null, lastSearchTerms: [], searchTerms: [], autoAvailable: false, draftsInProgress: 0, projectCount: 4, readyDrafts: 2, blockedWrites: 0, draftUsage: { today: 1, week: 1, dailyLimit: 4, weeklyLimit: 12 } };
    const scout = (changes: Partial<ProjectsCoIdStatus> = {}) => agent(deriveOfficeAgents(autopilot(), [event('projects_co_id.scan_completed'), event('marketplace.production.submit_bid')], { projectsCoId: { ...worker, ...changes } }), 'projects-co-id-scout');
    expect(scout()).toMatchObject({ state: 'idle', room: 'lounge', task: '2 draf menunggu Anda kirim', floor: 1 });
    expect(scout({ busy: true, state: 'scanning' })).toMatchObject({ state: 'reviewing', room: 'workspace' });
    expect(scout({ busy: true, state: 'drafting', draftsInProgress: 1 })).toMatchObject({ state: 'working', room: 'workspace' });
    for (const state of ['stopped', 'paused', 'login_required', 'account_mismatch', 'challenge', 'error'] as const) expect(scout({ state })).toMatchObject({ state: 'offline', room: null });
    expect(scout({ mode: 'off' }).state).toBe('offline');
    expect(agent(deriveOfficeAgents(autopilot(), []), 'projects-co-id-scout').state).toBe('unknown');
    expect(scout().recentActivity.map(e => e.type)).toEqual(['projects_co_id.scan_completed']);
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

  it('routes activity to matching agents', () => {
    const agents = deriveOfficeAgents(autopilot(), [event('bid.created'), event('policy.checked'), event('knowledge.synced'), event('autopilot.policy_bootstrapped'), event('marketplace.projects_synced'), event('unrelated')]);
    expect(agent(agents, 'bid-strategist').recentActivity.map((item) => item.type)).toEqual(['bid.created']);
    expect(agent(agents, 'compliance-auditor').recentActivity.map((item) => item.type)).toEqual(['policy.checked']);
    expect(agent(agents, 'chief-of-staff').recentActivity).toHaveLength(3);
    const browserEvents = [event('browser.mode_changed'), {...event('marketplace.production.submit_bid'), reason:'Bid otomatis melalui API menghasilkan HTTP 200.'}, {...event('marketplace.production.submit_bid'), reason:'Bid otomatis melalui browser menghasilkan HTTP 200.'}];
    expect(agent(deriveOfficeAgents(autopilot(), browserEvents), 'browser-bid-operator').recentActivity).toEqual([browserEvents[0], browserEvents[2]]);
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

  it('shows browser staff working only from a real browser job', () => {
    const browser = { mode:'browser' as const,state:'ready' as const,busy:false,reason:'Siap',username:'fixture',remaining:3,checkedAt:new Date().toISOString(),pageStatus:200,lastRunAt:null,lastResult:null };
    expect(agent(deriveOfficeAgents(autopilot(),[],{browserBidding:browser}),'browser-bid-operator')).toMatchObject({state:'idle',floor:1});
    expect(agent(deriveOfficeAgents(autopilot(),[],{browserBidding:{...browser,state:'submitting',busy:true}}),'browser-bid-operator')).toMatchObject({state:'working',room:'workspace'});
    expect(agent(deriveOfficeAgents(autopilot(),[],{browserBidding:{...browser,state:'login_required'}}),'browser-bid-operator')).toMatchObject({state:'offline'});
    expect(agent(deriveOfficeAgents(autopilot(),[]),'browser-bid-operator')).toMatchObject({state:'unknown'});
  });
  it('summarizes derived states', () => {
    const agents = deriveOfficeAgents(autopilot({ cycleInProgress: true }), []);
    expect(summarize(agents)).toEqual({ working: 3, idle: 4, offline: 0, unknown: 14 });
    expect(summarize(deriveOfficeAgents(undefined, []))).toEqual({ working: 0, idle: 0, offline: 0, unknown: 21 });
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
