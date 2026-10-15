import { lazy, Suspense, useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Outlet, Route, Routes, useLocation } from 'react-router';
import { api, jsonRequest, type AuditEvent, type Autopilot, type BidDraft, type Capabilities, type Opportunity, type Policy, type Profile } from './api.js';

const ThreeOffice = lazy(() => import('./ThreeOffice.js'));

const navigation = [
  { to: '/', label: 'Ringkasan', end: true },
  { to: '/agents', label: 'Karyawan AI' },
  { to: '/tasks', label: 'Papan Tugas' },
  { to: '/calendar', label: 'Kalender' },
  { to: '/opportunities', label: 'Peluang' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/profile', label: 'Profil' },
  { to: '/policy', label: 'Kebijakan' },
  { to: '/knowledge', label: 'Knowledge Hub' },
  { to: '/activity', label: 'Aktivitas' },
  { to: '/office', label: 'Ruang 3D' },
];

const fields = ['Fullstack Engineer', 'Backend Engineer', 'Android Engineer', 'iOS Engineer', 'Frontend Engineer', 'DevOps Engineer', 'QA Engineer', 'UI/UX Designer', 'Data Engineer', 'Technical Writer'];

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('id-ID')}`;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function StateLabel({ state }: { state: string }) {
  const labels: Record<string, string> = {
    active: 'Aktif', running: 'Berjalan', starting: 'Menyiapkan', connected: 'Terhubung', supported: 'Didukung API', unknown: 'Belum diverifikasi', unverified: 'Belum diuji', invalid: 'Token tidak valid', unavailable: 'Tidak dapat diperiksa', expired: 'Kedaluwarsa', paused: 'Dijeda', draft: 'Belum aktif', recorded: 'Tercatat', blocked: 'Dilewati', failed: 'Gagal',
    new: 'Baru', scored: 'Dinilai', draft_ready: 'Draf siap', policy_check: 'Pemeriksaan kebijakan', submitted: 'Terkirim',
    in_conversation: 'Percakapan', won: 'Berhasil', lost: 'Tidak lanjut', skipped: 'Dilewati',
    reconciliation_required: 'Perlu rekonsiliasi', error: 'Kesalahan',
  };
  return <span className={`state-label state-${state}`}>{labels[state] ?? state}</span>;
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice notice-error" role="alert">
      <span>{message}</span>
      {onRetry && <button className="button button-text" type="button" onClick={onRetry}>Coba lagi</button>}
    </div>
  );
}

function LoadingPanel({ label = 'Memuat data lokal...' }: { label?: string }) {
  return <div className="loading-panel" role="status" aria-live="polite"><span className="loading-line" />{label}</div>;
}

function Layout() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [dark, setDark] = useState(() => localStorage.getItem('fvh-theme') === 'dark');
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<{ policy: { state: Policy['state'] }; counts: Record<string, number> }>('/dashboard') });
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ ok: boolean; mode: string; liveWrites: boolean }>('/health') });
  const pause = useMutation({
    mutationFn: (action: 'pause' | 'resume') => api<Policy>(`/policy/${action}`, jsonRequest('POST')),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['policy'] }); },
  });
  const pageTitle = navigation.find((item) => item.to === location.pathname)?.label ?? 'Halaman';

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('fvh-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <div className="app-frame">
      <aside className="side-panel" aria-label="Navigasi ruang kerja">
        <Link to="/" className="brand-lockup" aria-label="Freelancer Virtual House, ringkasan">
          <span className="brand-mark" aria-hidden="true">FH</span>
          <span><strong>Freelancer</strong><small>Virtual House</small></span>
        </Link>
        <div className="workspace-label"><span>RUANG KERJA</span><strong>Workspace lokal</strong></div>
        <nav className="primary-nav">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end ?? false} className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}>
              <span className="nav-mark" aria-hidden="true" />{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <p>Autopilot membaca proyek dan mengirim bid yang lolos kebijakan secara otomatis.</p>
          <Link to="/capabilities" className="capability-link">Status integrasi</Link>
        </div>
      </aside>

      <main className="main-column">
        <header className="topbar">
          <div className="crumb"><span>Ruang kerja</span><span className="crumb-separator" aria-hidden="true">/</span><strong>{pageTitle}</strong></div>
          <div className="top-actions">
            {dashboard.data && dashboard.data.policy.state !== 'draft' && (
              <button
                className={`button ${dashboard.data.policy.state === 'active' ? 'button-danger' : 'button-secondary'}`}
                type="button"
                disabled={pause.isPending}
                onClick={() => pause.mutate(dashboard.data?.policy.state === 'active' ? 'pause' : 'resume')}
              >{dashboard.data.policy.state === 'active' ? 'Jeda automasi' : 'Lanjutkan kebijakan'}</button>
            )}
            <button className="theme-toggle" type="button" onClick={() => setDark((value) => !value)} aria-label={dark ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'} aria-pressed={dark}>
              <span aria-hidden="true" className="theme-symbol">{dark ? 'Terang' : 'Gelap'}</span>
            </button>
          </div>
        </header>

        {health.isError && <ErrorNotice message="API lokal belum terhubung. Nyalakan server lalu muat ulang halaman." onRetry={() => { health.refetch(); dashboard.refetch(); }} />}
        {pause.isError && <ErrorNotice message={pause.error.message} />}
        <div className="mode-strip"><span className="mode-indicator" />{health.data?.mode === 'local' ? 'Workspace lokal' : 'Menyiapkan workspace'}<span className="mode-divider" />Aksi eksternal nonaktif</div>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  );
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="intro-copy">{description}</p></div>{action && <div className="page-intro-action">{action}</div>}</div>;
}

function Metric({ label, value, note, tone = 'plain' }: { label: string; value: string | number; note: string; tone?: string }) {
  return <div className={`metric metric-${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function ActivityRows({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <div className="empty-state"><h3>Belum ada aktivitas</h3><p>Perubahan kebijakan, draf, simulasi, dan impor akan muncul di sini.</p></div>;
  return <ol className="activity-list">
    {events.map((event) => (
      <li key={event.id} className="activity-row">
        <span className={`activity-mark activity-mark-${event.status}`} aria-hidden="true" />
        <div className="activity-copy">
          <strong>{activityTitle(event.type)}</strong>
          <p>{event.reason}</p>
          <small>{formatDate(event.createdAt)}</small>
          {event.payloadHash && <small className="local-reference" style={{ display: 'block', marginTop: 2 }}>Hash payload: {event.payloadHash.slice(0, 16)}...</small>}
        </div>
        <StateLabel state={event.status} />
      </li>
    ))}
  </ol>;
}

function activityTitle(type: string) {
  const titles: Record<string, string> = {
    'policy.updated': 'Kebijakan diperbarui', 'policy.activated': 'Kebijakan diaktifkan', 'policy.paused': 'Kill switch dijalankan',
    'policy.resumed': 'Kebijakan dilanjutkan', 'policy.reactivation_required': 'Aktivasi ulang diperlukan', 'profile.updated': 'Profil lokal diperbarui',
    'bid.draft_created': 'Draf proposal dibuat', 'bid.draft_updated': 'Draf proposal diubah', 'bid.simulated': 'Simulasi bid dicatat',
    'bid.simulation_skipped': 'Simulasi dilewati', 'knowledge.imported': 'Sumber pengetahuan diimpor', 'knowledge.github_sync': 'Repositori GitHub disinkronkan',
    'knowledge.deleted': 'Sumber dihapus',
  };
  return titles[type] ?? 'Aktivitas ruang kerja';
}

function OverviewPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => api<{
    mode: string; counts: { openProjects: number; drafts: number; submittedBids: number; policySkips: number; knowledgeSources: number };
    policy: { state: Policy['state']; version: number; simulationOnly: boolean }; profileComplete: boolean;
    projects: Opportunity[]; activity: AuditEvent[]; externalWrites: boolean;
  }>('/dashboard') });
  const projects = useQuery({ queryKey: ['projects', 'overview'], queryFn: () => api<Opportunity[]>('/projects') });
  const pipeline = useQuery({ queryKey: ['pipeline'], queryFn: () => api<Array<Opportunity & { latestDraft: BidDraft | null }>>('/pipeline') });

  if (query.isPending || projects.isPending) return <LoadingPanel />;
  if (query.isError || projects.isError) return <ErrorNotice message="Ringkasan belum dapat dimuat." onRetry={() => { queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['projects'] }); }} />;
  const data = query.data;

  return <>
    <PageIntro eyebrow="15 Oktober 2026 / ruang operasi" title="Kerja yang baik dimulai dari konteks yang jelas." description="Autopilot memantau peluang Freelancer, menyusun penawaran, dan menjalankan batas operasi tersimpan." action={<Link to="/opportunities" className="button button-primary">Buka antrean peluang</Link>} />
    <section className="metrics-row" aria-label="Ringkasan ruang kerja">
      <Metric label="Peluang terbuka" value={data.counts.openProjects} note="Dipindai otomatis" tone="primary" />
      <Metric label="Bid terkirim" value={data.counts.submittedBids} note="Dikonfirmasi Freelancer" />
      <Metric label="Sumber knowledge" value={data.counts.knowledgeSources} note="Fakta lokal yang bisa ditelusuri" />
      <Metric label="Keputusan dilewati" value={data.counts.policySkips} note="Alasan tersimpan di aktivitas" />
    </section>
    {pipeline.data && (
      <div className="pipeline-overview-bar" aria-label="Ringkasan status pipeline">
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', alignSelf: 'center', marginRight: 4 }}>DISTRIBUSI PIPELINE:</span>
        <div className="pipeline-chip"><span>Baru:</span><strong>{pipeline.data.filter((p) => p.pipelineStatus === 'new').length}</strong></div>
        <div className="pipeline-chip"><span>Dinilai:</span><strong>{pipeline.data.filter((p) => p.pipelineStatus === 'scored').length}</strong></div>
        <div className="pipeline-chip"><span>Draf Siap:</span><strong>{pipeline.data.filter((p) => p.pipelineStatus === 'draft_ready').length}</strong></div>
        <div className="pipeline-chip"><span>Pemeriksaan:</span><strong>{pipeline.data.filter((p) => p.pipelineStatus === 'policy_check').length}</strong></div>
        <div className="pipeline-chip"><span>Terkirim:</span><strong>{pipeline.data.filter((p) => p.pipelineStatus === 'submitted').length}</strong></div>
        <div className="pipeline-chip"><span>Percakapan:</span><strong>{pipeline.data.filter((p) => p.pipelineStatus === 'in_conversation').length}</strong></div>
        <div className="pipeline-chip"><span>Dilewati:</span><strong>{pipeline.data.filter((p) => p.pipelineStatus === 'skipped').length}</strong></div>
      </div>
    )}
    <div className="overview-grid">
      <section className="queue-section" aria-labelledby="queue-title">
        <div className="section-heading"><div><p className="eyebrow">Antrean berikutnya</p><h2 id="queue-title">Peluang yang layak ditinjau</h2></div><Link to="/opportunities" className="text-link">Semua peluang</Link></div>
        <div className="queue-list">
          {projects.data.slice(0, 3).map((project, index) => (
            <article className="queue-item" key={project.id}>
              <span className="queue-index">0{index + 1}</span>
              <div className="queue-main"><Link to={`/opportunities?project=${encodeURIComponent(project.id)}`} className="queue-title">{project.title}</Link><p>{project.clientName} / {project.skills.slice(0, 2).join(', ')}</p></div>
              <div className="queue-score"><strong>{project.score}</strong><small>kecocokan</small></div>
              <span className="queue-budget">{formatMoney(project.budgetMin, project.currency)} - {formatMoney(project.budgetMax, project.currency)}</span>
            </article>
          ))}
        </div>
      </section>
      <aside className="policy-card" aria-labelledby="policy-overview-title">
        <div className="section-heading"><div><p className="eyebrow">Batas operasi</p><h2 id="policy-overview-title">Kebijakan kerja</h2></div><StateLabel state={data.policy.state} /></div>
        <p className="policy-copy">{data.policy.state === 'active' && !data.policy.simulationOnly ? 'Autopilot live berjalan di bawah batas lokal dan mengirim bid yang lolos pemeriksaan.' : data.policy.state === 'paused' ? 'Jeda darurat aktif; tindakan berikutnya dihentikan.' : 'Autopilot sedang menyiapkan profil Freelancer dan kebijakan otomatis.'}</p>
        <div className="policy-details"><span>Versi</span><strong>{data.policy.version}</strong><span>Profil</span><strong>{data.profileComplete ? 'Tersinkron' : 'Menunggu sinkronisasi'}</strong><span>Mode tulis</span><strong>{data.policy.simulationOnly ? 'Simulasi' : 'Live'}</strong></div>
        <Link className="button button-secondary button-wide" to="/policy">Tinjau batas kebijakan</Link>
      </aside>
    </div>
    <section className="activity-preview" aria-labelledby="activity-overview-title">
      <div className="section-heading"><div><p className="eyebrow">Jejak keputusan</p><h2 id="activity-overview-title">Aktivitas terbaru</h2></div><Link to="/activity" className="text-link">Buka log</Link></div>
      <ActivityRows events={data.activity} />
    </section>
  </>;
}

