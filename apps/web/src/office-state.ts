import type { AuditEvent, Autopilot, BusinessSyncStatus } from './api.js';

export type AgentState = 'working' | 'reviewing' | 'collaborating' | 'idle' | 'offline' | 'unknown';
// Lobby is the neutral spot for agents whose state cannot be determined.
export type RoomKey = 'workspace' | 'meeting' | 'lounge' | 'lobby';
export type RoomId = RoomKey | null;

export const ROOM_LABELS: Record<RoomKey, string> = { workspace: 'Workspace', meeting: 'Ruang Rapat', lounge: 'Lounge', lobby: 'Lobby' };
export const STATE_LABELS: Record<AgentState, string> = { working: 'Bekerja', reviewing: 'Meninjau', collaborating: 'Berkolaborasi', idle: 'Idle', offline: 'Offline', unknown: 'Tidak diketahui' };
export const STATE_COLORS: Record<AgentState, string> = { working: '#2f9e44', reviewing: '#2f9e44', collaborating: '#1c7ed6', idle: '#e8a317', offline: '#868e96', unknown: '#9c6ade' };

export type OfficeAgent = {
  id: string;
  name: string;
  role: string;
  color: string;
  state: AgentState;
  room: RoomId;
  reason: string;
  task: string | null;
  recentActivity: AuditEvent[];
};

type RosterEntry = Pick<OfficeAgent, 'id' | 'name' | 'role' | 'color'>;

export const ROSTER: RosterEntry[] = [
  { id: 'chief-of-staff', name: 'Chief of Staff', role: 'Orchestrator Ruang Kerja', color: '#e76f51' },
  { id: 'market-scout', name: 'Market Scout', role: 'Pencari & Penilai Pasar', color: '#2a9d8f' },
  { id: 'bid-strategist', name: 'Bid Strategist', role: 'Perumus Proposal & Harga', color: '#e9c46a' },
  { id: 'profile-editor', name: 'Profile Editor', role: 'Kurator Profil & Bukti', color: '#f4a261' },
  { id: 'client-relations', name: 'Client Relations', role: 'Manajer Komunikasi Klien', color: '#457b9d' },
  { id: 'operations-analyst', name: 'Operations Analyst', role: 'Analis Pipeline & Jadwal', color: '#6a4c93' },
  { id: 'knowledge-curator', name: 'Knowledge Curator', role: 'Kurator Pengetahuan & Kode', color: '#8ab17d' },
  { id: 'compliance-auditor', name: 'Compliance Auditor', role: 'Auditor Kebijakan & Keamanan', color: '#d62828' },
  { id: 'qa-engineer', name: 'QA Engineer', role: 'Verifikator Kontrak & Smoke', color: '#277da1' },
];

const WORK_REASON = 'Siklus autopilot sedang berjalan.';
const IDLE_REASON = 'Autopilot siap, tetapi tidak sedang menjalankan siklus.';
const ON_DEMAND_REASON = 'Hanya bekerja saat dipanggil; tidak ada proses latar.';

function autopilotState(autopilot: Autopilot | undefined, collaborating: boolean): { state: AgentState; reason: string } {
  if (!autopilot || autopilot.state === 'starting' || (autopilot.state === 'running' && autopilot.cycleInProgress === undefined)) {
    return { state: 'unknown', reason: 'Status autopilot belum diketahui.' };
  }
  if (autopilot.state === 'running') {
    return autopilot.cycleInProgress
      ? { state: collaborating ? 'collaborating' : 'working', reason: WORK_REASON }
      : { state: 'idle', reason: IDLE_REASON };
  }
  const reason = autopilot.state === 'paused'
    ? 'Autopilot dijeda melalui kill switch.'
    : autopilot.state === 'blocked'
      ? 'Kebijakan belum mengizinkan bid live.'
      : autopilot.state === 'error'
        ? `Autopilot mengalami kesalahan: ${autopilot.lastMessage}`
        : 'Autopilot tidak sedang berjalan.';
  return { state: 'offline', reason };
}

function roomFor(state: AgentState): RoomId {
  if (state === 'working' || state === 'reviewing') return 'workspace';
  if (state === 'collaborating') return 'meeting';
  if (state === 'idle') return 'lounge';
  return state === 'unknown' ? 'lobby' : null;
}

