import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { api, jsonRequest, type AuditEvent, type Autopilot, type BidDraft, type BusinessSyncStatus, type Capabilities, type Inbox, type Opportunity, type Policy, type Profile, type Work } from '../api/api.js';
import { deriveOfficeAgents, ROOM_LABELS, STATE_COLORS, STATE_LABELS, summarize, type AgentState } from '../state/office-state.js';
import { BOARDS, dayPhase, FLOOR, LIFT, OWNER_SPOT, PODS, spotsFor, ZONES, type BoardId, type P2, type Spot, FLOOR_TWO_PODS } from '../state/office-layout.js';
import type { BoardContent, CameraCommand } from './VisualOffice.js';
import { bindOwnerKeyboard, createOwnerInput, type OwnerDirection, type OwnerInput } from '../state/owner-input.js';
import type { ProjectsCoIdStatus } from '../api/projects-co-id-api.js';
import type { BrowserBiddingStatus } from '../api/browser-bidding-api.js';
import type { OperationsData } from '../api/operations-api.js';
import { OPERATIONS_ROSTER } from '@fvh/domain';
import { formatMoney, formatDate, activityTitle } from '../components/format.js';
import { kanbanQuery } from '../api/queries.js';
import { StateLabel, useClock } from '../components/ui.js';

const VisualOffice = lazy(() => import('./VisualOffice.js'));

type OfficeIconName = 'grid' | 'search' | 'expand' | 'cube' | 'top' | 'play' | 'target' | 'users' | 'activity' | 'signal' | 'close' | 'pin' | 'sun';