function OpportunitiesPage() {
  const location = useLocation();
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['projects', 'opportunities', search], queryFn: () => api<Opportunity[]>('/projects?search=' + encodeURIComponent(search)), refetchInterval: 30_000 });
  const autopilot = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 30_000 });
  useEffect(() => {
    const projectId = new URLSearchParams(location.search).get('project');
    if (!projectId || !query.data) return;
    const project = query.data.find((item) => item.id === projectId);
    if (project) document.getElementById('opportunity-' + project.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [location.search, query.data]);
  if (query.isPending) return <LoadingPanel />;
  if (query.isError) return <ErrorNotice message="Peluang belum dapat dimuat." onRetry={() => query.refetch()} />;
  const status = autopilot.data;
  return <>
    <PageIntro eyebrow="Antrean peluang" title="Peluang dipindai otomatis." description="Autopilot membaca pencarian yang cocok dengan profil Freelancer dan membuat bid tanpa form per proyek. Daftar ini diperbarui berkala." />
    <section className="filter-bar" aria-label="Filter peluang tersimpan">
      <label className="search-field"><span>Filter daftar lokal</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Judul atau teknologi" /></label>
      <div className="filter-note"><strong>{query.data.length}</strong> peluang tersimpan <span>{status?.lastRunAt ? 'Siklus terakhir ' + formatDate(status.lastRunAt) : 'Autopilot sedang menyiapkan siklus'}</span></div>
    </section>
    <section className="sync-panel form-card" aria-label="Status pemindaian otomatis Freelancer">
      <div className="section-heading"><div><p className="eyebrow">Freelancer.com</p><h2>Pemindaian otomatis</h2></div><StateLabel state={status?.state ?? 'starting'} /></div>
      <p className="form-help">{status?.lastMessage ?? 'Menghubungkan profil Freelancer dan memulai siklus.'}</p>
      {status?.specializations.length ? <div className="tag-row">{status.specializations.map((skill) => <span className="skill-tag" key={skill}>{skill}</span>)}</div> : null}
      <div className="autopilot-metrics"><span>{status?.lastImported ?? 0} proyek terakhir dipindai</span><span>{status?.lastSubmitted ?? 0} bid dikirim pada siklus terakhir</span><span>{status?.nextRunAt ? 'Pindai lagi ' + formatDate(status.nextRunAt) : 'Jadwal berikutnya belum tersedia'}</span></div>
    </section>
    <div className="opportunity-list">
      {query.data.length === 0 && <div className="empty-state"><h3>Belum ada peluang tersimpan</h3><p>Autopilot akan mengisi daftar ini pada pemindaian berikutnya sesuai keahlian di profil Freelancer.</p></div>}
      {query.data.map((project) => (
        <article className="opportunity-row" id={'opportunity-' + project.id} key={project.id}>
          <div className="opportunity-topline"><span className="eyebrow">{project.clientName} / {project.source === 'freelancer' ? 'FREELANCER.COM' : 'FIXTURE PENGUJIAN'}</span><span className="score-mark"><strong>{project.score}</strong><small>skor kecocokan</small></span></div>
          <h2>{project.title}</h2>
          <p className="opportunity-description">{project.description}</p>
          <div className="tag-row">{project.skills.map((skill) => <span className="skill-tag" key={skill}>{skill}</span>)}</div>
          <div className="factor-list" aria-label="Alasan skor">{project.factors.map((factor) => <span key={factor.key}><small>{factor.label}</small><strong>{factor.value}</strong></span>)}</div>
          <div className="opportunity-footer"><div><strong>{formatMoney(project.budgetMin, project.currency)} - {formatMoney(project.budgetMax, project.currency)}</strong><span>{project.deadlineDays === null ? 'Deadline tidak diberikan; proposal menetapkan durasi 14 hari' : 'Sisa ' + project.deadlineDays + ' hari'} / brief {Math.round(project.briefQuality * 100)}%</span></div><StateLabel state={project.pipelineStatus} /></div>
        </article>
      ))}
    </div>
  </>;
}

function PipelinePage() {
  const query = useQuery({ queryKey: ['pipeline'], queryFn: () => api<Array<Opportunity & { latestDraft: BidDraft | null }>>('/pipeline') });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError) return <ErrorNotice message="Pipeline belum dapat dimuat." onRetry={() => query.refetch()} />;
  const projects = query.data;
  return <>
    <PageIntro eyebrow="Pipeline bid" title="Status dari respons marketplace." description="Bid live masuk ke status terkirim hanya setelah Freelancer mengembalikan HTTP 200. Draft dan alasan kebijakan tersimpan di sini." />
    <div className="pipeline-summary"><strong>{projects.filter((project) => project.latestDraft).length}</strong><span>draf lokal</span><span className="pipeline-divider" /><strong>{projects.filter((project) => project.pipelineStatus === 'submitted').length}</strong><span>terkonfirmasi dari marketplace</span></div>
    <div className="pipeline-list">{projects.map((project) => (
      <article className="pipeline-row" key={project.id}>
        <div><p className="eyebrow">{project.clientName}</p><h2>{project.title}</h2><p>{project.latestDraft ? project.latestDraft.proposal.slice(0, 180) : 'Belum ada proposal. Siapkan draf dari antrean peluang.'}</p></div>
        <div className="pipeline-state"><StateLabel state={project.pipelineStatus} /><strong>{project.latestDraft ? formatMoney(project.latestDraft.proposedPrice, project.currency) : 'Belum ada harga'}</strong></div>
        <Link to={project.latestDraft ? `/opportunities?project=${encodeURIComponent(project.id)}` : '/opportunities'} className="button button-secondary">{project.latestDraft ? 'Buka draf' : 'Lihat peluang'}</Link>
      </article>
    ))}</div>
  </>;
}

