import type { AuditEvent, Autopilot, BusinessSyncStatus } from '../api/api.js';
import { OPERATIONS_ROSTER, OFFICE_ROSTER as ROSTER } from '@fvh/domain';
import type { OperationsData } from '../api/operations-api.js';
import type { ProjectsCoIdStatus } from '../api/projects-co-id-api.js';
import type { HermesKanbanStatus } from '../../../server/src/models/hermes-kanban-types.js';
import type { OfficeLearningStatus } from '../../../server/src/models/office-learning-types.js';

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
  floor?: 1 | 2;
  state: AgentState;
  room: RoomId;
  reason: string;
  task: string | null;
  recentActivity: AuditEvent[];
};

export { OFFICE_ROSTER as ROSTER } from '@fvh/domain';

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
      : { state: 'idle', reason: autopilot.waitingReason ?? IDLE_REASON };
  }
  const reason = autopilot.state === 'paused'
    ? 'Autopilot dijeda melalui kill switch.'
    : autopilot.state === 'blocked'
      ? autopilot.waitingReason ?? 'Kebijakan belum mengizinkan bid live.'
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
    if (id === 'projects-co-id-scout') return event.type.startsWith('projects_co_id.') || event.type === 'autopilot.draft_fallback' && event.resourceId.startsWith('projects_co_id:');
    if (id === 'market-scout') return ['marketplace.projects_synced', 'marketplace.sync_failed', 'autopilot.cycle'].includes(event.type);
    if (id === 'bid-strategist') return event.type.startsWith('bid.') || event.type === 'marketplace.production.submit_bid';
    if (id === 'compliance-auditor') return event.type === 'autopilot.bid_skipped' || event.type.startsWith('policy.');
    if (id === 'profile-editor') return event.type === 'profile.updated' || event.type === 'marketplace.production.edit_profile';
    if (id === 'knowledge-curator') return event.type.startsWith('knowledge.');
    if (id === 'lead-agent') return event.type === 'bid.draft_created' || event.type === 'bid.draft_failed';
    if (id === 'operations-analyst') return event.type === 'autopilot.policy_bootstrapped' || event.type.startsWith('work.');
    return false;
  };
  return activity.filter(matches).slice(0, 3);
}

/** Extra real signals beyond the autopilot. `undefined` means the source could not be loaded. */
export type OfficeContext = {
  learning?: Pick<OfficeLearningStatus, 'available' | 'phase' | 'participantIds' | 'activeSpeakerId'> | null | undefined;
  projectsCoId?: ProjectsCoIdStatus | null | undefined;
  /** Hermes kanban board `fvh-house`; each employee is the profile `fvh-<id>`. */
  kanban?: Pick<HermesKanbanStatus, 'available' | 'team' | 'tasks'> | null | undefined;
  operations?: Pick<OperationsData,'runtime'|'whatsapp'|'google'> | undefined;
  sync?: BusinessSyncStatus | null | undefined;
  hermes?: { active: boolean; reason: string; draftsInProgress?: number | undefined } | undefined;
  inboxWaiting?: number | undefined;
  dueSoon?: number | undefined;
  knowledge?: { state: string; provider: string; current: string | null } | null | undefined;
};

type Derived = { state: AgentState; reason: string; task?: string | null };

function clientRelationsState(sync: BusinessSyncStatus | null | undefined, inboxWaiting: number | undefined): Derived {
  if (!sync) return { state: 'unknown', reason: 'Status sinkronisasi pesan tidak tersedia.' };
  if (sync.step === 'messages') return { state: 'working', reason: 'Membaca pesan klien dari Freelancer.', task: 'Sinkronisasi kotak masuk.' };
  if (sync.messages.ok === false) return { state: 'offline', reason: `Sinkronisasi pesan gagal: ${sync.messages.error ?? 'tidak diketahui'}` };
  if (sync.messages.ok === null) return { state: 'unknown', reason: 'Pesan belum pernah disinkronkan.' };
  return { state: 'idle', reason: 'Kotak masuk tersinkron.', task: inboxWaiting ? `${inboxWaiting} pesan menunggu balasan` : null };
}

function leadState(hermes: OfficeContext['hermes']): Derived {
  if (!hermes) return { state: 'unknown', reason: 'Status Hermes tidak tersedia.' };
  if (!hermes.active) return { state: 'offline', reason: hermes.reason };
  if (hermes.draftsInProgress) return { state: 'working', reason: 'Menyusun draf proposal dengan Hermes.', task: `Menyusun ${hermes.draftsInProgress} draf proposal.` };
  return { state: 'idle', reason: 'Hermes siap; bekerja saat draf proposal diminta.', task: null };
}