function OfficeIcon({ name }: { name: OfficeIconName }) {
  const paths: Record<OfficeIconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    expand: <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />,
    cube: <><path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="m3 7 9 5 9-5M12 12v10" /></>,
    top: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 12h18M12 3v18" /></>,
    play: <path d="m7 4 13 8-13 8z" />,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" /></>,
    activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    signal: <><path d="M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r="1" /></>,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  };
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const initials = (name: string) => name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase();
const zoneOf = (spot: Spot | undefined) => spot && ZONES.find((zone) => Math.abs(spot.x - zone.x) <= zone.w / 2 && Math.abs(spot.z - zone.z) <= zone.d / 2)?.id;
const wideScreen = () => window.matchMedia('(min-width: 900px)').matches;

type StateChange = { key: string; at: string; name: string; from: AgentState; to: AgentState };

const SHEET_TITLES: Record<string, string> = { '/overview': 'Ringkasan', ...Object.fromEntries(BOARDS.map((board) => [board.route, board.label])) };
const BOARD_ACCENTS: Record<BoardId, string> = {
  'projects-co-id': '#476b68',
  operations:'#67518b',
  opportunities: '#2a9d8f', pipeline: '#457b9d', tasks: '#6a4c93', calendar: '#e76f51', inbox: '#1c7ed6', work: '#2f9e44',
  activity: '#495057', agents: '#d62828', profile: '#f4a261', policy: '#9c6ade', knowledge: '#8ab17d', capabilities: '#277da1',
};

type ShellData = {
  projectsCoId?: ProjectsCoIdStatus | null | undefined;
  operations?: OperationsData | undefined;
  dashboard?: { counts: { openProjects: number; drafts: number; submittedBids: number; policySkips: number; knowledgeSources: number }; policy: { state: Policy['state'] }; bidUsage?: { today: number; week: number }; externalWrites: boolean } | undefined;
  autopilot?: Autopilot | undefined; pipeline?: Opportunity[] | undefined; policy?: Policy | undefined; profile?: Profile | undefined;
  knowledge?: { coverage: { sources: number; chunks: number } } | undefined; capabilities?: Capabilities | undefined;
  inbox?: Inbox | undefined; work?: Work | undefined; activity?: AuditEvent[] | undefined; counts: ReturnType<typeof summarize>;
};

const timeOf = (value: string) => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const moneyList = (rows: Array<{ currency: string; total: number }>) => rows.length ? rows.map((row) => formatMoney(row.total, row.currency)).join(' · ') : '–';
const POLICY_STATE: Record<Policy['state'], string> = { active: 'Kebijakan aktif', paused: 'Kebijakan dijeda', draft: 'Kebijakan belum aktif' };

/** Board summaries are built only from loaded API data; a failed source shows "Tidak tersedia". */
function buildBoards(data: ShellData): BoardContent[] {
  const unavailable = ['Tidak tersedia', 'Data gagal dimuat'];
  const count = (status: string[]) => data.pipeline?.filter((item) => status.includes(item.pipelineStatus)).length ?? 0;
  const lines: Record<BoardId, { lines: string[]; alert?: boolean }> = {
    'projects-co-id': data.projectsCoId ? { lines: [`${data.projectsCoId.readyDrafts} draf siap`, data.projectsCoId.reason] } : { lines: unavailable },
    operations:data.operations?{lines:[`${data.operations.projects.filter(p=>p.status==='active').length} proyek aktif`,`${data.operations.tasks.filter(t=>!t.done).length} tugas · ${data.operations.invoices.length} invoice`]}:{lines:unavailable},
    opportunities: data.dashboard ? { lines: [`${data.dashboard.counts.openProjects} peluang`, data.autopilot?.nextRunAt ? `Pindai berikutnya ${timeOf(data.autopilot.nextRunAt)}` : `Autopilot ${data.autopilot?.state ?? 'tidak diketahui'}`] } : { lines: unavailable },
    pipeline: data.pipeline ? { lines: [`${data.pipeline.filter(p => p.source === 'freelancer' && ['submitted', 'in_conversation'].includes(p.pipelineStatus)).length} dari Freelancer`, `${data.pipeline.filter(p => p.source === 'projects_co_id' && p.pipelineStatus === 'submitted').length} ditandai oleh Anda`] } : { lines: unavailable },
    tasks: data.pipeline ? { lines: [`${count(['new', 'scored'])} di antrean`, `${count(['draft_ready', 'policy_check'])} draf · ${count(['skipped', 'lost', 'expired', 'reconciliation_required', 'error'])} selesai`] } : { lines: unavailable },
    calendar: data.dashboard?.bidUsage && data.policy ? { lines: [`Bid ${data.dashboard.bidUsage.today}/${data.policy.dailyBidLimit} hari ini`, data.work?.dueSoon ? `${data.work.dueSoon} tenggat klien ≤ 2 hari` : `${data.dashboard.bidUsage.week}/${data.policy.weeklyBidLimit} minggu ini`], alert: Boolean(data.work?.dueSoon) } : { lines: unavailable },
    inbox: data.inbox ? { lines: [`${data.inbox.needsReply.length} menunggu balasan`, `${data.inbox.followUps.length} perlu follow-up`], alert: data.inbox.needsReply.length > 0 } : { lines: unavailable },
    work: data.work ? { lines: [`${data.work.projects.filter((item) => item.status === 'active').length} proyek aktif`, `Diterima ${moneyList(data.work.income.received)}`] } : { lines: unavailable },
    activity: data.activity ? { lines: data.activity[0] ? [activityTitle(data.activity[0].type), timeOf(data.activity[0].createdAt)] : ['Belum ada aktivitas'] } : { lines: unavailable },
    agents: { lines: [`${data.counts.working} bekerja`, `${data.counts.idle} idle · ${data.counts.offline + data.counts.unknown} lainnya`] },
    profile: data.profile ? { lines: [data.profile.primaryField || 'Bidang belum diisi', `${data.profile.specializations.length} spesialisasi`] } : { lines: unavailable },
    policy: data.policy ? { lines: [POLICY_STATE[data.policy.state], `Maks ${data.policy.dailyBidLimit} bid/hari`], alert: data.policy.state === 'paused' } : { lines: unavailable },
    knowledge: data.knowledge ? { lines: [`${data.knowledge.coverage.sources} sumber`, `${data.knowledge.coverage.chunks} potongan terindeks`] } : { lines: unavailable },
    capabilities: data.capabilities ? { lines: [`Freelancer ${data.capabilities.freelancerCredentials.verificationStatus}`, `Hermes ${data.capabilities.hermes.active ? 'aktif' : 'nonaktif'}`] } : { lines: unavailable },
  };
  return BOARDS.map((slot) => ({ id: slot.id, title: slot.label, accent: BOARD_ACCENTS[slot.id], lines: lines[slot.id].lines.filter(Boolean), ...(lines[slot.id].alert ? { alert: true } : {}) }));
}

function OwnerControls({ input, moving }: { input: OwnerInput; moving: boolean }) {
  useEffect(() => () => input.clear(), [input]);
  const button = (direction: OwnerDirection, label: string, key: string) => <button type="button" aria-label={label}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      input.press(`pointer:${event.pointerId}`, direction);
    }}
    onPointerUp={(event) => input.release(`pointer:${event.pointerId}`)} onPointerCancel={(event) => input.release(`pointer:${event.pointerId}`)}
    onLostPointerCapture={(event) => input.release(`pointer:${event.pointerId}`)}
    onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) input.press(`button:${direction}`, direction); } }}
    onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') input.release(`button:${direction}`); }}
    onBlur={() => input.release(`button:${direction}`)}>{key}</button>;
  return <div className="vo3d-owner-controls" aria-label="Kontrol gerak Owner">
    <p className="vo3d-owner-motion" role="status">{moving ? 'Owner sedang berjalan' : 'Owner diam'}</p>
    <p className="vo3d-owner-hint">Tahan WASD, tombol panah, atau tombol di bawah untuk berjalan sesuai arah kamera. Lepaskan untuk berhenti. Esc menghentikan perjalanan.</p>
    <div className="vo3d-owner-dpad">
      <span aria-hidden="true" />{button('up', 'Berjalan ke atas', 'W')}<span aria-hidden="true" />
      {button('left', 'Berjalan ke kiri', 'A')}<button type="button" aria-label="Berhenti berjalan" onClick={() => input.stop()}>■</button>{button('right', 'Berjalan ke kanan', 'D')}
      <span aria-hidden="true" />{button('down', 'Berjalan ke bawah', 'S')}<span aria-hidden="true" />
    </div>
  </div>;
}