function AgentsPage() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<{
    policy: { state: Policy['state']; version: number };
    counts: { openProjects: number; drafts: number; policySkips: number; knowledgeSources: number };
    activity: AuditEvent[];
  }>('/dashboard') });
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/profile') });
  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: () => api<Capabilities>('/capabilities') });

  if (dashboard.isPending || profile.isPending || capabilities.isPending) return <LoadingPanel label="Menyiapkan data karyawan virtual..." />;
  if (dashboard.isError || profile.isError || capabilities.isError) return <ErrorNotice message="Gagal memuat status karyawan virtual." />;

  const policyState = dashboard.data.policy.state;
  const isPaused = policyState === 'paused';
  const isDraft = policyState === 'draft';

  const agents = [
    {
      id: 'chief-of-staff',
      name: 'Chief of Staff',
      dept: 'Executive / Operasi',
      role: 'Orchestrator Ruang Kerja',
      task: 'Merangkum status antrean peluang, memonitor kepatuhan ritme automasi, dan mengarahkan fokus peran virtual.',
      boundary: 'Akses baca data lokal workspace; hanya membuat usulan tugas internal tanpa aksi eksternal.',
      metric: `${dashboard.data.counts.openProjects} peluang aktif dalam pantauan`,
      status: isPaused ? 'paused' : isDraft ? 'draft' : 'active',
    },
    {
      id: 'market-scout',
      name: 'Market Scout',
      dept: 'Sales & Bids',
      role: 'Pencari & Penilai Pasar',
      task: 'Menyaring peluang proyek dari provider Freelancer resmi dan menghitung skor kecocokan berdasarkan profil keahlian.',
      boundary: 'Hanya membaca proyek tersinkron resmi; tidak melakukan scraping mandiri atau bypass rate limit.',
      metric: `${dashboard.data.counts.openProjects} peluang telah dipindai & dinilai`,
      status: isPaused ? 'paused' : isDraft ? 'draft' : 'active',
    },
    {
      id: 'bid-strategist',
      name: 'Bid Strategist',
      dept: 'Sales & Bids',
      role: 'Perumus Proposal & Harga',
      task: 'Menyusun draf proposal dengan Hermes AI berbasis fakta portofolio terverifikasi, merekomendasikan harga dan durasi.',
      boundary: 'Menghasilkan draf terstruktur; setiap eksekusi wajib lolos persetujuan deterministik policy engine.',
      metric: `${dashboard.data.counts.drafts} draf proposal lokal disiapkan`,
      status: isPaused ? 'paused' : capabilities.data.hermes.active ? 'active' : 'draft',
    },
    {
      id: 'profile-editor',
      name: 'Profile Editor',
      dept: 'Profile Studio',
      role: 'Kurator Profil & Bukti',
      task: 'Memelihara fakta profil, ringkasan spesialisasi, dan mengusulkan pembaruan berbasis bukti nyata repositori/portofolio.',
      boundary: 'Hanya menghasilkan diff berversi; tanpa modifikasi langsung pada akun platform eksternal.',
      metric: `${profile.data.facts.length} fakta terverifikasi tersimpan`,
      status: isPaused ? 'paused' : isDraft ? 'draft' : 'active',
    },
    {
      id: 'client-relations',
      name: 'Client Relations',
      dept: 'Client Relations',
      role: 'Manajer Komunikasi Klien',
      task: 'Membaca thread pesan dari adapter resmi, mengidentifikasi pertanyaan kunci, dan menyiapkan draf balasan rutin.',
      boundary: 'Draf rutin informatif saja; dilarang menyepakati kontrak legal, milestone, atau komitmen finansial.',
      metric: '0 thread aktif (menunggu aturan respons otomatis)',
      status: isPaused ? 'paused' : 'draft',
    },
    {
      id: 'operations-analyst',
      name: 'Operations Analyst',
      dept: 'Operations',
      role: 'Analis Pipeline & Jadwal',
      task: 'Mengawasi pergerakan siklus proyek di papan tugas, memantau tenggat waktu, dan memastikan integritas status.',
      boundary: 'Aksi internal yang dapat dibatalkan; tidak memanggil API tulis platform eksternal.',
      metric: `Policy versi ${dashboard.data.policy.version} aktif`,
      status: isPaused ? 'paused' : isDraft ? 'draft' : 'active',
    },
    {
      id: 'knowledge-curator',
      name: 'Knowledge Curator',
      dept: 'Knowledge Hub',
      role: 'Kurator Pengetahuan & Kode',
      task: 'Menyinkronkan repositori GitHub dan catatan lokal ke SQLite FTS5 untuk dijadikan bukti klaim proposal.',
      boundary: 'Read-only lokal; memindai & mengecualikan token/kredensial sebelum pengindeksan.',
      metric: `${dashboard.data.counts.knowledgeSources} sumber pengetahuan diindeks`,
      status: isPaused ? 'paused' : 'active',
    },
    {
      id: 'compliance-auditor',
      name: 'Compliance Auditor',
      dept: 'Compliance & Audit',
      role: 'Auditor Kebijakan & Keamanan',
      task: 'Memverifikasi setiap draf terhadap batas harga, kata kunci dilarang, dan ketersediaan bukti sumber.',
      boundary: 'Read-only deterministik; otomatis memblokir draf tanpa bukti sumber yang sah.',
      metric: `${dashboard.data.counts.policySkips} keputusan skip tercatat di audit`,
      status: isPaused ? 'paused' : 'active',
    },
    {
      id: 'qa-engineer',
      name: 'QA Engineer',
      dept: 'Quality Assurance',
      role: 'Verifikator Kontrak & Smoke',
      task: 'Menjalankan skenario smoke test, validasi skema DTO, serta memverifikasi alur simulasi fail-closed.',
      boundary: 'Beroperasi di lingkungan lokal & sandbox; tanpa kredensial live produksi.',
      metric: `${dashboard.data.activity.length} jejak audit tervalidasi`,
      status: 'active',
    },
  ];

  return <>
    <PageIntro
      eyebrow="Organisasi virtual"
      title="Sembilan peran spesialis, satu kendali pemilik."
      description="Setiap karyawan AI memiliki batas akses yang terisolasi dan bekerja di bawah kebijakan hands-off yang telah Anda setujui."
    />
    <div className="agent-grid">
      {agents.map((agent) => (
        <article className="agent-card" key={agent.id}>
          <div>
            <div className="agent-card-header">
              <div>
                <span className="agent-dept">{agent.dept}</span>
                <h3>{agent.name}</h3>
                <small style={{ color: 'var(--muted)', display: 'block', marginTop: 2 }}>{agent.role}</small>
              </div>
              <StateLabel state={agent.status} />
            </div>
            <p className="agent-task">{agent.task}</p>
            <div className="agent-boundary">
              <strong>Batas akses:</strong> {agent.boundary}
            </div>
          </div>
          <div className="agent-foot">
            <span>{agent.metric}</span>
          </div>
        </article>
      ))}
    </div>
  </>;
}