export function deriveOfficeAgents(autopilot: Autopilot | undefined, activity: AuditEvent[] | undefined, context: OfficeContext = {}): OfficeAgent[] {
  const events = activity ?? [];
  const { sync, hermes, inboxWaiting, dueSoon } = context;
  return ROSTER.map((entry) => {
    let derived: Derived;
    const signal=context.operations?.runtime.jobs[entry.id];
    const card = context.kanban?.tasks.find(t => t.status === 'running' && t.assignee === `fvh-${entry.id}`);
    if (card) derived = { state: entry.id === 'chief-of-staff' ? 'collaborating' : 'working', reason: 'Mengerjakan kartu kanban Hermes.', task: card.title };
    else if (entry.id === 'projects-co-id-scout') {
      const worker = context.projectsCoId;
      if (!worker) derived = { state: 'unknown', reason: 'Status projects.co.id tidak tersedia.' };
      else if (worker.draftsInProgress > 0) derived = { state: 'working', reason: 'Menyusun draf proyek tersimpan.', task: 'Menyusun draf projects.co.id.' };
      else if (worker.mode === 'off' || ['paused', 'login_required', 'account_mismatch', 'challenge', 'stopped', 'error'].includes(worker.state)) derived = { state: 'offline', reason: worker.reason };
      else if (worker.busy) derived = { state: 'reviewing', reason: worker.reason, task: worker.reason };
      else derived = { state: 'idle', reason: worker.reason, task: `${worker.readyDrafts} draf menunggu Anda kirim` };
    }
    else if (entry.id === 'lead-agent' && context.operations?.runtime.jobs['lead-operations']?.busy) derived={state:'reviewing',reason:'Hermes meninjau laporan manajer.',task:'Kolaborasi dengan manajer lantai 1 dan 2.'};
    else if (OPERATIONS_ROSTER.some(a=>a.id===entry.id)) {
      if(!context.operations) derived={state:'unknown',reason:'Status operasional tidak tersedia.'};
      else if(signal?.busy) derived={state:entry.id.includes('manager')?'collaborating':'working',reason:signal.reason,task:signal.reason};
      else if(signal?.error) derived={state:'offline',reason:signal.error};
      else if(entry.id==='whatsapp-operator' && context.operations.whatsapp?.state!=='connected') derived={state:'offline',reason:context.operations.whatsapp?.reason ?? 'WhatsApp belum terhubung.'};
      else if(entry.id==='calendar-operator' && !context.operations.google?.connected) derived={state:'offline',reason:context.operations.google?.reason ?? 'Google Calendar belum terhubung.'};
      else derived={state:'idle',reason:signal?.reason ?? 'Siap; bekerja saat ada tugas sesuai peran.'};
    }
    else if (entry.id === 'lead-agent') derived = leadState(hermes);
    else if (entry.id === 'market-scout') derived = autopilotState(autopilot, false);
    else if (entry.id === 'bid-strategist' && sync?.step === 'outcomes') derived = { state: 'reviewing', reason: 'Memeriksa hasil bid di Freelancer.', task: 'Memeriksa status bid yang menunggu.' };
    else if (entry.id === 'bid-strategist' || entry.id === 'compliance-auditor') derived = autopilotState(autopilot, true);
    else if (entry.id === 'client-relations') derived = clientRelationsState(sync, inboxWaiting);
    else if (entry.id === 'knowledge-curator' && context.knowledge?.state === 'running') derived = { state: 'working', reason: `Sinkronisasi API ${context.knowledge.provider} sedang berjalan.`, task: context.knowledge.current ?? 'Membaca sumber Knowledge Hub.' };
    else if (entry.id === 'operations-analyst' && autopilot && dueSoon) derived = { state: 'reviewing', reason: `Memantau ${dueSoon} tenggat proyek dalam 48 jam.`, task: `Memantau ${dueSoon} tenggat proyek dalam 48 jam.` };
    else if (['chief-of-staff', 'profile-editor', 'operations-analyst', 'knowledge-curator'].includes(entry.id)) derived = autopilot ? { state: 'idle', reason: ON_DEMAND_REASON } : { state: 'unknown', reason: 'Data server tidak tersedia.' };
    else if (context.kanban?.team.includes(`fvh-${entry.id}`)) derived = { state: 'idle', reason: 'Siap mengerjakan kartu kanban Hermes.' };
    else if (context.kanban === undefined || (context.kanban && !context.kanban.available)) derived = { state: 'unknown', reason: context.kanban ? 'Kanban Hermes tidak dapat dibaca.' : 'Status kanban Hermes belum tersedia.' };
    else derived = { state: 'offline', reason: 'Tidak ada komponen runtime; tes dijalankan di luar aplikasi.' };
    const learning = context.learning;
    if (learning?.available && ['learning', 'discussing'].includes(learning.phase) && learning.participantIds.includes(entry.id) && !['working', 'reviewing', 'collaborating'].includes(derived.state)) {
      derived = { state: 'collaborating', reason: 'Mengikuti sesi belajar internal Hermes.', task: learning.activeSpeakerId === entry.id ? 'Menyusun tanggapan dan catatan belajar.' : 'Mendengarkan diskusi rekan.' };
    }
    const { state, reason } = derived;
    const task = derived.task !== undefined ? derived.task : (state === 'working' || state === 'collaborating') ? autopilot?.lastMessage ?? null : null;
    return { ...entry, state, room: roomFor(state), reason, task, recentActivity: activityFor(entry.id, events) };
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