export default function OfficeShell() {
  const projectsCoId = useQuery({ queryKey: ['projects-co-id'], queryFn: () => api<ProjectsCoIdStatus | null>('/projects-co-id'), refetchInterval: 3000 });
  const kanban = useQuery(kanbanQuery);
  const operations=useQuery({queryKey:['operations'],queryFn:()=>api<OperationsData>('/operations'),refetchInterval:3000});
  const [floor,setFloor]=useState<1|2>(1);
  const [arrival,setArrival]=useState<{floor:1|2;at:P2}|null>(null);
  const knowledgeSync = useQuery({ queryKey: ['knowledge-sync'], queryFn: () => api<{ job: { state: string; provider: string; current: string | null } | null }>('/knowledge/sync-status'), refetchInterval: 3_000 });
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const stage = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const ownerButton = useRef<HTMLButtonElement>(null);
  const panelBody = useRef<HTMLDivElement>(null);
  const sheetHeading = useRef<HTMLHeadingElement>(null);
  const sheetElement = useRef<HTMLElement>(null);
  const [refreshingSheet, setRefreshingSheet] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'owner' | 'agent' | 'activity' | 'channels' | null>(null);
  const [rosterOpen, setRosterOpen] = useState(wideScreen);
  const [command, setCommand] = useState<CameraCommand>({ kind: 'overview', n: 0 });
  const [followId, setFollowId] = useState<string | null>(null);
  const [ownerInput] = useState(createOwnerInput);
  const [ownerMoving, setOwnerMoving] = useState(false);
  const [ownerVisitVersion, setOwnerVisitVersion] = useState(0);
  const [view, setView] = useState<'3d' | 'top'>('3d');
  const [tour, setTour] = useState(false);
  const [search, setSearch] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [changes, setChanges] = useState<StateChange[]>([]);
  const previous = useRef<Map<string, AgentState> | null>(null);
  const [webgl] = useState(() => {
    try { const canvas = document.createElement('canvas'); return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')); } catch { return false; }
  });
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const now = useClock(30_000);
  const phase = dayPhase(now.getHours());

  const autopilot = useQuery({ queryKey: ['autopilot', 'office'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 1000 }); // cycles last ~4s; slower polling misses them
  const sync = useQuery({ queryKey: ['business-sync', 'office'], queryFn: () => api<BusinessSyncStatus | null>('/business-sync'), refetchInterval: 1000 });
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => api<Inbox>('/inbox'), refetchInterval: 60_000 });
  const work = useQuery({ queryKey: ['work'], queryFn: () => api<Work>('/work'), refetchInterval: 60_000 });
  const activity = useQuery({ queryKey: ['activity', 'office'], queryFn: () => api<AuditEvent[]>('/activity?limit=50'), refetchInterval: 10000 });
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ ok: boolean; mode: string; liveWrites: boolean }>('/health'), refetchInterval: 30_000 });
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<NonNullable<ShellData['dashboard']>>('/dashboard'), refetchInterval: 30_000 });
  const pipeline = useQuery({ queryKey: ['pipeline'], queryFn: () => api<Array<Opportunity & { latestDraft: BidDraft | null }>>('/pipeline'), refetchInterval: 60_000 });
  const policy = useQuery({ queryKey: ['policy'], queryFn: () => api<Policy>('/policy'), refetchInterval: 30_000 });
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/profile'), refetchInterval: 30_000 });
  const knowledge = useQuery({ queryKey: ['knowledge'], queryFn: () => api<{ coverage: { sources: number; chunks: number } }>('/knowledge'), refetchInterval: 30_000 });
  const browserBidding = useQuery({queryKey:['browser-bidding'],queryFn:()=>api<BrowserBiddingStatus|null>('/browser-bidding'),refetchInterval:3000});
  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: () => api<Capabilities>('/capabilities'), refetchInterval: 3000 });
  const pause = useMutation({
    mutationFn: (action: 'pause' | 'resume') => api<Policy>(`/policy/${action}`, jsonRequest('POST')),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['dashboard'] }); void queryClient.invalidateQueries({ queryKey: ['policy'] }); },
  });

  // react-query keeps the last good data on error; stale state must not look live.
  const fresh = <T,>(query: { isError: boolean; data: T | undefined }) => (query.isError ? undefined : query.data);
  const autopilotData = fresh(autopilot);
  const activityData = fresh(activity);
  const syncData = fresh(sync);
  const inboxWaiting = fresh(inbox)?.needsReply.length;
  const dueSoon = fresh(work)?.dueSoon;
  const hermes = fresh(capabilities)?.hermes;
  const knowledgeJob = fresh(knowledgeSync)?.job;
  const operationsData=fresh(operations);
  const allAgents = useMemo(() => deriveOfficeAgents(autopilotData, activityData, { projectsCoId: projectsCoId.isError ? undefined : projectsCoId.data, kanban: fresh(kanban), sync: syncData, inboxWaiting, dueSoon, hermes, knowledge: knowledgeJob,operations:operationsData,browserBidding:browserBidding.isError?undefined:browserBidding.data }), [projectsCoId.isError, projectsCoId.data, kanban.isError, kanban.data, browserBidding.isError,browserBidding.data,autopilotData, activityData, syncData, inboxWaiting, dueSoon, hermes, knowledgeJob,operationsData]);
  const agents=useMemo(()=>allAgents.filter(a=>(a.floor ?? 1)===floor),[allAgents,floor]);
  const spots = useMemo(() => spotsFor(agents), [agents]);
  const ownerTarget = selectedId ? spots.get(selectedId) ?? null : null;
  const counts = summarize(agents);
  const boards = buildBoards({
    projectsCoId: fresh(projectsCoId),
    operations:operationsData,
    dashboard: fresh(dashboard), autopilot: autopilotData, pipeline: fresh(pipeline), policy: fresh(policy), profile: fresh(profile),
    knowledge: fresh(knowledge), capabilities: fresh(capabilities), inbox: fresh(inbox), work: fresh(work), activity: activityData, counts,
  });
  const selected = agents.find((agent) => agent.id === selectedId);
  const workData = fresh(work);
  const profileData = fresh(profile);
  const knowledgeData = fresh(knowledge);
  const query = search.trim().toLocaleLowerCase();
  const visibleAgents = query ? agents.filter((agent) => `${agent.name} ${agent.role}`.toLocaleLowerCase().includes(query)) : agents;
  const matchingBoards = query ? BOARDS.filter(board => board.label.toLocaleLowerCase().includes(query)) : [];
  const stateKey = agents.map((agent) => agent.state).join();
  const sheetOpen = location.pathname !== '/';
  const dashboardData = fresh(dashboard);

  useEffect(() => {
    if (!sheetOpen) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = [...(sheetElement.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? [])].filter((item) => item.getClientRects().length > 0);
      const first = items[0]; const last = items.at(-1);
      if (!first || !last) { event.preventDefault(); sheetHeading.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onTab);
    return () => { document.removeEventListener('keydown', onTab); if (returnFocus?.isConnected) returnFocus.focus(); };
  }, [sheetOpen]);
  useEffect(() => { sheetElement.current?.querySelector('.vo3d-sheet-body')?.scrollTo({ top: 0 }); }, [location.pathname]);

  useEffect(() => { panelBody.current?.scrollTo({ top: 0 }); }, [panel, selectedId]);

  useEffect(() => {
    ownerInput.setActive(document.visibilityState !== 'hidden');
    return bindOwnerKeyboard(ownerInput, window, document);
  }, [ownerInput]);
  useEffect(() => { ownerInput.setEnabled(!sheetOpen && webgl); }, [ownerInput, sheetOpen, webgl]);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => { if (followId && followId !== 'owner' && !spots.has(followId)) setFollowId(null); }, [spots, followId]);

  // Session log of state transitions observed by this page (real polling results, not simulated).
  useEffect(() => {
    if (autopilot.isPending) return;
    const prior = previous.current;
    if (prior) {
      const at = new Date().toISOString();
      const diff = agents.filter((agent) => prior.get(agent.id) !== undefined && prior.get(agent.id) !== agent.state)
        .map((agent) => ({ key: `${agent.id}-${at}`, at, name: agent.name, from: prior.get(agent.id)!, to: agent.state }));
      if (diff.length) setChanges((list) => [...diff, ...list].slice(0, 20));
    }
    previous.current = new Map(agents.map((agent) => [agent.id, agent.state]));
  }, [stateKey, autopilot.isPending]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (window.location.pathname !== '/') sheetElement.current?.querySelector<HTMLElement>('input[type="search"], .sheet-tools select')?.focus();
        else searchInput.current?.focus();
      }
      if (event.key === 'Escape') {
        ownerInput.stop();
        if (window.location.pathname !== '/') navigate('/');
        else { setPanel(null); ownerButton.current?.focus(); }
      }
    };
    const onFullscreen = () => setFullscreen(document.fullscreenElement === stage.current);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFullscreen); };
  }, [navigate, ownerInput]);

  const fly = (next: Omit<CameraCommand, 'n'>) => {
    setFollowId(null); setTour(false);
    setCommand((current) => ({ ...next, n: current.n + 1 }));
  };
  const goToFloor = (n: 1 | 2, byLift = false) => {
    ownerInput.stop(); setSelectedId(null); setPanel(null);
    setArrival(byLift ? { floor: n, at: [LIFT.exit.x, LIFT.exit.z] } : null);
    setFloor(n); fly({ kind: 'overview' });
  };
  useEffect(() => {
    const board = BOARDS.find((slot) => slot.route === location.pathname);
    if(board) setFloor(board.floor ?? 1);
    if (board) fly({ kind: 'board', id: board.id });
    if (location.pathname !== '/') sheetHeading.current?.focus();
  }, [location.pathname]);

  const selectAgent = (id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    setOwnerVisitVersion((version) => version + 1);
    setPanel('agent');
    setFollowId(null);
    if (spots.has(id)) fly({ kind: 'agent', id });
  };
  const openOwner = () => {
    panelBody.current?.scrollTo({ top: 0 });
    setSelectedId(null);
    setPanel('owner');
    setFollowId(null);
    fly({ kind: 'owner' });
  };
  const toggleFollow = (id: string) => {
    const next = followId === id ? null : id;
    if (next === 'owner') fly({ kind: 'owner' });
    else if (next && spots.has(next)) fly({ kind: 'agent', id: next });
    setFollowId(next);
    setTour(false);
  };
  const openBoard = (id: BoardId) => navigate(BOARDS.find((slot) => slot.id === id)!.route);
  const summary = autopilot.isPending ? 'Memuat status kru...'
    : [`${counts.working} bekerja`, `${counts.idle} idle`, `${counts.offline} offline`, ...(counts.unknown ? [`${counts.unknown} tidak diketahui`] : [])].join(' · ');
  const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(now);
  const width = FLOOR.maxX - FLOOR.minX;
  const depth = FLOOR.maxZ - FLOOR.minZ;
  const externalLabel = !dashboardData ? 'Status aksi eksternal tidak diketahui' : autopilotData?.marketplaceNotice?.quotaExhausted ? 'Bid terakhir ditolak: kuota akun Freelancer habis' : dashboardData.externalWrites ? 'Bid live ke Freelancer aktif' : 'Aksi eksternal nonaktif';
  const lastCycle = !autopilotData ? 'Tidak tersedia' : autopilotData.lastRunAt ? formatDate(autopilotData.lastRunAt) : 'Belum tercatat';
  const employeeMetrics = (id: string) => {
    if (id === 'projects-co-id-scout') {
      const worker = fresh(projectsCoId);
      return [
        { label: 'Mode worker', value: worker ? ({ off: 'Nonaktif', 'scan-only': 'Pindai saja', drafts: 'Pindai & buat draf' })[worker.mode] : 'Tidak tersedia' },
        { label: 'Draf siap ditinjau', value: worker ? String(worker.readyDrafts) : 'Tidak tersedia' },
        { label: 'Scan terakhir', value: worker ? worker.lastScanAt ? formatDate(worker.lastScanAt) : 'Belum pernah' : 'Tidak tersedia' },
      ];
    }
    if(OPERATIONS_ROSTER.some(a=>a.id===id)) {
      const signal=operationsData?.runtime.jobs[id];
      return [{label:'Pekerjaan terakhir',value:!operationsData?'Tidak tersedia':signal?.lastRunAt?formatDate(signal.lastRunAt):'Belum tercatat'},{label:'Tugas runtime',value:signal?.reason ?? 'Menunggu tugas sesuai peran'}];
    }
    if (id === 'market-scout') return [
      { label: 'Proyek tersinkron pada siklus terakhir', value: !autopilotData ? 'Tidak tersedia' : autopilotData.lastRunAt ? String(autopilotData.lastImported) : autopilotData.cycleInProgress ? 'Siklus berjalan' : 'Belum tercatat' },
      { label: 'Siklus terakhir', value: lastCycle },
    ];
    if (id === 'bid-strategist') return [
      { label: 'Bid berhasil pada siklus terakhir', value: !autopilotData ? 'Tidak tersedia' : autopilotData.lastRunAt ? String(autopilotData.lastSubmitted) : autopilotData.cycleInProgress ? 'Siklus berjalan' : 'Belum tercatat' },
      { label: 'Draf proposal tersimpan', value: dashboardData ? String(dashboardData.counts.drafts) : 'Tidak tersedia' },
    ];
    if (id === 'compliance-auditor') return [
      { label: 'Skip pada 50 audit terbaru', value: activityData ? String(activityData.filter((event) => event.type === 'autopilot.bid_skipped').length) : 'Tidak tersedia' },
      { label: 'Siklus terakhir', value: lastCycle },
    ];
    if (id === 'lead-agent') return [
      { label: 'Status Hermes', value: hermes ? hermes.active ? 'Aktif' : 'Nonaktif' : 'Tidak tersedia' },
      { label: 'Draf yang sedang disusun', value: hermes?.draftsInProgress === undefined ? 'Tidak tersedia' : String(hermes.draftsInProgress) },
    ];
    if (id === 'client-relations') return [
      { label: 'Thread pada sinkronisasi terakhir', value: syncData?.messages.threads === undefined ? 'Tidak tersedia' : String(syncData.messages.threads) },
      { label: 'Pesan menunggu balasan', value: inboxWaiting === undefined ? 'Tidak tersedia' : String(inboxWaiting) },
    ];
    if (id === 'operations-analyst') return [
      { label: 'Tenggat dalam 48 jam', value: workData ? String(workData.dueSoon) : 'Tidak tersedia' },
      { label: 'Proyek aktif tercatat', value: workData ? String(workData.projects.filter((item) => item.status === 'active').length) : 'Tidak tersedia' },
    ];
    if (id === 'profile-editor') return [
      { label: 'Fakta profil tersimpan', value: profileData ? String(profileData.facts.length) : 'Tidak tersedia' },
      { label: 'Pembaruan profil pada 50 audit terbaru', value: activityData ? String(activityData.filter((event) => event.type === 'profile.updated' || event.type === 'marketplace.production.edit_profile').length) : 'Tidak tersedia' },
    ];
    if (id === 'knowledge-curator') return [
      { label: 'Sumber Knowledge Hub', value: knowledgeData ? String(knowledgeData.coverage.sources) : 'Tidak tersedia' },
      { label: 'Potongan terindeks', value: knowledgeData ? String(knowledgeData.coverage.chunks) : 'Tidak tersedia' },
    ];
    if (id === 'chief-of-staff') return [{ label: 'Mode peran', value: 'On-demand; belum ada loop runtime khusus' }];
    return [{ label: 'Status runtime', value: 'Tidak tersedia; tidak ada komponen runtime' }];
  };

  return <div className="vo3d vo3d-app" ref={stage} style={{ background: phase.sky }}>
    <div className="vo3d-canvas" role="img" aria-label={`Kantor 3D Mission Control. ${summary}. Gunakan menu Papan dan daftar agen untuk navigasi dengan keyboard.`}>
      {webgl ? <Suspense fallback={<div className="vo3d-fallback">Memuat kantor visual...</div>}>
        <VisualOffice key={floor} floor={floor} ownerStart={arrival?.floor===floor?arrival.at:[OWNER_SPOT.x,OWNER_SPOT.z]} onLift={()=>goToFloor(floor===1?2:1,true)} agents={agents} ready={!autopilot.isPending} selectedId={selectedId} ownerSelected={panel === 'owner'} ownerInput={ownerInput} ownerTarget={ownerTarget} ownerVisitVersion={ownerVisitVersion} onOwnerMoving={setOwnerMoving} followId={followId} onSelect={selectAgent} onOwnerSelect={openOwner} onCameraInteract={() => { setFollowId(null); setTour(false); }} command={command} view={view} tour={tour} phase={phase} reducedMotion={reducedMotion} boards={boards} onOpenBoard={openBoard} />
      </Suspense> : <div className="vo3d-fallback">WebGL tidak tersedia di browser ini. Gunakan menu Papan untuk membuka setiap kartu.</div>}
    </div>

    <section className="vo3d-float vo3d-card" aria-live="polite">
      <h1><span className={`vo3d-live${autopilotData ? '' : ' is-off'}`} aria-hidden="true" />Mission Control</h1>
      <p><OfficeIcon name="sun" />{phase.label} · {time}</p>
      <p>{summary}</p>
      <div className="vo3d-floor-picker" role="group" aria-label="Pilih lantai">{([1,2] as const).map(n=><button type="button" key={n} aria-pressed={floor===n} onClick={()=>goToFloor(n)}>Lantai {n}</button>)}</div>
      <p className={dashboardData?.externalWrites ? 'vo3d-warn' : ''}>{externalLabel}</p>
      {health.isError && <p className="vo3d-warn">API lokal tidak terhubung.</p>}
      <Link to="/overview" className="vo3d-cta">Buka ringkasan</Link>
    </section>

    <button type="button" className="vo3d-float vo3d-roster-toggle" aria-expanded={rosterOpen} onClick={() => setRosterOpen((open) => !open)}><OfficeIcon name="users" />Tim ({agents.length})</button>
    <nav className={`vo3d-float vo3d-roster${rosterOpen && !sheetOpen ? '' : ' is-collapsed'}`} aria-label="Daftar agen">
      {visibleAgents.map((agent) => <button key={agent.id} type="button" className={`vo3d-agent${agent.state === 'offline' ? ' is-offline' : ''}`} aria-pressed={selectedId === agent.id} onClick={() => selectAgent(agent.id)}>
        <span className="vo3d-avatar" style={{ background: agent.color }}>{initials(agent.name)}</span>
        <span><strong>{agent.name}</strong><small><span className="vo3d-state-dot" style={{ background: STATE_COLORS[agent.state] }} />{STATE_LABELS[agent.state]} · {agent.room ? ROOM_LABELS[agent.room] : 'Tidak di lantai'}</small></span>
      </button>)}
      {!visibleAgents.length && <p className="vo3d-agent">Tidak ada agen yang cocok.</p>}
    </nav>

    <div className="vo3d-float vo3d-tools">
      <button ref={ownerButton} type="button" className="vo3d-owner-action" aria-pressed={panel === 'owner'} onClick={openOwner}><OfficeIcon name="target" />Pemilik</button>
      <details className="vo3d-menu">
        <summary className="vo3d-icon" aria-label="Menu papan"><OfficeIcon name="grid" /></summary>
        <nav aria-label="Papan Mission Control">
          <Link to="/overview">Ringkasan</Link>
          {BOARDS.map((board) => <Link key={board.id} to={board.route}>{board.label}</Link>)}
        </nav>
      </details>
      <div className="vo3d-search-wrap"><label className="vo3d-search"><OfficeIcon name="search" /><span className="sr-only">Cari agen atau papan</span>
        <input ref={searchInput} type="search" placeholder="Cari agen atau papan" value={search} onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { if (matchingBoards[0]) { navigate(matchingBoards[0].route); setSearch(''); } else if (visibleAgents[0]) selectAgent(visibleAgents[0].id); } if (event.key === 'Escape') setSearch(''); }} />
        <kbd>Ctrl K</kbd>
      </label>{matchingBoards.length > 0 && <nav className="vo3d-search-results" aria-label="Hasil pencarian papan">{matchingBoards.map(board => <Link key={board.id} to={board.route} onClick={() => setSearch('')}>{board.label}</Link>)}</nav>}</div>
      {dashboardData && dashboardData.policy.state !== 'draft' && <button type="button" className={`vo3d-kill${dashboardData.policy.state === 'active' ? ' is-danger' : ''}`} disabled={pause.isPending}
        onClick={() => pause.mutate(dashboardData.policy.state === 'active' ? 'pause' : 'resume')}>{dashboardData.policy.state === 'active' ? 'Jeda automasi' : 'Lanjutkan kebijakan'}</button>}
      <button type="button" className="vo3d-icon" aria-pressed={fullscreen} aria-label={fullscreen ? 'Keluar dari layar penuh' : 'Layar penuh'} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void stage.current?.requestFullscreen?.(); }}><OfficeIcon name="expand" /></button>
    </div>
    {pause.isError && <div className="vo3d-float vo3d-toast" role="alert">{pause.error.message}</div>}

    {panel && !sheetOpen && <aside className="vo3d-float vo3d-panel" aria-label="Panel detail">
      <div className="vo3d-tabs" role="tablist" aria-label="Rincian kantor">
        {([['owner', 'Pemilik'], ['agent', 'Agen'], ['activity', 'Aktivitas'], ['channels', 'Kanal']] as const).map(([id, label], index, tabs) => <button key={id} id={`office-tab-${id}`} type="button" role="tab" aria-controls="office-detail-panel" tabIndex={panel === id ? 0 : -1} aria-selected={panel === id}
          onClick={() => id === 'owner' ? openOwner() : setPanel(id)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            const tab = tabs[next]!;
            if (tab[0] === 'owner') openOwner(); else setPanel(tab[0]);
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
          }}>{label}</button>)}
        <button type="button" className="vo3d-close" aria-label="Tutup panel" onClick={() => { ownerInput.stop(); setPanel(null); ownerButton.current?.focus(); }}><OfficeIcon name="close" /></button>
      </div>
      <div ref={panelBody} className="vo3d-panel-body" id="office-detail-panel" role="tabpanel" aria-labelledby={`office-tab-${panel}`}>
        {panel === 'owner' && <>
          <div className="vo3d-profile"><span className="vo3d-avatar vo3d-owner-avatar">P</span>
            <div><h3>Pemilik</h3><p>Kendali dan pemantauan tim</p><span className="vo3d-badge">Data kantor lokal</span></div></div>
          {webgl ? <OwnerControls input={ownerInput} moving={ownerMoving} /> : <p className="vo3d-owner-hint">Kontrol gerak tidak tersedia karena WebGL tidak aktif.</p>}
          <div className="vo3d-owner-actions">
            <button type="button" disabled={!webgl} aria-pressed={followId === 'owner'} onClick={() => toggleFollow('owner')}>{followId === 'owner' ? 'Hentikan ikuti kamera' : 'Ikuti Owner'}</button>
            <button type="button" onClick={() => fly({ kind: 'overview' })}>Kamera overview</button>
          </div>
          <h2>Ringkasan tim</h2>
          <div className="vo3d-owner-summary">
            <div><span>Aktif</span><strong>{counts.working}</strong></div>
            <div><span>Idle</span><strong>{counts.idle}</strong></div>
            <div><span>Offline</span><strong>{counts.offline}</strong></div>
            <div><span>Tidak diketahui</span><strong>{counts.unknown}</strong></div>
          </div>
          <h2>Kinerja operasi</h2>
          <p className="vo3d-owner-hint">Ringkasan berasal dari status server dan audit tersimpan.</p>
          <dl>
            <dt>Autopilot</dt><dd>{autopilotData ? <StateLabel state={autopilotData.state} /> : 'Tidak tersedia'}</dd>
            <dt>Siklus terakhir</dt><dd>{lastCycle}</dd>
            <dt>Siklus berikutnya</dt><dd>{autopilotData?.nextRunAt ? formatDate(autopilotData.nextRunAt) : 'Tidak tersedia'}</dd>
            <dt>Proyek tersinkron pada siklus terakhir</dt><dd>{!autopilotData ? 'Tidak tersedia' : autopilotData.lastRunAt ? autopilotData.lastImported : autopilotData.cycleInProgress ? 'Siklus berjalan' : 'Belum tercatat'}</dd>
            <dt>Bid berhasil pada siklus terakhir</dt><dd>{!autopilotData ? 'Tidak tersedia' : autopilotData.lastRunAt ? autopilotData.lastSubmitted : autopilotData.cycleInProgress ? 'Siklus berjalan' : 'Belum tercatat'}</dd>
            <dt>Sinkronisasi pesan terakhir</dt><dd>{syncData?.messages.lastRunAt ? formatDate(syncData.messages.lastRunAt) : 'Tidak tersedia'}</dd>
            <dt>Kebijakan</dt><dd>{dashboardData ? <StateLabel state={dashboardData.policy.state} /> : 'Tidak tersedia'}</dd>
          </dl>
          <h2 className="vo3d-owner-list-title">Temui karyawan</h2>
          <p className="vo3d-owner-hint">Pilih nama untuk melihat rincian dan menghampiri agen yang ada di lantai. Agen offline hanya membuka rincian.</p>
          <ul className="vo3d-owner-agent-list">
            {agents.map((agent) => <li key={agent.id}><button type="button" onClick={() => selectAgent(agent.id)}>
              <span className="vo3d-avatar" style={{ background: agent.color }}>{initials(agent.name)}</span>
              <span><strong>{agent.name}</strong><small><span className="vo3d-state-dot" style={{ background: STATE_COLORS[agent.state] }} />{STATE_LABELS[agent.state]} · {agent.room ? ROOM_LABELS[agent.room] : 'Tidak di lantai'}</small></span>
            </button></li>)}
          </ul>
        </>}
        {panel === 'agent' && (selected ? <>
          <div className="vo3d-profile"><span className="vo3d-avatar" style={{ background: selected.color }}>{initials(selected.name)}</span>
            <div><h3>{selected.name}</h3><p>{selected.role}</p><span className="vo3d-badge"><span className="vo3d-state-dot" style={{ background: STATE_COLORS[selected.state] }} />{STATE_LABELS[selected.state]}</span></div></div>
          <div className="vo3d-owner-actions">
            <button type="button" disabled={!spots.has(selected.id)} aria-pressed={followId === selected.id} onClick={() => toggleFollow(selected.id)}>{followId === selected.id ? 'Hentikan ikuti kamera' : 'Ikuti kamera agen'}</button>
            <button type="button" onClick={openOwner}>Kembali ke Owner</button>
            <button type="button" onClick={() => ownerInput.stop()}>Hentikan perjalanan Owner</button>
          </div>
          <h2>Sinyal kinerja yang tersedia</h2>
          <p className="vo3d-owner-hint">Angka mengikuti data tersimpan; beberapa peran memakai loop bersama atau belum memiliki runtime.</p>
          <dl className="vo3d-performance-list">
            {employeeMetrics(selected.id).map((metric) => <Fragment key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></Fragment>)}
          </dl>
          <dl>
            <dt>Ruangan</dt><dd>{selected.room ? ROOM_LABELS[selected.room] : 'Tidak di lantai kantor'}</dd>
            <dt>Alasan status</dt><dd>{selected.reason}</dd>
            <dt>Tugas saat ini</dt><dd>{selected.task ?? (selected.state === 'unknown' ? 'Tidak tersedia' : 'Tidak ada tugas berjalan')}</dd>
            <dt>Aktivitas terbaru</dt>
            <dd>{selected.recentActivity.length ? selected.recentActivity.map((event) => <div key={event.id}>{activityTitle(event.type)} · {formatDate(event.createdAt)}</div>) : 'Belum ada aktivitas tercatat'}</dd>
          </dl>
        </> : <p className="vo3d-hint">Pilih agen di lantai kantor atau di daftar untuk melihat detail.</p>)}
        {panel === 'activity' && <>
          <h2>Perubahan status</h2>
          {changes.length ? <ol className="vo3d-feed">{changes.map((change) => <li key={change.key}><strong>{change.name}: {STATE_LABELS[change.from]} → {STATE_LABELS[change.to]}</strong><small>{formatDate(change.at)}</small></li>)}</ol>
            : <p>Belum ada perubahan sejak halaman dibuka.</p>}
          <h2>Log audit</h2>
          {activity.isError ? <p>Log aktivitas tidak dapat dimuat.</p> : !activity.data?.length ? <p>Belum ada aktivitas tercatat.</p>
            : <ol className="vo3d-feed">{activity.data.slice(0, 8).map((event) => <li key={event.id}><strong>{activityTitle(event.type)}</strong><StateLabel state={event.status} /><small>{formatDate(event.createdAt)}</small></li>)}</ol>}
        </>}
        {panel === 'channels' && <>
          <h2>Kanal terhubung</h2>
          <p>Tidak tersedia. Hermes belum melaporkan kanal atau sesi ke Mission Control.</p>
          <h2>Sumber status</h2>
          <p>{autopilotData ? <>Autopilot <StateLabel state={autopilotData.state} /> · siklus berikutnya {autopilotData.nextRunAt ? formatDate(autopilotData.nextRunAt) : 'belum tersedia'}</> : 'Status autopilot tidak dapat dimuat.'}</p>
        </>}
      </div>
    </aside>}

    {!panel && !sheetOpen && <figure className="vo3d-float vo3d-map" aria-hidden="true">
      <svg viewBox={`${FLOOR.minX} ${FLOOR.minZ} ${width} ${depth}`}>
        <rect x={FLOOR.minX} y={FLOOR.minZ} width={width} height={depth} rx="1" fill="#f3efe6" />
        {ZONES.map((zone) => <g key={zone.id} onClick={() => fly({ kind: 'zone', id: zone.id })}>
          <rect x={zone.x - zone.w / 2} y={zone.z - zone.d / 2} width={zone.w} height={zone.d} rx="0.6" fill={zone.id === 'workspace' ? 'none' : '#e3ece0'} stroke="#c8cfc4" strokeWidth="0.15" strokeDasharray={zone.id === 'workspace' ? '0.6 0.4' : undefined} />
          {zone.id !== 'workspace' && <text x={zone.x} y={zone.z + 0.6} textAnchor="middle" fontSize="1.6" fill="#3b4650">{zone.label}</text>}
        </g>)}
        {(floor===1?PODS:FLOOR_TWO_PODS).map((pod) => <rect key={pod.id} x={pod.x - 2.3} y={pod.z - 2.3} width="4.6" height="4.6" rx="0.5" fill={pod.color} opacity="0.3" onClick={() => selectAgent(pod.id)} />)}
        {agents.map((agent) => { const spot = spots.get(agent.id); return spot ? <circle key={agent.id} cx={spot.x} cy={spot.z} r="0.75" fill={STATE_COLORS[agent.state]} stroke="#fff" strokeWidth="0.3" /> : null; })}
      </svg>
      <p>Lt {floor} · titik = posisi tujuan tiap agen</p>
    </figure>}

    <nav className="vo3d-float vo3d-dock" aria-label="Navigasi ruangan">
      {ZONES.map((zone) => <button key={zone.id} type="button" onClick={() => fly({ kind: 'zone', id: zone.id })}>
        <OfficeIcon name="pin" />{zone.label}<em>{[...spots.values()].filter((spot) => zoneOf(spot) === zone.id).length}</em>
      </button>)}
      <span className="vo3d-dock-sep" aria-hidden="true" />
      <button type="button" aria-pressed={panel === 'activity'} onClick={() => setPanel(panel === 'activity' ? null : 'activity')}><OfficeIcon name="activity" />Aktivitas</button>
      <button type="button" aria-pressed={panel === 'channels'} onClick={() => setPanel(panel === 'channels' ? null : 'channels')}><OfficeIcon name="signal" />Kanal</button>
    </nav>

    <div className="vo3d-float vo3d-seg" role="toolbar" aria-label="Kontrol tampilan">
      <button type="button" aria-pressed={view === '3d'} aria-label="Tampilan 3D" title="Tampilan 3D" onClick={() => { setView('3d'); fly({ kind: 'overview' }); }}><OfficeIcon name="cube" /></button>
      <button type="button" aria-pressed={view === 'top'} aria-label="Tampilan denah atas" title="Denah atas" onClick={() => { setView('top'); setTour(false); fly({ kind: 'overview' }); }}><OfficeIcon name="top" /></button>
      <button type="button" aria-pressed={tour} disabled={reducedMotion} title={reducedMotion ? 'Dinonaktifkan karena preferensi kurangi gerakan' : 'Putar kamera otomatis'} onClick={() => { setFollowId(null); setView('3d'); setTour((on) => !on); }}><OfficeIcon name="play" />Tur</button>
      <button type="button" aria-label="Pusatkan kamera" title="Pusatkan" onClick={() => fly({ kind: 'overview' })}><OfficeIcon name="target" /></button>
    </div>

    {sheetOpen && <div className="vo3d-sheet-backdrop" onClick={() => navigate('/')}>
      <section ref={sheetElement} className="vo3d-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(event) => event.stopPropagation()}>
        <header className="vo3d-sheet-head">
          <h2 id="sheet-title" ref={sheetHeading} tabIndex={-1}>{SHEET_TITLES[location.pathname] ?? 'Halaman'}</h2>
          <button type="button" className="vo3d-icon" aria-label="Tutup kartu dan kembali ke kantor" onClick={() => navigate('/')}><OfficeIcon name="close" /></button>
        </header>
        <nav className="sheet-tools" aria-label="Navigasi dan pembaruan kartu"><label><span>Buka kartu</span><select value={location.pathname} onChange={(event) => navigate(event.target.value)}>{Object.entries(SHEET_TITLES).map(([route, title]) => <option value={route} key={route}>{title}</option>)}</select></label><button type="button" className="button button-secondary" disabled={refreshingSheet} onClick={async () => { setRefreshingSheet(true); try { await queryClient.invalidateQueries({ type: 'active' }); } finally { setRefreshingSheet(false); } }}>{refreshingSheet ? 'Memperbarui…' : 'Perbarui data'}</button></nav>
        <div className="vo3d-sheet-body page-content"><Outlet /></div>
      </section>
    </div>}
  </div>;
}