function TaskBoardPage() {
  const [filter, setFilter] = useState('');
  const pipeline = useQuery({ queryKey: ['pipeline'], queryFn: () => api<Array<Opportunity & { latestDraft: BidDraft | null }>>('/pipeline') });

  if (pipeline.isPending) return <LoadingPanel label="Memuat papan tugas..." />;
  if (pipeline.isError) return <ErrorNotice message="Gagal memuat data papan tugas." onRetry={() => pipeline.refetch()} />;

  const projects = pipeline.data.filter((p) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q) || p.skills.some((s) => s.toLowerCase().includes(q));
  });

  const columns = [
    {
      id: 'queue',
      title: 'Antrean Peluang',
      filter: (p: Opportunity) => p.pipelineStatus === 'new' || p.pipelineStatus === 'scored',
      hint: 'Peluang baru tersinkron siap dinilai atau dibuatkan draf',
    },
    {
      id: 'drafting',
      title: 'Draf & Review',
      filter: (p: Opportunity) => p.pipelineStatus === 'draft_ready' || p.pipelineStatus === 'policy_check',
      hint: 'Draf lokal yang siap diperiksa atau disimulasikan',
    },
    {
      id: 'active',
      title: 'Terkirim & Diskusi',
      filter: (p: Opportunity) => p.pipelineStatus === 'submitted' || p.pipelineStatus === 'in_conversation' || p.pipelineStatus === 'won',
      hint: 'Bid terkirim atau dalam tahap komunikasi dengan klien',
    },
    {
      id: 'archived',
      title: 'Selesai / Dilewati',
      filter: (p: Opportunity) => p.pipelineStatus === 'skipped' || p.pipelineStatus === 'lost' || p.pipelineStatus === 'expired' || p.pipelineStatus === 'reconciliation_required' || p.pipelineStatus === 'error',
      hint: 'Peluang di luar batas kebijakan atau telah diarsipkan',
    },
  ];

  return <>
    <PageIntro
      eyebrow="Manajemen kerja"
      title="Papan tugas seluruh siklus proyek."
      description="Pantau alur kerja dari deteksi peluang, penyusunan draf, simulasi kebijakan, hingga status akhir."
    />
    <section className="filter-bar" aria-label="Filter papan tugas">
      <label className="search-field">
        <span>Cari proyek, klien, atau skill di papan tugas</span>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Contoh: React, Backend, API" />
      </label>
      <div className="filter-note">
        <strong>{projects.length}</strong> kartu ditampilkan
      </div>
    </section>

    <div className="kanban-board">
      {columns.map((col) => {
        const colProjects = projects.filter(col.filter);
        return (
          <div className="kanban-column" key={col.id}>
            <div className="kanban-col-head">
              <h3>{col.title}</h3>
              <span className="kanban-count">{colProjects.length}</span>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>{col.hint}</p>
            {colProjects.length === 0 ? (
              <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                Tidak ada kartu
              </div>
            ) : (
              colProjects.map((p) => (
                <article className="kanban-card" key={p.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                    <span className="kanban-card-client">{p.clientName}</span>
                    <StateLabel state={p.pipelineStatus} />
                  </div>
                  <h4>{p.title}</h4>
                  <div className="tag-row" style={{ marginTop: 2 }}>
                    {p.skills.slice(0, 3).map((s) => (
                      <span className="skill-tag" key={s}>{s}</span>
                    ))}
                  </div>
                  <div className="kanban-card-foot">
                    <span className="kanban-card-budget">{formatMoney(p.budgetMin, p.currency)} - {formatMoney(p.budgetMax, p.currency)}</span>
                    <span className="kanban-card-score">Skor: {p.score}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                    <Link
                      to={`/opportunities?project=${encodeURIComponent(p.id)}`}
                      className="button button-secondary"
                      style={{ minHeight: 30, padding: '4px 8px', fontSize: 11 }}
                    >
                      {p.latestDraft ? 'Buka draf' : 'Buat draf'}
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
        );
      })}
    </div>
  </>;
}

function CalendarPage() {
  const policyQuery = useQuery({ queryKey: ['policy'], queryFn: () => api<Policy>('/policy') });
  const projectsQuery = useQuery({ queryKey: ['projects', 'calendar'], queryFn: () => api<Opportunity[]>('/projects') });
  const dashboardQuery = useQuery({ queryKey: ['dashboard'], queryFn: () => api<{ counts: { openProjects: number; drafts: number; policySkips: number } }>('/dashboard') });

  if (policyQuery.isPending || projectsQuery.isPending || dashboardQuery.isPending) return <LoadingPanel label="Menyiapkan kalender dan jadwal operasi..." />;
  if (policyQuery.isError || projectsQuery.isError || dashboardQuery.isError) return <ErrorNotice message="Gagal memuat data kalender." />;

  const policy = policyQuery.data;
  const projects = projectsQuery.data;
  const dashboard = dashboardQuery.data;

  const now = new Date();
  const currentHour = now.getHours();
  const isWithinHours = currentHour >= policy.activeHours.start && currentHour < policy.activeHours.end;
  const deadlineProjects = projects.filter((p) => p.deadlineDays !== null).sort((a, b) => (a.deadlineDays ?? 0) - (b.deadlineDays ?? 0));
  const expiryDate = new Date(policy.expiresAt);
  const daysUntilExpiry = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return <>
    <PageIntro
      eyebrow="Jadwal & Waktu"
      title="Kalender kerja dan batas waktu automasi."
      description="Pantau jam aktif automasi, batas frekuensi penawaran harian dan mingguan, serta tenggat waktu proyek."
    />

    <div className="calendar-grid">
      <section className="calendar-card">
        <h3>Jam Kerja & Status Operasi</h3>
        <div className={`hours-status-badge ${isWithinHours && policy.state === 'active' ? 'hours-active' : 'hours-inactive'}`}>
          <span className="mode-indicator" style={{ background: isWithinHours && policy.state === 'active' ? 'var(--success)' : 'var(--danger)' }} />
          {policy.state === 'paused'
            ? 'Kebijakan Dijeda (Kill Switch Aktif)'
            : isWithinHours
            ? `Dalam Jam Operasi Aktif (${policy.activeHours.start}:00 - ${policy.activeHours.end}:00)`
            : `Di Luar Jam Operasi (${policy.activeHours.start}:00 - ${policy.activeHours.end}:00)`}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 14px' }}>
          Zona waktu kerja: <strong>{policy.timezone}</strong>. Tindakan automasi mematuhi rentang jam ini untuk membatasi aktivitas pada jam operasional pemilik.
        </p>

        <div className="meter-row">
          <div className="meter-label">
            <span>Batas Penawaran Harian</span>
            <strong>{dashboard.counts.drafts} / {policy.dailyBidLimit}</strong>
          </div>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${Math.min(100, Math.round((dashboard.counts.drafts / (policy.dailyBidLimit || 1)) * 100))}%` }} />
          </div>
        </div>

        <div className="meter-row">
          <div className="meter-label">
            <span>Batas Penawaran Mingguan</span>
            <strong>{dashboard.counts.drafts} / {policy.weeklyBidLimit}</strong>
          </div>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${Math.min(100, Math.round((dashboard.counts.drafts / (policy.weeklyBidLimit || 1)) * 100))}%` }} />
          </div>
        </div>
      </section>

      <section className="calendar-card">
        <h3>Masa Berlaku Kebijakan</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>
          Kebijakan automasi berlaku terbatas dan membutuhkan konfirmasi berkala untuk memastikan kontrol tetap di tangan pemilik.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: 12, background: 'var(--surface-muted)', borderRadius: 3, marginBottom: 14 }}>
          <div>
            <span style={{ fontSize: 10, color: 'var(--muted)', display: 'block' }}>KEDALUWARSA PADA</span>
            <strong>{formatDate(policy.expiresAt)}</strong>
          </div>
          <div>
            <span style={{ fontSize: 10, color: 'var(--muted)', display: 'block' }}>SISA WAKTU</span>
            <strong style={{ color: daysUntilExpiry <= 3 ? 'var(--danger)' : 'var(--success)' }}>{daysUntilExpiry} hari lagi</strong>
          </div>
        </div>
        <Link to="/policy" className="button button-secondary" style={{ width: '100%' }}>
          Kelola Batas & Perpanjang Kebijakan
        </Link>
      </section>

      <section className="calendar-card" style={{ gridColumn: '1 / -1' }}>
        <h3>Tenggat Waktu Proyek ({deadlineProjects.length})</h3>
        {deadlineProjects.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>Belum ada proyek dengan tenggat tercatat.</p>
        ) : (
          <ul className="deadlines-list">
            {deadlineProjects.map((p) => (
              <li className="deadline-item" key={p.id}>
                <div>
                  <Link to={`/opportunities?project=${encodeURIComponent(p.id)}`} style={{ fontWeight: 600, textDecoration: 'none' }}>
                    {p.title}
                  </Link>
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                    Klien: {p.clientName} · {formatMoney(p.budgetMin, p.currency)} - {formatMoney(p.budgetMax, p.currency)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong style={{ color: (p.deadlineDays ?? 0) <= 3 ? 'var(--danger)' : 'var(--pine)' }}>
                    {p.deadlineDays} hari
                  </strong>
                  <div style={{ color: 'var(--muted)', fontSize: 10 }}>Estimasi sisa waktu</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  </>;
}

function ProfilePage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/profile') });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [newFact, setNewFact] = useState({ label: '', value: '', source: '' });
  const [notice, setNotice] = useState('');
  useEffect(() => { if (profileQuery.data && !profile) setProfile(profileQuery.data); }, [profileQuery.data]);
  const save = useMutation({
    mutationFn: (value: Profile) => api<{ profile: Profile; policy: Policy }>('/profile', jsonRequest('PUT', value)),
    onSuccess: (result: { profile: Profile; policy: Policy }) => { setProfile(result.profile); setNotice(result.policy.state === 'draft' ? 'Profil tersimpan. Aktivasi kebijakan berikutnya memerlukan konfirmasi satu kali.' : 'Profil tersimpan. Kebijakan perlu diaktifkan ulang.'); queryClient.invalidateQueries({ queryKey: ['profile'] }); queryClient.invalidateQueries({ queryKey: ['policy'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (error: Error) => setNotice(error.message),
  });
  if (profileQuery.isPending || !profile) return <LoadingPanel label="Membuka profil layanan..." />;
  if (profileQuery.isError) return <ErrorNotice message="Profil belum dapat dimuat." onRetry={() => profileQuery.refetch()} />;

  function toggleSpecialty(value: string) {
    setProfile((current) => current ? { ...current, specializations: current.specializations.includes(value) ? current.specializations.filter((item) => item !== value) : [...current.specializations, value] } : current);
  }
  function addFact(event: FormEvent) {
    event.preventDefault();
    if (!profile || !newFact.label.trim() || !newFact.value.trim() || !newFact.source.trim()) return;
    setProfile({ ...profile, facts: [...profile.facts, { label: newFact.label.trim(), value: newFact.value.trim(), source: newFact.source.trim() }] });
    setNewFact({ label: '', value: '', source: '' });
  }

  return <>
    <PageIntro eyebrow="Studio profil" title="Simpan fakta sebelum menulis klaim." description="Bidang, spesialisasi, tarif, bahasa, dan bukti yang Anda masukkan menjadi sumber profil. Data kosong tidak dilengkapi dengan asumsi." />
    {notice && <div className="notice notice-success" role="status">{notice}</div>}
    <form className="form-section" onSubmit={(event) => { event.preventDefault(); if (profile) save.mutate(profile); }}>
      <section className="form-card"><div className="section-heading"><div><p className="eyebrow">Arah layanan</p><h2>Bidang utama dan spesialisasi</h2></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Bidang utama</span><select value={profile.primaryField} onChange={(event) => setProfile({ ...profile, primaryField: event.target.value })}><option value="">Pilih bidang utama</option>{fields.map((field) => <option key={field}>{field}</option>)}</select></label>
          <label className="form-field"><span>Bahasa kerja</span><select value={profile.language} onChange={(event) => setProfile({ ...profile, language: event.target.value })}><option value="id">Bahasa Indonesia</option><option value="en">English</option><option value="id-en">Indonesia dan English</option></select></label>
        </div>
        <fieldset className="specialty-fieldset"><legend>Spesialisasi aktif</legend><div className="specialty-grid">{fields.map((field) => <label key={field} className="check-row"><input type="checkbox" checked={profile.specializations.includes(field)} onChange={() => toggleSpecialty(field)} /><span>{field}</span></label>)}</div></fieldset>
      </section>
      <section className="form-card"><div className="section-heading"><div><p className="eyebrow">Batas layanan</p><h2>Tarif dan konteks kerja</h2></div></div>
        <div className="form-grid form-grid-three">
          <label className="form-field"><span>Mata uang</span><select value={profile.currency} onChange={(event) => setProfile({ ...profile, currency: event.target.value })}><option value="USD">USD</option><option value="IDR">IDR</option><option value="EUR">EUR</option><option value="SGD">SGD</option></select></label>
          <label className="form-field"><span>Tarif minimum</span><input type="number" min="0" value={profile.minPrice} onChange={(event) => setProfile({ ...profile, minPrice: Number(event.target.value) })} /></label>
          <label className="form-field"><span>Tarif maksimum</span><input type="number" min="0" value={profile.maxPrice} onChange={(event) => setProfile({ ...profile, maxPrice: Number(event.target.value) })} /></label>
          <label className="form-field"><span>Zona waktu</span><input value={profile.timezone} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })} /></label>
        </div>
      </section>
      <section className="form-card"><div className="section-heading"><div><p className="eyebrow">Evidence-first</p><h2>Fakta yang boleh dipakai</h2></div></div>
        <p className="form-help">Gunakan klaim yang dapat dibuktikan, lalu isi sumbernya dengan repositori, URL, atau catatan milik Anda. Isi ini tidak dikirim sampai Anda memakai provider drafting.</p>
        {profile.facts.length > 0 ? <ul className="fact-list">{profile.facts.map((fact, index) => <li key={`${fact.label}-${index}`}><div><strong>{fact.label}</strong><p>{fact.value}</p><small>{fact.source}</small></div><button className="button button-text" type="button" onClick={() => setProfile({ ...profile, facts: profile.facts.filter((_, factIndex) => factIndex !== index) })}>Hapus fakta</button></li>)}</ul> : <div className="empty-inline">Belum ada fakta profil yang disimpan.</div>}
        <div className="fact-entry"><label className="form-field"><span>Nama fakta</span><input value={newFact.label} onChange={(event) => setNewFact({ ...newFact, label: event.target.value })} placeholder="Contoh: Sistem inventori" /></label><label className="form-field"><span>Nilai atau hasil</span><input value={newFact.value} onChange={(event) => setNewFact({ ...newFact, value: event.target.value })} placeholder="Isi hanya yang benar" /></label><label className="form-field"><span>Sumber bukti</span><input value={newFact.source} onChange={(event) => setNewFact({ ...newFact, source: event.target.value })} placeholder="URL, repositori, atau catatan" /></label><button type="button" className="button button-secondary" onClick={addFact}>Tambah fakta</button></div>
      </section>
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={save.isPending}>{save.isPending ? 'Menyimpan...' : 'Simpan profil'}</button><span>Perubahan profil mengembalikan kebijakan aktif ke draf.</span></div>
    </form>
  </>;
}

function PolicyPage() {
  const queryClient = useQueryClient();
  const policyQuery = useQuery({ queryKey: ['policy'], queryFn: () => api<Policy>('/policy') });
  const autopilotQuery = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 30_000 });
  const control = useMutation({
    mutationFn: (action: 'pause' | 'resume') => api<Policy>('/policy/' + action, jsonRequest('POST')),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['policy'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['autopilot'] }),
      ]);
    },
  });
  if (policyQuery.isPending) return <LoadingPanel label="Membaca kebijakan autopilot..." />;
  if (policyQuery.isError) return <ErrorNotice message="Kebijakan belum dapat dimuat." onRetry={() => policyQuery.refetch()} />;
  const policy = policyQuery.data;
  const autopilot = autopilotQuery.data;
  return <>
    <PageIntro eyebrow="Policy engine" title="Aturan otomatis dari profil yang tersambung." description="Autopilot memakai batas lokal secara otomatis. Tidak perlu mengisi form untuk menilai atau mengirim setiap peluang." action={<StateLabel state={policy.state} />} />
    {control.isError && <ErrorNotice message={(control.error as Error).message} />}
    <div className="policy-summary-grid">
      <section className="form-card">
        <div className="section-heading"><div><p className="eyebrow">Operasi berjalan</p><h2>{autopilot?.lastMessage ?? 'Autopilot sedang menyiapkan akun.'}</h2></div><StateLabel state={autopilot?.state ?? 'starting'} /></div>
        <div className="policy-facts">
          <div><span>Spesialisasi</span><strong>{policy.specializations.join(', ') || 'Menunggu profil Freelancer'}</strong></div>
          <div><span>Rentang penawaran</span><strong>{formatMoney(policy.minPrice, 'USD')}?{formatMoney(policy.maxPrice, 'USD')}</strong></div>
          <div><span>Batas harian / mingguan</span><strong>{policy.dailyBidLimit} / {policy.weeklyBidLimit}</strong></div>
          <div><span>Confidence minimum</span><strong>{Math.round(policy.minimumConfidence * 100)}%</strong></div>
          <div><span>Jam operasi</span><strong>{policy.activeHours.start}:00?{policy.activeHours.end}:00 ? {policy.timezone}</strong></div>
          <div><span>Berlaku sampai</span><strong>{formatDate(policy.expiresAt)}</strong></div>
        </div>
        <p className="form-help">Kebijakan melewati proyek di luar bidang profil, anggaran USD, batas risiko, confidence, jam kerja, dan kuota. Jika deadline klien tidak tersedia, proposal mencantumkan estimasi pengiriman 14 hari dan meminta konfirmasi tenggat sebelum mulai. Hanya proyek fixed price yang diproses otomatis.</p>
        <div className="form-actions">
          {policy.state === 'paused'
            ? <button className="button button-primary" type="button" disabled={control.isPending || policy.simulationOnly} onClick={() => control.mutate('resume')}>{control.isPending ? 'Melanjutkan?' : 'Lanjutkan autopilot'}</button>
            : <button className="button button-secondary" type="button" disabled={control.isPending || policy.state !== 'active'} onClick={() => control.mutate('pause')}>{control.isPending ? 'Menjeda?' : 'Jeda darurat'}</button>}
          <span>{policy.simulationOnly ? 'Mode live belum aktif.' : 'Bid live berjalan sesuai kebijakan tersimpan.'}</span>
        </div>
      </section>
    </div>
  </>;
}

