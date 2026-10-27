import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type AuditEvent, type Autopilot, type BusinessSyncStatus, type Capabilities, type Inbox, type Policy, type Profile, type Work } from '../api/api.js';
import { deriveOfficeAgents, summarize, STATE_COLORS, STATE_LABELS } from '../state/office-state.js';
import type { ProjectsCoIdStatus } from '../api/projects-co-id-api.js';
import type { OperationsData } from '../api/operations-api.js';
import { OPERATIONS_ROSTER } from '@fvh/domain';
import { kanbanQuery, officeLearningQuery } from '../api/queries.js';
import { OfficeLearningCard } from '../components/OfficeLearningCard.js';
import { ErrorNotice, LoadingPanel, PageIntro, Metric } from '../components/ui.js';
import { formatDate } from '../components/format.js';

type AgentCopy = { id: string; name: string; dept: string; role: string; task: string; boundary: string; metric?: string; to: string };

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const projectsCoId = useQuery({ queryKey: ['projects-co-id'], queryFn: () => api<ProjectsCoIdStatus | null>('/projects-co-id'), refetchInterval: 3000 });
  const kanban = useQuery(kanbanQuery);
  const learning = useQuery(officeLearningQuery);
  const operations = useQuery({ queryKey: ['operations'], queryFn: () => api<OperationsData>('/operations'), refetchInterval: 5000 });
  const knowledgeSync = useQuery({ queryKey: ['knowledge-sync'], queryFn: () => api<{ job: { state: string; provider: string; current: string | null } | null }>('/knowledge/sync-status'), refetchInterval: 3_000 });
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<{
    policy: { state: Policy['state']; version: number };
    counts: { openProjects: number; drafts: number; policySkips: number; knowledgeSources: number };
    activity: AuditEvent[];
  }>('/dashboard'), refetchInterval: 10_000 });
  const autopilot = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 10_000 });
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/profile'), refetchInterval: 30_000 });
  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: () => api<Capabilities>('/capabilities'), refetchInterval: 10_000 });
  const sync = useQuery({ queryKey: ['business-sync'], queryFn: () => api<BusinessSyncStatus | null>('/business-sync'), refetchInterval: 10_000 });
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => api<Inbox>('/inbox'), refetchInterval: 10_000 });
  const work = useQuery({ queryKey: ['work'], queryFn: () => api<Work>('/work'), refetchInterval: 10_000 });

  const counts = dashboard.isError ? undefined : dashboard.data?.counts;  const policy = dashboard.isError ? undefined : dashboard.data?.policy;
  const activity = dashboard.isError ? undefined : dashboard.data?.activity;
  const inboxWaiting = inbox.isError ? undefined : inbox.data?.needsReply.length;

  const derived = deriveOfficeAgents(autopilot.isError ? undefined : autopilot.data, activity, {
    learning: learning.isError ? undefined : learning.data,
    projectsCoId: projectsCoId.isError ? undefined : projectsCoId.data, kanban: kanban.isError ? undefined : kanban.data,
    sync: sync.isError ? undefined : sync.data, inboxWaiting, dueSoon: work.isError ? undefined : work.data?.dueSoon,
    hermes: capabilities.isError ? undefined : capabilities.data?.hermes, knowledge: knowledgeSync.isError ? undefined : knowledgeSync.data?.job,
  });

  const agents: AgentCopy[] = [
    {
      id: 'lead-agent', name: 'Lead Agent', dept: 'Kepemimpinan', role: 'Koordinator Tim AI (Hermes)',
      task: 'Menyusun draf proposal dengan Hermes dari fakta profil dan bukti Knowledge Hub ketika draf diminta.',
      boundary: 'Hanya membuat draf; pengiriman bid tetap melewati policy engine. Kredensial marketplace tidak dikirim ke Hermes.',
      metric: capabilities.isError ? 'Status Hermes tidak tersedia' : !capabilities.data ? 'Memuat status Hermes' : !capabilities.data.hermes.active ? 'Hermes nonaktif' : counts ? `Hermes aktif, ${counts.drafts} draf tersimpan` : 'Hermes aktif, jumlah draf tidak tersedia',
      to: '/tasks',
    },
    {
      id: 'chief-of-staff', name: 'Chief of Staff', dept: 'Executive / Operasi', role: 'Orchestrator Ruang Kerja',
      task: 'Merangkum status antrean peluang, memonitor kepatuhan ritme automasi, dan mengarahkan fokus peran virtual.',
      boundary: 'Akses baca data lokal workspace; hanya membuat usulan tugas internal tanpa aksi eksternal.',
      metric: counts ? `${counts.openProjects} peluang aktif dalam pantauan` : 'Jumlah peluang tidak tersedia',
      to: '/tasks',
    },
    {
      id: 'market-scout', name: 'Market Scout', dept: 'Sales & Bids', role: 'Pencari & Penilai Pasar',
      task: 'Menyaring peluang proyek dari provider Freelancer resmi dan menghitung skor kecocokan berdasarkan profil keahlian.',
      boundary: 'Hanya membaca proyek tersinkron resmi; tidak melakukan scraping mandiri atau bypass rate limit.',
      metric: counts ? `${counts.openProjects} peluang terbuka tersimpan (semua sumber)` : 'Jumlah peluang tidak tersedia',
      to: '/opportunities',
    },
    {
      id: 'bid-strategist', name: 'Bid Strategist', dept: 'Sales & Bids', role: 'Perumus Proposal & Harga',
      task: 'Meninjau hasil bid dan mendampingi siklus proposal. Harga serta durasi bid otomatis ditetapkan secara deterministik oleh kebijakan.',
      boundary: 'Menghasilkan draf terstruktur; setiap eksekusi wajib lolos persetujuan deterministik policy engine.',
      metric: counts ? `${counts.drafts} draf proposal lokal disiapkan` : 'Jumlah draf tidak tersedia',
      to: '/pipeline',
    },
    {
      id: 'profile-editor', name: 'Profile Editor', dept: 'Profile Studio', role: 'Kurator Profil & Bukti',
      task: 'Memelihara fakta profil, ringkasan spesialisasi, dan mengusulkan pembaruan berbasis bukti nyata repositori/portofolio.',
      boundary: 'Fakta diperbarui saat Anda membuka dan menyimpan kartu Profil. Tidak ada proses penyuntingan profil otomatis.',
      metric: profile.isError ? 'Jumlah fakta tidak tersedia' : profile.data ? `${profile.data.facts.length} fakta profil tersimpan` : 'Memuat fakta profil',
      to: '/profile',
    },
    {
      id: 'client-relations', name: 'Client Relations', dept: 'Client Relations', role: 'Manajer Komunikasi Klien',
      task: 'Membaca pesan Freelancer, menandai pesan yang menunggu balasan, dan bid yang perlu ditindaklanjuti.',
      boundary: 'Baca-saja; tidak pernah mengirim pesan atau menyepakati kontrak, milestone, maupun komitmen finansial.',
      metric: inboxWaiting === undefined ? 'Status kotak masuk tidak tersedia' : `${inboxWaiting} pesan menunggu balasan`,
      to: '/inbox',
    },
    {
      id: 'operations-analyst', name: 'Operations Analyst', dept: 'Operations', role: 'Analis Pipeline & Jadwal',
      task: 'Mengawasi pipeline, tenggat proyek klien, dan pembayaran yang belum diterima.',
      boundary: 'Aksi internal yang dapat dibatalkan; tidak memanggil API tulis platform eksternal.',
      metric: policy ? `Kebijakan versi ${policy.version}: ${policy.state === 'active' ? 'aktif' : policy.state === 'paused' ? 'dijeda' : 'belum aktif'}` : 'Status kebijakan tidak tersedia',
      to: '/work',
    },
    {
      id: 'knowledge-curator', name: 'Knowledge Curator', dept: 'Knowledge Hub', role: 'Kurator Pengetahuan & Kode',
      task: 'Menyinkronkan repositori GitHub dan catatan lokal ke database PostgreSQL (pencarian teks Postgres) untuk dijadikan bukti klaim proposal.',
      boundary: 'Read-only lokal; memindai & mengecualikan token/kredensial sebelum pengindeksan.',
      metric: counts ? `${counts.knowledgeSources} sumber pengetahuan diindeks` : 'Jumlah sumber tidak tersedia',
      to: '/knowledge',
    },
    {
      id: 'compliance-auditor', name: 'Compliance Auditor', dept: 'Compliance & Audit', role: 'Auditor Kebijakan & Keamanan',
      task: 'Memverifikasi setiap draf terhadap batas harga, kata kunci dilarang, dan ketersediaan bukti sumber.',
      boundary: 'Pemeriksaan deterministik harga, jadwal, risiko, kecocokan, dan kuota. Klaim proposal mengikuti fakta profil dan Knowledge Hub.',
      metric: counts ? `${counts.policySkips} keputusan skip tercatat di audit` : 'Jumlah keputusan tidak tersedia',
      to: '/policy',
    },
    {
      id: 'qa-engineer', name: 'QA Engineer', dept: 'Quality Assurance', role: 'Verifikator Kontrak & Smoke',
      task: 'Mengerjakan kartu kode dari kanban Hermes di worktree git terpisah: menulis tes, menjalankan lint, typecheck dan tes.',
      boundary: 'Profil Hermes fvh-qa-engineer; tool file dan terminal hanya di worktree kartu, tanpa push atau perubahan main.',
      metric: kanban.isError ? 'Status kanban tidak tersedia' : 'Status dari kartu kanban Hermes',
      to: '/tasks',
    },
    {
      id: 'projects-co-id-scout', name: 'Scout projects.co.id', dept: 'Lantai 1', role: 'Cari proyek & siapkan draf projects.co.id',
      task: 'Membaca proyek dan menulis draf lokal sesuai kebijakan IDR.',
      boundary: 'Worker hanya membaca; pemilik mengirim sendiri di situs.',
      metric: projectsCoId.isError ? 'Status tidak tersedia' : projectsCoId.data?.reason ?? 'Worker belum tersedia.',
      to: '/projects-co-id',
    },
    ...OPERATIONS_ROSTER.map((a): AgentCopy => ({
      id: a.id, name: a.name, dept: `Lantai ${a.floor}`, role: a.role, task: a.role,
      boundary: 'Pekerjaan dari data tersimpan. Pesan hanya untuk proyek yang diaktifkan pemilik; pembayaran tidak ditebak.',
      metric: operations.isError ? 'Status tidak tersedia' : operations.data?.runtime.jobs[a.id]?.lastRunAt ? `Terakhir ${formatDate(operations.data.runtime.jobs[a.id]!.lastRunAt!)}` : 'Menunggu tugas sesuai peran.',
      to: '/operations',
    })),
  ];

  const failed = [
    dashboard.isError && { key: 'dashboard', label: 'ringkasan' },
    profile.isError && { key: 'profile', label: 'profil' },
    capabilities.isError && { key: 'capabilities', label: 'integrasi' },
    autopilot.isError && { key: 'autopilot', label: 'operasi' },
    projectsCoId.isError && { key: 'projects-co-id', label: 'projects.co.id' },
    kanban.isError && { key: 'hermes-kanban', label: 'kanban Hermes' },
    sync.isError && { key: 'business-sync', label: 'sinkronisasi bisnis' },
    inbox.isError && { key: 'inbox', label: 'kotak masuk' },
    work.isError && { key: 'work', label: 'proyek dan pendapatan' },
    operations.isError && { key: 'operations', label: 'operasional lantai 2' },
    knowledgeSync.isError && { key: 'knowledge-sync', label: 'sinkronisasi Knowledge Hub' },
  ].filter((item): item is { key: string; label: string } => Boolean(item));
  const retryFailed = () => failed.forEach((item) => queryClient.invalidateQueries({ queryKey: [item.key] }));

  const summary = summarize(derived);

  return <>
    <PageIntro eyebrow="Organisasi virtual" title="Tim AI" description="Status diambil dari proses aplikasi dan kartu Hermes yang nyata. Buka detail peran untuk tugas dan batas aksesnya." />
    <OfficeLearningCard />
    <section className="card-summary-grid" aria-labelledby="crew-title" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 12rem), 1fr))' }}>
      <h2 id="crew-title" className="sr-only">Ringkasan status kru</h2>      <Metric label="Sedang bertugas" value={summary.working} note="Proses nyata atau kartu Hermes aktif" tone="primary" />
      <Metric label="Idle" value={summary.idle} note="Tidak ada pekerjaan aktif saat ini" />
      <Metric label="Offline" value={summary.offline} note="Alasan tercatat pada tiap agen" />
      <Metric label="Belum diketahui" value={summary.unknown} note="Sinyal server belum tersedia" />
    </section>
    <p className="card-status-note">Status mengikuti proses aplikasi dan kartu kanban Hermes. Idle berarti tidak ada pekerjaan aktif; Offline memiliki alasan pada masing-masing agen.</p>
    {failed.length > 0 && <ErrorNotice message={`Sinyal status berikut tidak tersedia: ${failed.map((item) => item.label).join(', ')}. Kartu terkait ditandai Tidak diketahui.`} onRetry={retryFailed} />}
    {kanban.isPending && <LoadingPanel label="Memuat kartu kanban Hermes..." />}
    <section aria-labelledby="agent-list-title">
      <h2 id="agent-list-title" className="sr-only">Daftar agen</h2>
      <div className="agent-grid">
        {agents.map((agent) => {
          const live = derived.find((item) => item.id === agent.id);
          const state = live?.state ?? 'unknown';
          return <article className="agent-card" key={agent.id}>
            <div>
              <div className="agent-card-header">
                <div>
                  <span className="agent-dept">{agent.dept}</span>
                  <h3>{agent.name}</h3>
                  <small className="agent-role">{agent.role}</small>
                </div>
                <span className={`state-label state-${state}`}>
                  <span className="vo3d-state-dot" aria-hidden="true" style={{ background: STATE_COLORS[state] }} />
                  {STATE_LABELS[state]}
                </span>
              </div>
              <p className="agent-reason">{live?.reason ?? 'Data server tidak tersedia.'}</p>
              <p className="agent-task"><span>Tugas: </span>{live?.task ?? 'Tidak ada tugas aktif yang dilaporkan.'}</p>
              <details className="card-disclosure">
                <summary>Peran dan batas akses</summary>
                <p>{agent.task}</p>
                <p><strong>Batas akses:</strong> {agent.boundary}</p>
              </details>
            </div>
            <div className="agent-foot" style={{ flexWrap: 'wrap', gap: '8px 12px' }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{agent.metric}</span>
              <Link className="button button-secondary" to={agent.to} aria-label={`Buka ruang kerja ${agent.name}`}>Buka ruang kerja</Link>
            </div>
          </article>;
        })}
      </div>
    </section>
  </>;
}