function activityFor(id: string, activity: AuditEvent[]): AuditEvent[] {
  if (id === 'chief-of-staff') return activity.slice(0, 3);
  const matches = (event: AuditEvent): boolean => {
    if (id === 'market-scout') return ['marketplace.projects_synced', 'marketplace.sync_failed', 'autopilot.cycle'].includes(event.type);
    if (id === 'bid-strategist') return event.type.startsWith('bid.') || event.type === 'marketplace.production.submit_bid';
    if (id === 'compliance-auditor') return event.type === 'autopilot.bid_skipped' || event.type.startsWith('policy.');
    if (id === 'profile-editor') return event.type === 'profile.updated' || event.type === 'marketplace.production.edit_profile';
    if (id === 'knowledge-curator') return event.type.startsWith('knowledge.');
    if (id === 'operations-analyst') return event.type === 'autopilot.policy_bootstrapped';
    return false;
  };
  return activity.filter(matches).slice(0, 3);
}

export type OfficeStateOverride = Partial<Record<string, { state: AgentState; reason?: string }>> | boolean;

export function deriveOfficeAgents(autopilot: Autopilot | undefined, activity: AuditEvent[] | undefined, syncOrOverrides?: BusinessSyncStatus | OfficeStateOverride, overrides?: OfficeStateOverride): OfficeAgent[] {
  const events = activity ?? [];
  const sync = typeof syncOrOverrides === 'object' && syncOrOverrides !== null && 'step' in syncOrOverrides ? syncOrOverrides : undefined;
  const effectiveOverrides = overrides ?? (sync ? undefined : syncOrOverrides);
  const syncInProgress = effectiveOverrides === true;
  return ROSTER.map((entry) => {
    let state: AgentState;
    let reason: string;
    if (entry.id === 'market-scout') ({ state, reason } = autopilotState(autopilot, false));
    else if (entry.id === 'bid-strategist' || entry.id === 'compliance-auditor') ({ state, reason } = autopilotState(autopilot, true));
    else if (['chief-of-staff', 'profile-editor', 'operations-analyst', 'knowledge-curator'].includes(entry.id)) ({ state, reason } = autopilot ? { state: 'idle', reason: ON_DEMAND_REASON } : { state: 'unknown', reason: 'Data server tidak tersedia.' });
    else if (entry.id === 'client-relations') ({ state, reason } = { state: 'offline', reason: 'Fitur pesan belum aktif.' });
    else ({ state, reason } = { state: 'offline', reason: 'Tidak ada komponen runtime; tes dijalankan di luar aplikasi.' });
    const override = typeof effectiveOverrides === 'object' && effectiveOverrides !== null ? (effectiveOverrides as Record<string, { state: AgentState; reason?: string }>)[entry.id] : undefined;
    if (syncInProgress && entry.id === 'market-scout') {
      state = 'working';
      reason = 'Sinkronisasi proyek Freelancer sedang berjalan.';
    } else if (sync?.step && entry.id === 'bid-strategist') {
      state = 'reviewing';
      reason = 'Meninjau hasil bid Freelancer.';
    } else if (override) {
      state = override.state;
      reason = override.reason ?? `Status disinkronkan dari server: ${STATE_LABELS[state]}.`;
    }
    return { ...entry, state, room: roomFor(state), reason, task: sync?.step && entry.id === 'bid-strategist' ? 'Meninjau hasil bid Freelancer.' : (state === 'working' || state === 'collaborating') ? autopilot?.lastMessage ?? null : null, recentActivity: activityFor(entry.id, events) };
  });
}

export function summarize(agents: OfficeAgent[]): { working: number; idle: number; offline: number; unknown: number } {
  return agents.reduce((counts, agent) => {
    if (agent.state === 'working' || agent.state === 'reviewing' || agent.state === 'collaborating') counts.working += 1;
    else if (agent.state === 'idle') counts.idle += 1;
    else if (agent.state === 'offline') counts.offline += 1;
    else counts.unknown += 1;
    return counts;
  }, { working: 0, idle: 0, offline: 0, unknown: 0 });
}