function KnowledgePage() {
  const queryClient = useQueryClient();
  const knowledge = useQuery({ queryKey: ['knowledge'], queryFn: () => api<{ sources: Array<{ id: string; provider: string; label: string; referenceUrl: string; updatedAt: string; chunkCount: number }>; coverage: { sources: number; chunks: number } }>('/knowledge') });
  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: () => api<{ github: { tokenConfigured: boolean } }>('/capabilities') });
  const [provider, setProvider] = useState<'manual' | 'linkedin'>('manual');
  const [label, setLabel] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [sourceRef, setSourceRef] = useState('user-import');
  const [files, setFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [repo, setRepo] = useState('');
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<Array<{ label: string; path: string; url: string; content: string }>>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const next = await Promise.all(selected.map(async (file) => ({ path: file.name, content: await file.text() })));
    setFiles(next);
    if (selected.length) setLabel((current) => current || selected.length === 1 ? (current || selected[0]?.name.replace(/\.[^.]+$/, '') || '') : `${selected.length} berkas pilihan`);
  };
  const runImport = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const result = await api<{ chunks: number; rejected: Array<{ path: string; reason: string }> }>('/knowledge/import', jsonRequest('POST', { provider, label, referenceUrl, sourceRef, files }));
      setNotice(`${result.chunks} potongan aman ditambahkan. ${result.rejected.length} berkas dikecualikan.`); setFiles([]); setLabel('');
      queryClient.invalidateQueries({ queryKey: ['knowledge'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['activity'] });
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Impor gagal.'); }
    finally { setBusy(false); }
  };
  const syncGitHub = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice('Membaca repositori terpilih...');
    try {
      const result = await api<{ chunks: number; filesSeen: number; rejected: number; complete: boolean }>('/knowledge/github/sync', jsonRequest('POST', { repository: repo }));
      setNotice(`${result.filesSeen} berkas dibaca, ${result.chunks} potongan aman diindeks, ${result.rejected} dilewati.${result.complete ? '' : ' Cakupan parsial, periksa batas file.'}`);
      queryClient.invalidateQueries({ queryKey: ['knowledge'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['capabilities'] });
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Sinkronisasi gagal.'); }
    finally { setBusy(false); }
  };
  const search = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { setResults(await api('/knowledge/search', jsonRequest('POST', { query: queryText, limit: 6 }))); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Pencarian gagal.'); }
    finally { setBusy(false); }
  };
  const removeSource = async (id: string) => {
    if (!window.confirm('Hapus sumber dan semua potongan indeks terkait?')) return;
    try { await api(`/knowledge/sources/${encodeURIComponent(id)}`, { method: 'DELETE' }); setNotice('Sumber dan indeks terkait dihapus.'); queryClient.invalidateQueries({ queryKey: ['knowledge'] }); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Sumber tidak dapat dihapus.'); }
  };

  if (knowledge.isPending) return <LoadingPanel label="Membuka knowledge hub lokal..." />;
  if (knowledge.isError) return <ErrorNotice message="Status knowledge hub belum dapat dimuat." onRetry={() => knowledge.refetch()} />;
  return <>
    <PageIntro eyebrow="Knowledge Hub" title="Bawa bukti kerja, bukan seluruh repositori ke setiap draf." description="Pilih sumber yang Anda izinkan. Teks diperiksa sebelum masuk indeks lokal dan setiap hasil menyimpan path serta provenance." />
    {notice && <div className="notice notice-success" role="status">{notice}</div>}
    <section className="knowledge-summary"><div><p className="eyebrow">Cakupan saat ini</p><strong>{knowledge.data.coverage.sources} sumber / {knowledge.data.coverage.chunks} potongan</strong><span>SQLite FTS5 / freshness tercatat per sumber</span></div><div className="provider-boundaries"><span>GitHub: baca saja</span><span>LinkedIn: impor milik pengguna</span></div></section>
    <div className="knowledge-grid">
      <section className="form-card"><div className="section-heading"><div><p className="eyebrow">Pilih cakupan</p><h2>Impor berkas teks</h2></div></div>
        <form className="stack-form" onSubmit={runImport}>
          <label className="form-field"><span>Asal berkas</span><select value={provider} onChange={(event) => setProvider(event.target.value as 'manual' | 'linkedin')}><option value="manual">Catatan milik saya</option><option value="linkedin">Ekspor LinkedIn milik saya</option></select></label>
          <label className="form-field"><span>Nama sumber</span><input value={label} required onChange={(event) => setLabel(event.target.value)} placeholder="Misalnya, profil dan portofolio" /></label>
          <label className="form-field"><span>URL sumber, bila tersedia</span><input type="url" value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="https://..." /></label>
          <label className="form-field"><span>Versi atau catatan asal</span><input value={sourceRef} onChange={(event) => setSourceRef(event.target.value)} placeholder="Ekspor Oktober 2026" /></label>
          <label className="form-field file-field"><span>Berkas .md, .txt, .csv, atau .json</span><input type="file" accept=".md,.txt,.csv,.json" multiple onChange={importFiles} /><small>{files.length ? `${files.length} berkas dipilih` : 'Ukuran maksimal 100 KB per berkas. Arsip dan berkas biner tidak diterima.'}</small></label>
          <button className="button button-primary" type="submit" disabled={busy || files.length === 0 || !label.trim()}>{busy ? 'Memproses...' : 'Pindai dan indeks lokal'}</button>
        </form>
      </section>
      <section className="form-card"><div className="section-heading"><div><p className="eyebrow">Read-only API</p><h2>Sinkronkan repositori GitHub</h2></div></div>
        <p className="form-help">Pilih satu repositori. Aplikasi memakai Contents: read dan tidak mengubah isi. Token privat, bila dipakai, dibaca server dari konfigurasi dan tidak dikirim ke browser.</p>
        <form className="stack-form" onSubmit={syncGitHub}><label className="form-field"><span>Repositori pemilik/nama</span><input value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="pemilik/nama-repositori" required /></label><div className="provider-status">Token server: {capabilities.data?.github.tokenConfigured ? 'tersedia' : 'tidak diatur, hanya repositori publik'}</div><button className="button button-secondary" type="submit" disabled={busy || repo.trim().length < 3}>Baca repositori pilihan</button></form>
        <div className="provider-limit"><strong>LinkedIn API belum disetujui.</strong><p>Gunakan ekspor atau fakta milik Anda. Tidak ada scraping atau akses ke profil orang lain.</p></div>
      </section>
    </div>
    <section className="form-card source-section"><div className="section-heading"><div><p className="eyebrow">Provenance dan freshness</p><h2>Sumber terindeks</h2></div></div>
      {knowledge.data.sources.length === 0 ? <div className="empty-state"><h3>Knowledge hub masih kosong</h3><p>Impor catatan teks atau pilih repositori agar draf dapat menyebutkan bukti yang bisa ditelusuri.</p></div> : <div className="source-list">{knowledge.data.sources.map((source) => <article key={source.id} className="source-row"><div><span className="source-provider">{source.provider}</span><h3>{source.label}</h3><p>{source.chunkCount} potongan / diperbarui {formatDate(source.updatedAt)}</p>{source.referenceUrl && source.referenceUrl.startsWith('https://') && <a href={source.referenceUrl} target="_blank" rel="noreferrer">Buka sumber</a>}</div><button className="button button-text" type="button" onClick={() => removeSource(source.id)}>Hapus sumber</button></article>)}</div>}
    </section>
    <section className="form-card search-section"><div className="section-heading"><div><p className="eyebrow">Retrieval lokal</p><h2>Temukan bukti yang relevan</h2></div></div><form className="search-inline" onSubmit={search}><label className="form-field"><span>Kata atau frasa</span><input value={queryText} onChange={(event) => setQueryText(event.target.value)} minLength={2} placeholder="Misalnya: cursor pagination" /></label><button type="submit" className="button button-primary" disabled={busy || queryText.trim().length < 2}>Cari di knowledge hub</button></form>
      {results.length > 0 ? <div className="search-results">{results.map((result, index) => <article key={`${result.path}-${index}`}><div><strong>{result.label} / {result.path}</strong>{result.url.startsWith('https://') ? <a href={result.url} target="_blank" rel="noreferrer">Lihat provenance</a> : <span className="local-reference">Sumber lokal</span>}</div><p>{result.content}</p></article>)}</div> : <p className="form-help">Hasil pencarian menampilkan potongan teks dan sumbernya, bukan seluruh dokumen.</p>}
    </section>
  </>;
}

function ActivityPage() {
  const [filter, setFilter] = useState<'all' | 'allowed' | 'blocked' | 'recorded' | 'failed'>('all');
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['activity'], queryFn: () => api<AuditEvent[]>('/activity?limit=100') });
  if (query.isPending) return <LoadingPanel label="Membaca jejak aktivitas..." />;
  if (query.isError) return <ErrorNotice message="Log aktivitas belum dapat dimuat." onRetry={() => query.refetch()} />;

  const filteredEvents = query.data.filter((e) => {
    if (filter !== 'all' && e.status !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return e.type.toLowerCase().includes(q) || e.reason.toLowerCase().includes(q) || e.resourceId.toLowerCase().includes(q);
  });

  return <>
    <PageIntro eyebrow="Audit log" title="Setiap keputusan meninggalkan jejak yang dapat dibaca." description="Log menyimpan waktu, versi policy, alasan allow/skip, serta hash payload. Kredensial rahasia dan token tidak dicatat." />
    <div className="filter-tabs" role="tablist" aria-label="Filter status audit">
      <button type="button" className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Semua ({query.data.length})</button>
      <button type="button" className={`filter-tab ${filter === 'allowed' ? 'active' : ''}`} onClick={() => setFilter('allowed')}>Diizinkan ({query.data.filter((e) => e.status === 'allowed').length})</button>
      <button type="button" className={`filter-tab ${filter === 'blocked' ? 'active' : ''}`} onClick={() => setFilter('blocked')}>Dilewati ({query.data.filter((e) => e.status === 'blocked').length})</button>
      <button type="button" className={`filter-tab ${filter === 'recorded' ? 'active' : ''}`} onClick={() => setFilter('recorded')}>Tercatat ({query.data.filter((e) => e.status === 'recorded').length})</button>
      <button type="button" className={`filter-tab ${filter === 'failed' ? 'active' : ''}`} onClick={() => setFilter('failed')}>Gagal ({query.data.filter((e) => e.status === 'failed').length})</button>
    </div>
    <div style={{ marginBottom: 16 }}>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cari jejak aktivitas berdasarkan alasan, tipe, atau resource ID..."
        style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}
      />
    </div>
    <section className="activity-section">
      <ActivityRows events={filteredEvents} />
    </section>
  </>;
}

function CapabilitiesPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState(() => {
    const oauthResult = new URLSearchParams(window.location.search).get('linkedin');
    return oauthResult === 'connected'
      ? 'LinkedIn terhubung. Profil ringan berhasil diverifikasi.'
      : oauthResult === 'error' ? 'LinkedIn belum terhubung. Periksa konfigurasi aplikasi dan coba lagi.' : '';
  });
  const [noticeError, setNoticeError] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('linkedin')) {
      url.searchParams.delete('linkedin');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }, []);
  const query = useQuery({ queryKey: ['capabilities'], queryFn: () => api<Capabilities>('/capabilities') });
  const autopilot = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 30_000 });
  const verifyFreelancer = useMutation({
    mutationFn: () => api<{ message: string }>('/freelancer/verify', jsonRequest('POST')),
    onSuccess: async (result) => { setNoticeError(false); setNotice(result.message); await queryClient.invalidateQueries({ queryKey: ['capabilities'] }); },
    onError: (error: Error) => { setNoticeError(true); setNotice(error.message); },
  });
  const connectLinkedIn = useMutation({
    mutationFn: () => api<{ authorizationUrl: string }>('/linkedin/connect', jsonRequest('POST')),
    onSuccess: (result) => {
      const destination = new URL(result.authorizationUrl);
      if (destination.origin !== 'https://www.linkedin.com') {
        setNotice('Alamat otorisasi LinkedIn ditolak karena bukan domain resmi.');
        return;
      }
      window.location.assign(destination.toString());
    },
    onError: (error: Error) => setNotice(error.message),
  });
  const disconnectLinkedIn = useMutation({
    mutationFn: () => api<{ disconnected: boolean }>('/linkedin/disconnect', jsonRequest('POST')),
    onSuccess: async () => { setNotice('Token LinkedIn dihapus dari perangkat ini. Cabut izin aplikasi dari pengaturan LinkedIn bila akses juga perlu dicabut di sana.'); await queryClient.invalidateQueries({ queryKey: ['capabilities'] }); },
    onError: (error: Error) => setNotice(error.message),
  });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError) return <ErrorNotice message="Status integrasi belum dapat dimuat." onRetry={() => query.refetch()} />;
  const status = autopilot.data;
  return <>
    <PageIntro eyebrow="Koneksi dan capability" title="Autopilot bekerja dari profil Freelancer." description="Proyek dipindai otomatis. Bid hanya dikirim saat aturan profil, anggaran, tenggat, risiko, confidence, kuota, dan jam aktif terpenuhi." />
    {notice && <div className={'notice ' + (noticeError ? 'notice-error' : 'notice-success')} role={noticeError ? 'alert' : 'status'}>{notice}</div>}
    <section className="form-card autopilot-card">
      <div className="section-heading"><div><p className="eyebrow">Freelancer Auto-Pilot</p><h2>Siklus operasi</h2></div><StateLabel state={status?.state ?? 'starting'} /></div>
      <p className="form-help">{status?.lastMessage ?? 'Menghubungkan autopilot ke profil Freelancer...'}</p>
      {status?.specializations.length ? <div className="tag-row">{status.specializations.map((item) => <span className="skill-tag" key={item}>{item}</span>)}</div> : null}
      <div className="autopilot-metrics"><span>{status?.lastImported ?? 0} proyek terakhir dipindai</span><span>{status?.lastSubmitted ?? 0} bid terkirim pada siklus terakhir</span><span>{status?.nextRunAt ? 'Pindai lagi ' + formatDate(status.nextRunAt) : 'Jadwal berikutnya belum tersedia'}</span></div>
      <p className="provider-limit">Autopilot mengirim bid pada proyek fixed price USD yang cocok dengan keahlian di ringkasan profil publik. Batas lokal tetap berlaku: USD 100?800, maksimal 4 bid per hari dan 12 per minggu, risiko, tenggat, confidence, serta jam kerja. Endpoint edit profil dan pesan siap dipakai lewat event yang relevan; agen tidak mengubah profil atau mengirim pesan tanpa perubahan dan percakapan yang menjadi konteksnya.</p>
    </section>
    <div className="capability-grid">
      <section className="form-card">
        <div className="section-heading"><div><p className="eyebrow">Freelancer.com</p><h2>Capability marketplace</h2></div><StateLabel state={query.data.freelancerCredentials.verificationStatus} /></div>
        {query.data.marketplace.map((item) => <div className="capability-row" key={item.operation}><div><strong>{item.operation.replaceAll('_', ' ')}</strong><p>{item.evidence}</p></div><div className="capability-status">{item.sandboxVerification ? <span title={'Diperiksa ' + formatDate(item.sandboxVerification.checkedAt)} className={'sandbox-http-status ' + (item.sandboxVerification.statusCode === 200 ? 'sandbox-http-ok' : '')}>{item.sandboxVerification.statusCode === null ? 'Hasil tidak diketahui ? Sandbox' : 'HTTP ' + item.sandboxVerification.statusCode + ' ? Sandbox'}</span> : <StateLabel state={item.status} />}</div></div>)}
        <div className="production-capability-status">
          {query.data.marketplace.filter((item) => ['submit_bid', 'edit_profile', 'send_message'].includes(item.operation)).map((item) => <div key={item.operation}><strong>{item.operation.replaceAll('_', ' ')}</strong><StateLabel state={item.status} /><span>{item.productionVerification ? item.productionVerification.statusCode === null ? 'Hasil tidak diketahui ? Production' : 'HTTP ' + item.productionVerification.statusCode + ' ? Production' : 'Belum ada hasil live production'}</span></div>)}
        </div>
        <p className="provider-limit">Token Freelancer {query.data.freelancerCredentials.accessTokenConfigured ? 'tersimpan pada server lokal dan tidak dikirim ke browser' : 'belum diatur'}. Pemeriksaan baca-saja mencakup profil, proyek, portofolio, dan pesan. Isi pesan dan portofolio tidak disimpan.</p>
        <button type="button" className="button button-secondary" disabled={!query.data.freelancerCredentials.accessTokenConfigured || verifyFreelancer.isPending} onClick={() => verifyFreelancer.mutate()}>{verifyFreelancer.isPending ? 'Memeriksa koneksi?' : 'Periksa akses baca'}</button>
      </section>
      <section className="form-card">
        <div className="section-heading"><div><p className="eyebrow">Sumber lain</p><h2>Knowledge dan drafting</h2></div></div>
        <div className="capability-row"><div><strong>GitHub</strong><p>{query.data.github.scope}; mode read-only. Repositori publik dapat dibaca tanpa token, privat memerlukan token server.</p></div><StateLabel state={query.data.github.verificationStatus} /></div>
        <div className="capability-row"><div><strong>LinkedIn</strong><p>{query.data.linkedin.reason} Kredensial aplikasi {query.data.linkedin.clientConfigured ? 'sudah diatur untuk server ini' : 'belum diatur'}; {query.data.linkedin.authorized ? 'izin anggota tersimpan' : query.data.linkedin.verificationStatus === 'expired' ? 'token sudah kedaluwarsa' : 'consent anggota belum terverifikasi'}{query.data.linkedin.authorized && query.data.linkedin.accessTokenExpiresAt ? '; token berlaku hingga ' + formatDate(query.data.linkedin.accessTokenExpiresAt) : ''}.</p>{query.data.linkedin.redirectUri && <p>URL callback yang harus terdaftar di LinkedIn Developer Portal: <code>{query.data.linkedin.redirectUri}</code></p>}</div><StateLabel state={query.data.linkedin.verificationStatus} /></div>
        {query.data.linkedin.authorized
          ? <button type="button" className="button button-secondary" disabled={disconnectLinkedIn.isPending} onClick={() => disconnectLinkedIn.mutate()}>{disconnectLinkedIn.isPending ? 'Menghapus?' : 'Hapus token LinkedIn lokal'}</button>
          : <button type="button" className="button button-secondary" disabled={!query.data.linkedin.clientConfigured || connectLinkedIn.isPending} onClick={() => connectLinkedIn.mutate()}>{connectLinkedIn.isPending ? 'Menyiapkan OAuth?' : 'Hubungkan LinkedIn'}</button>}
        <div className="capability-row"><div><strong>Hermes Agent</strong><p>{query.data.hermes.reason}</p></div><StateLabel state={query.data.hermes.active ? 'active' : 'draft'} /></div>
      </section>
    </div>
  </>;
}

