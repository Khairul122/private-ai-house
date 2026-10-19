import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type AuditEvent, type Autopilot, type BusinessSyncStatus, type Capabilities, type Inbox, type Policy, type Profile, type Work } from '../api/api.js';
import { deriveOfficeAgents, STATE_COLORS, STATE_LABELS } from '../state/office-state.js';
import type { ProjectsCoIdStatus } from '../api/projects-co-id-api.js';
import type { BrowserBiddingStatus } from '../api/browser-bidding-api.js';
import type { OperationsData } from '../api/operations-api.js';
import { OPERATIONS_ROSTER } from '@fvh/domain';
import { kanbanQuery } from '../api/queries.js';
import { ErrorNotice, LoadingPanel, PageIntro, OperationStatus } from '../components/ui.js';
import { formatDate } from '../components/format.js';

export default function AgentsPage() {
  const projectsCoId = useQuery({ queryKey: ['projects-co-id'], queryFn: () => api<ProjectsCoIdStatus | null>('/projects-co-id'), refetchInterval: 3000 });
  const kanban = useQuery(kanbanQuery);
  const operations=useQuery({queryKey:['operations'],queryFn:()=>api<OperationsData>('/operations'),refetchInterval:5000});
  const knowledgeSync = useQuery({ queryKey: ['knowledge-sync'], queryFn: () => api<{ job: { state: string; provider: string; current: string | null } | null }>('/knowledge/sync-status'), refetchInterval: 3_000 });
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<{
    policy: { state: Policy['state']; version: number };
    counts: { openProjects: number; drafts: number; policySkips: number; knowledgeSources: number };
    activity: AuditEvent[];
  }>('/dashboard') });
  const autopilot = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 30_000 });
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/profile') });
  const browserBidding = useQuery({queryKey:['browser-bidding'],queryFn:()=>api<BrowserBiddingStatus|null>('/browser-bidding'),refetchInterval:3000});
  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: () => api<Capabilities>('/capabilities') });
  const sync = useQuery({ queryKey: ['business-sync'], queryFn: () => api<BusinessSyncStatus | null>('/business-sync'), refetchInterval: 30_000 });
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => api<Inbox>('/inbox'), refetchInterval: 60_000 });
  const work = useQuery({ queryKey: ['work'], queryFn: () => api<Work>('/work'), refetchInterval: 60_000 });

  if (dashboard.isPending || profile.isPending || capabilities.isPending) return <LoadingPanel label="Menyiapkan data karyawan virtual..." />;
  if (dashboard.isError || profile.isError || capabilities.isError) return <ErrorNotice message="Gagal memuat status karyawan virtual." />;

  const inboxWaiting = inbox.isError ? undefined : inbox.data?.needsReply.length;
  const derived = deriveOfficeAgents(autopilot.isError ? undefined : autopilot.data, dashboard.data.activity, {
    projectsCoId: projectsCoId.isError ? undefined : projectsCoId.data, kanban: kanban.isError ? undefined : kanban.data,
    sync: sync.isError ? undefined : sync.data, inboxWaiting, dueSoon: work.isError ? undefined : work.data?.dueSoon, hermes: capabilities.data.hermes, knowledge: knowledgeSync.isError ? undefined : knowledgeSync.data?.job,operations:operations.isError?undefined:operations.data,browserBidding:browserBidding.isError?undefined:browserBidding.data,
  });
  const agents = [
    {
      id: 'lead-agent',
      name: 'Lead Agent',
      dept: 'Kepemimpinan',
      role: 'Koordinator Tim AI (Hermes)',
      task: 'Menyusun draf proposal dengan Hermes dari fakta profil dan bukti Knowledge Hub ketika draf diminta.',
      boundary: 'Hanya membuat draf; pengiriman bid tetap melewati policy engine. Kredensial marketplace tidak dikirim ke Hermes.',
      metric: capabilities.data.hermes.active ? `Hermes aktif · ${dashboard.data.counts.drafts} draf tersimpan` : 'Hermes nonaktif',
    },
    {
      id: 'chief-of-staff',
      name: 'Chief of Staff',
      dept: 'Executive / Operasi',
      role: 'Orchestrator Ruang Kerja',
      task: 'Merangkum status antrean peluang, memonitor kepatuhan ritme automasi, dan mengarahkan fokus peran virtual.',
      boundary: 'Akses baca data lokal workspace; hanya membuat usulan tugas internal tanpa aksi eksternal.',
      metric: `${dashboard.data.counts.openProjects} peluang aktif dalam pantauan`,
    },
    {
      id: 'market-scout',
      name: 'Market Scout',
      dept: 'Sales & Bids',
      role: 'Pencari & Penilai Pasar',
      task: 'Menyaring peluang proyek dari provider Freelancer resmi dan menghitung skor kecocokan berdasarkan profil keahlian.',
      boundary: 'Hanya membaca proyek tersinkron resmi; tidak melakukan scraping mandiri atau bypass rate limit.',
      metric: `${dashboard.data.counts.openProjects} peluang telah dipindai & dinilai`,
    },
    {
      id: 'bid-strategist',
      name: 'Bid Strategist',
      dept: 'Sales & Bids',
      role: 'Perumus Proposal & Harga',
      task: 'Meninjau hasil bid dan mendampingi siklus proposal. Harga serta durasi bid otomatis ditetapkan secara deterministik oleh kebijakan.',
      boundary: 'Menghasilkan draf terstruktur; setiap eksekusi wajib lolos persetujuan deterministik policy engine.',
      metric: `${dashboard.data.counts.drafts} draf proposal lokal disiapkan`,
    },
    {
      id: 'profile-editor',
      name: 'Profile Editor',
      dept: 'Profile Studio',
      role: 'Kurator Profil & Bukti',
      task: 'Memelihara fakta profil, ringkasan spesialisasi, dan mengusulkan pembaruan berbasis bukti nyata repositori/portofolio.',
      boundary: 'Fakta diperbarui saat Anda membuka dan menyimpan kartu Profil. Tidak ada proses penyuntingan profil otomatis.',
      metric: `${profile.data.facts.length} fakta profil tersimpan`,
    },
    {
      id: 'client-relations',
      name: 'Client Relations',
      dept: 'Client Relations',
      role: 'Manajer Komunikasi Klien',
      task: 'Membaca pesan Freelancer setiap 10 menit, menandai pesan yang menunggu balasan, dan bid yang perlu ditindaklanjuti.',
      boundary: 'Baca-saja; tidak pernah mengirim pesan atau menyepakati kontrak, milestone, maupun komitmen finansial.',
      metric: inboxWaiting === undefined ? 'Status kotak masuk tidak tersedia' : `${inboxWaiting} pesan menunggu balasan`,
    },
    {
      id: 'operations-analyst',
      name: 'Operations Analyst',
      dept: 'Operations',
      role: 'Analis Pipeline & Jadwal',
      task: 'Mengawasi pipeline, tenggat proyek klien, dan pembayaran yang belum diterima.',
      boundary: 'Aksi internal yang dapat dibatalkan; tidak memanggil API tulis platform eksternal.',
      metric: `Kebijakan versi ${dashboard.data.policy.version}: ${dashboard.data.policy.state === 'active' ? 'aktif' : dashboard.data.policy.state === 'paused' ? 'dijeda' : 'belum aktif'}`,
    },
    {
      id: 'knowledge-curator',
      name: 'Knowledge Curator',
      dept: 'Knowledge Hub',
      role: 'Kurator Pengetahuan & Kode',
      task: 'Menyinkronkan repositori GitHub dan catatan lokal ke Supabase (pencarian teks Postgres) untuk dijadikan bukti klaim proposal.',
      boundary: 'Read-only lokal; memindai & mengecualikan token/kredensial sebelum pengindeksan.',
      metric: `${dashboard.data.counts.knowledgeSources} sumber pengetahuan diindeks`,
    },
    {
      id: 'compliance-auditor',
      name: 'Compliance Auditor',
      dept: 'Compliance & Audit',
      role: 'Auditor Kebijakan & Keamanan',
      task: 'Memverifikasi setiap draf terhadap batas harga, kata kunci dilarang, dan ketersediaan bukti sumber.',
      boundary: 'Pemeriksaan deterministik harga, jadwal, risiko, kecocokan, dan kuota. Klaim proposal mengikuti fakta profil dan Knowledge Hub.',
      metric: `${dashboard.data.counts.policySkips} keputusan skip tercatat di audit`,
    },
    {
      id: 'qa-engineer',
      name: 'QA Engineer',
      dept: 'Quality Assurance',
      role: 'Verifikator Kontrak & Smoke',
      task: 'Mengerjakan kartu kode dari kanban Hermes di worktree git terpisah: menulis tes, menjalankan lint, typecheck dan tes.',
      boundary: 'Profil Hermes fvh-qa-engineer; tool file dan terminal hanya di worktree kartu, tanpa push atau perubahan main.',
      metric: 'Status dari kartu kanban Hermes',
    },
    {id:'browser-bid-operator',name:'Operator Browser Bid',dept:'Lantai 1',role:'Pengiriman bid melalui Chrome',task:'Mengirim proposal autopilot melalui tab kerja pada Chrome berprofil pemilik.',boundary:'Kebijakan, kuota, akun dan payload diperiksa sebelum klik; hasil tidak pasti ditahan.',metric:browserBidding.isError?'Status tidak tersedia':browserBidding.data?.reason ?? 'Worker belum tersedia.'},
    { id: 'projects-co-id-scout', name: 'Scout projects.co.id', dept: 'Lantai 1', role: 'Cari proyek & siapkan draf projects.co.id', task: 'Membaca proyek dan menulis draf lokal sesuai kebijakan IDR.', boundary: 'Worker hanya membaca; pemilik mengirim sendiri di situs.', metric: projectsCoId.isError ? 'Status tidak tersedia' : projectsCoId.data?.reason ?? 'Worker belum tersedia.' },
    ...OPERATIONS_ROSTER.map(a=>({id:a.id,name:a.name,dept:`Lantai ${a.floor}`,role:a.role,task:a.role,boundary:'Pekerjaan dari data tersimpan. Pesan hanya untuk proyek yang diaktifkan pemilik; pembayaran tidak ditebak.',metric:operations.isError?'Status tidak tersedia':operations.data?.runtime.jobs[a.id]?.lastRunAt?`Terakhir ${formatDate(operations.data.runtime.jobs[a.id]!.lastRunAt!)}`:'Menunggu tugas sesuai peran.'})),
  ];

  return <>
    <PageIntro
      eyebrow="Organisasi virtual"
      title={`${agents.length} peran spesialis, satu kendali pemilik.`}
      description="Peran virtual mencerminkan proses aplikasi. Autopilot, sinkronisasi bisnis, dan Hermes memberi sinyal kerja nyata; peran lainnya bekerja saat fiturnya dipanggil."
    />
    <OperationStatus data={autopilot.isError ? undefined : autopilot.data} unavailable={autopilot.isError} />
    <p className="notice">Bekerja berarti ada proses nyata yang sedang berjalan. Idle berarti siap atau bekerja saat dipanggil. QA Engineer belum memiliki proses runtime.</p>
    <div className="agent-grid">
      {agents.map((agent) => (
        <article className="agent-card" key={agent.id}>
          <div>
            <div className="agent-card-header">
              <div>
                <span className="agent-dept">{agent.dept}</span>
                <h3>{agent.name}</h3>
                <small className="agent-role">{agent.role}</small>
              </div>
              {(() => { const derivedAgent = derived.find((item) => item.id === agent.id); const state = derivedAgent?.state ?? 'unknown'; return <><span className="vo3d-state-dot" style={{ background: STATE_COLORS[state] }} /><span className="state-label">{STATE_LABELS[state]}</span><small className="agent-reason">{derivedAgent?.reason ?? 'Data server tidak tersedia.'}</small></>; })()}
            </div>
            <p className="agent-task">{agent.task}</p>
            <div className="agent-boundary">
              <strong>Batas akses:</strong> {agent.boundary}
            </div>
          </div>
          <div className="agent-foot">
            <span>{agent.metric}</span>
            <Link className="button button-secondary" to={OPERATIONS_ROSTER.some(a=>a.id===agent.id)?'/operations':agent.id === 'knowledge-curator' ? '/knowledge' : agent.id === 'profile-editor' ? '/profile' : agent.id === 'client-relations' ? '/inbox' : agent.id === 'compliance-auditor' ? '/policy' : agent.id === 'operations-analyst' ? '/work' : agent.id === 'market-scout' ? '/opportunities' : agent.id === 'bid-strategist' || agent.id === 'lead-agent' ? '/pipeline' : agent.id === 'qa-engineer' ? '/capabilities' : '/overview'}>Buka ruang kerja</Link>
          </div>
        </article>
      ))}
    </div>
  </>;
}