function OfficePage() {
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => api<{
    counts: { openProjects: number; drafts: number }; policy: { state: string }; profileComplete: boolean; activity: AuditEvent[];
  }>('/dashboard') });
  useEffect(() => {
    try { setWebgl(Boolean(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'))); }
    catch { setWebgl(false); }
  }, []);
  if (query.isPending) return <LoadingPanel label="Memeriksa status tiap ruang..." />;
  if (query.isError) return <ErrorNotice message="Status ruang belum dapat dimuat." onRetry={() => query.refetch()} />;
  const departments = [
    { name: 'Lobby', to: '/', role: 'Chief of staff', note: `${query.data.counts.openProjects} peluang aktif / ringkasan ruang kerja` },
    { name: 'Sales & Bids', to: '/opportunities', role: 'Market scout / bid strategist', note: `${query.data.counts.openProjects} peluang / ${query.data.counts.drafts} draf lokal` },
    { name: 'Profile Studio', to: '/profile', role: 'Profile editor', note: query.data.profileComplete ? 'Bidang dan spesialisasi sudah diisi' : 'Profil layanan belum diatur' },
    { name: 'Client Relations', to: '/pipeline', role: 'Client relations', note: 'Pipeline lokal / pesan menunggu aturan event percakapan' },
    { name: 'Operations', to: '/activity', role: 'Operations analyst / compliance auditor', note: `Policy ${query.data.policy.state} / ${query.data.activity.length} aktivitas terbaru` },
  ];
  return <>
    <PageIntro eyebrow="Ruang virtual" title="Lima departemen, satu alur kerja." description="Pilih ruang untuk membuka pekerjaan 2D. Tampilan tiga dimensi bersifat tambahan dan tidak menjalankan aksi eksternal." action={<div className="toggle-group" role="group" aria-label="Tampilan ruang"><button type="button" aria-pressed={view === '2d'} className={view === '2d' ? 'selected' : ''} onClick={() => setView('2d')}>2D</button><button type="button" aria-pressed={view === '3d'} className={view === '3d' ? 'selected' : ''} onClick={() => setView('3d')}>3D</button></div>} />
    {view === '3d' && webgl === false ? <div className="notice notice-success" role="status">WebGL tidak tersedia. Daftar ruang 2D di bawah tetap menyediakan semua tautan kerja.</div> : null}
    {view === '3d' && webgl ? <Suspense fallback={<LoadingPanel label="Memuat ruang 3D..." />}><ThreeOffice departments={departments} /></Suspense> : null}
    <section className="department-list" aria-label="Daftar departemen">
      {departments.map((department, index) => <Link key={department.name} to={department.to} className="department-row"><span className="department-number">0{index + 1}</span><div><strong>{department.name}</strong><p>{department.note}</p><small>{department.role}</small></div><span className="department-open">Buka ruang</span></Link>)}
    </section>
  </>;
}

function NotFoundPage() {
  return <div className="not-found"><p className="eyebrow">Lokasi tidak dikenal</p><h1>Ruang ini belum ada.</h1><p>Tautan kembali ke ruang kerja yang tersedia.</p><Link className="button button-primary" to="/">Kembali ke ringkasan</Link></div>;
}

export default function App() {
  return <Routes>
    <Route element={<Layout />}>
      <Route index element={<OverviewPage />} />
      <Route path="agents" element={<AgentsPage />} />
      <Route path="tasks" element={<TaskBoardPage />} />
      <Route path="calendar" element={<CalendarPage />} />
      <Route path="opportunities" element={<OpportunitiesPage />} />
      <Route path="pipeline" element={<PipelinePage />} />
      <Route path="profile" element={<ProfilePage />} />
      <Route path="policy" element={<PolicyPage />} />
      <Route path="knowledge" element={<KnowledgePage />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="office" element={<OfficePage />} />
      <Route path="capabilities" element={<CapabilitiesPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes>;
}
