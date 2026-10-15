import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import { api, jsonRequest, type AuditEvent, type Autopilot, type BidDraft, type BusinessSyncStatus, type Capabilities, type ClientProject, type Inbox, type Insights, type Opportunity, type Policy, type Profile, type Work } from './api.js';
import { deriveOfficeAgents, ROOM_LABELS, STATE_COLORS, STATE_LABELS, summarize, type AgentState } from './office-state.js';
import { BOARDS, dayPhase, FLOOR, PODS, spotsFor, ZONES, type BoardId, type Spot } from './office-layout.js';
import type { BoardContent, CameraCommand } from './VisualOffice.js';

const VisualOffice = lazy(() => import('./VisualOffice.js'));

const MAX_SPECIALIZATIONS = 12;
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
    'knowledge.deleted': 'Sumber dihapus', 'bid.draft_failed': 'Draf proposal gagal',
    'autopilot.cycle': 'Siklus autopilot selesai', 'autopilot.bid_skipped': 'Bid dilewati kebijakan', 'autopilot.policy_bootstrapped': 'Kebijakan autopilot dibentuk',
    'marketplace.projects_synced': 'Proyek marketplace disinkronkan', 'marketplace.sync_failed': 'Sinkronisasi marketplace gagal',
    'marketplace.production.submit_bid': 'Bid dikirim ke Freelancer', 'marketplace.production.edit_profile': 'Profil Freelancer disinkronkan',
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
  const insights = useQuery({ queryKey: ['insights', 'bids'], queryFn: () => api<Insights>('/insights/bids'), refetchInterval: 60_000 });

  if (query.isPending || projects.isPending) return <LoadingPanel />;
  if (query.isError || projects.isError) return <ErrorNotice message="Ringkasan belum dapat dimuat." onRetry={() => { queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['projects'] }); }} />;
  const data = query.data;

  return <>
    <PageIntro eyebrow={`${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date())} / ruang operasi`} title="Kerja yang baik dimulai dari konteks yang jelas." description="Autopilot memantau peluang Freelancer, menyusun penawaran, dan menjalankan batas operasi tersimpan." action={<Link to="/opportunities" className="button button-primary">Buka antrean peluang</Link>} />
    <section className="metrics-row" aria-label="Ringkasan ruang kerja">
      <Metric label="Peluang terbuka" value={data.counts.openProjects} note="Dipindai otomatis" tone="primary" />
      <Metric label="Bid terkirim" value={data.counts.submittedBids} note="Dikonfirmasi Freelancer" />
      <Metric label="Sumber knowledge" value={data.counts.knowledgeSources} note="Fakta lokal yang bisa ditelusuri" />
      <Metric label="Keputusan dilewati" value={data.counts.policySkips} note="Alasan tersimpan di aktivitas" />
    </section>
    {insights.isPending && <LoadingPanel label="Memuat hasil bid..." />}
    {insights.isError && <ErrorNotice message="Hasil bid belum dapat dimuat." onRetry={() => insights.refetch()} />}
    {insights.data && <section className="activity-preview" aria-labelledby="bid-results-title">
      <div className="section-heading"><div><p className="eyebrow">Hasil penawaran</p><h2 id="bid-results-title">Hasil bid</h2></div><Link to="/inbox" className="text-link">Kotak masuk</Link></div>
      <div className="metrics-row">
        <Metric label="Menang" value={insights.data.outcomes.won} note={`dari ${insights.data.outcomes.submitted} bid terkirim`} tone="primary" />
        <Metric label="Kalah" value={insights.data.outcomes.lost} note="Ditolak, dicabut, atau ditarik" />
        <Metric label="Menunggu" value={insights.data.outcomes.pending} note={`${insights.data.outcomes.withConversation} dengan percakapan klien`} />
        <Metric label="Tingkat kemenangan" value={insights.data.outcomes.winRate === null ? '–' : `${Math.round(insights.data.outcomes.winRate * 100)}%`} note={insights.data.outcomes.winRate === null ? 'Belum ada bid yang diputuskan' : 'Menang ÷ (menang + kalah)'} />
      </div>
      <p className="form-help">{insights.data.lastCheck.ok === false ? `Pengecekan status bid gagal: ${insights.data.lastCheck.error ?? 'tidak diketahui'}` : insights.data.lastCheck.at ? `Status bid dicek dari Freelancer ${formatDate(insights.data.lastCheck.at)}.` : 'Status bid belum pernah dicek.'}</p>
    </section>}
    {insights.data && <section className="activity-preview" aria-labelledby="skip-reasons-title">
      <div className="section-heading"><div><p className="eyebrow">{insights.data.skips.total} keputusan · {insights.data.skips.recent7d} dalam 7 hari</p><h2 id="skip-reasons-title">Kenapa peluang dilewati</h2></div><Link to="/policy" className="text-link">Tinjau kebijakan</Link></div>
      {insights.data.skips.reasons.length ? <ul className="deadlines-list">
        {insights.data.skips.reasons.slice(0, 5).map(({ reason, total, recent }) => <li className="deadline-item" key={reason}>
          <div>{reason}</div>
          <div style={{ textAlign: 'right' }}><strong>{total}</strong><div style={{ color: 'var(--muted)', fontSize: 10 }}>{recent} dalam 7 hari</div></div>
        </li>)}
      </ul> : <p className="form-help">Belum ada peluang yang dilewati.</p>}
    </section>}
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
  const autopilot = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 30_000 });
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/profile') });
  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: () => api<Capabilities>('/capabilities') });
  const sync = useQuery({ queryKey: ['business-sync'], queryFn: () => api<BusinessSyncStatus | null>('/business-sync'), refetchInterval: 30_000 });
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => api<Inbox>('/inbox'), refetchInterval: 60_000 });
  const work = useQuery({ queryKey: ['work'], queryFn: () => api<Work>('/work'), refetchInterval: 60_000 });

  if (dashboard.isPending || profile.isPending || capabilities.isPending) return <LoadingPanel label="Menyiapkan data karyawan virtual..." />;
  if (dashboard.isError || profile.isError || capabilities.isError) return <ErrorNotice message="Gagal memuat status karyawan virtual." />;

  const inboxWaiting = inbox.isError ? undefined : inbox.data?.needsReply.length;
  const derived = deriveOfficeAgents(autopilot.isError ? undefined : autopilot.data, dashboard.data.activity, {
    sync: sync.isError ? undefined : sync.data, inboxWaiting, dueSoon: work.isError ? undefined : work.data?.dueSoon, hermes: capabilities.data.hermes,
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
      task: 'Menyusun draf proposal dengan Hermes AI berbasis fakta portofolio terverifikasi, merekomendasikan harga dan durasi.',
      boundary: 'Menghasilkan draf terstruktur; setiap eksekusi wajib lolos persetujuan deterministik policy engine.',
      metric: `${dashboard.data.counts.drafts} draf proposal lokal disiapkan`,
    },
    {
      id: 'profile-editor',
      name: 'Profile Editor',
      dept: 'Profile Studio',
      role: 'Kurator Profil & Bukti',
      task: 'Memelihara fakta profil, ringkasan spesialisasi, dan mengusulkan pembaruan berbasis bukti nyata repositori/portofolio.',
      boundary: 'Hanya menghasilkan diff berversi; tanpa modifikasi langsung pada akun platform eksternal.',
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
      task: 'Menyinkronkan repositori GitHub dan catatan lokal ke SQLite FTS5 untuk dijadikan bukti klaim proposal.',
      boundary: 'Read-only lokal; memindai & mengecualikan token/kredensial sebelum pengindeksan.',
      metric: `${dashboard.data.counts.knowledgeSources} sumber pengetahuan diindeks`,
    },
    {
      id: 'compliance-auditor',
      name: 'Compliance Auditor',
      dept: 'Compliance & Audit',
      role: 'Auditor Kebijakan & Keamanan',
      task: 'Memverifikasi setiap draf terhadap batas harga, kata kunci dilarang, dan ketersediaan bukti sumber.',
      boundary: 'Read-only deterministik; otomatis memblokir draf tanpa bukti sumber yang sah.',
      metric: `${dashboard.data.counts.policySkips} keputusan skip tercatat di audit`,
    },
    {
      id: 'qa-engineer',
      name: 'QA Engineer',
      dept: 'Quality Assurance',
      role: 'Verifikator Kontrak & Smoke',
      task: 'Menjalankan skenario smoke test, validasi skema DTO, serta memverifikasi alur simulasi fail-closed.',
      boundary: 'Beroperasi di lingkungan lokal & sandbox; tanpa kredensial live produksi.',
      metric: 'Tidak ada komponen runtime di aplikasi',
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
              {(() => { const derivedAgent = derived.find((item) => item.id === agent.id); const state = derivedAgent?.state ?? 'unknown'; return <><span className="vo3d-state-dot" style={{ background: STATE_COLORS[state] }} /><span className="state-label">{STATE_LABELS[state]}</span><small style={{ color: 'var(--muted)', display: 'block', marginTop: 2 }}>{derivedAgent?.reason ?? 'Data server tidak tersedia.'}</small></>; })()}
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
  const dashboardQuery = useQuery({ queryKey: ['dashboard'], queryFn: () => api<{ counts: { openProjects: number; drafts: number; policySkips: number }; bidUsage: { today: number; week: number } }>('/dashboard') });
  const workQuery = useQuery({ queryKey: ['work'], queryFn: () => api<Work>('/work') });

  if (policyQuery.isPending || projectsQuery.isPending || dashboardQuery.isPending) return <LoadingPanel label="Menyiapkan kalender dan jadwal operasi..." />;
  if (policyQuery.isError || projectsQuery.isError || dashboardQuery.isError) return <ErrorNotice message="Gagal memuat data kalender." />;

  const policy = policyQuery.data;
  const projects = projectsQuery.data;
  const dashboard = dashboardQuery.data;

  const now = new Date();
  let currentHour: number;
  try { currentHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: policy.timezone, hour: '2-digit', hourCycle: 'h23' }).format(now)); } catch { currentHour = now.getHours(); }
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
            <strong>{dashboard.bidUsage.today} / {policy.dailyBidLimit}</strong>
          </div>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${Math.min(100, Math.round((dashboard.bidUsage.today / (policy.dailyBidLimit || 1)) * 100))}%` }} />
          </div>
        </div>

        <div className="meter-row">
          <div className="meter-label">
            <span>Batas Penawaran Mingguan</span>
            <strong>{dashboard.bidUsage.week} / {policy.weeklyBidLimit}</strong>
          </div>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${Math.min(100, Math.round((dashboard.bidUsage.week / (policy.weeklyBidLimit || 1)) * 100))}%` }} />
          </div>
        </div>
      </section>
      <p className="form-help">Dihitung dari bid live yang tercatat berhasil di log audit.</p>

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
        {(() => {
          const clientDeadlines = (workQuery.data?.projects ?? []).filter((item) => item.status === 'active' && item.daysToDeadline !== null);
          return <>
            <h3>Tenggat Proyek Klien ({workQuery.isError ? '–' : clientDeadlines.length})</h3>
            {workQuery.isError ? <p style={{ color: 'var(--muted)', fontSize: 12 }}>Data proyek klien tidak dapat dimuat.</p>
              : workQuery.isPending ? <p style={{ color: 'var(--muted)', fontSize: 12 }}>Memuat tenggat proyek klien...</p>
                : clientDeadlines.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 12 }}>Belum ada tenggat proyek klien. <Link to="/work">Tambahkan proyek</Link></p>
                  : <ul className="deadlines-list">{clientDeadlines.map((item) => <li className="deadline-item" key={item.id}>
                    <div><Link to="/work" style={{ fontWeight: 600, textDecoration: 'none' }}>{item.title}</Link><div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>Klien: {item.client} · {item.deadline}</div></div>
                    <div style={{ textAlign: 'right' }}><strong style={{ color: (item.daysToDeadline ?? 0) <= 2 ? 'var(--danger)' : 'var(--pine)' }}>{deadlineLabel(item.daysToDeadline)}</strong></div>
                  </li>)}</ul>}
          </>;
        })()}
      </section>

      <section className="calendar-card" style={{ gridColumn: '1 / -1' }}>
        <h3>Penutupan Penawaran Proyek ({deadlineProjects.length})</h3>
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
                  <div style={{ color: 'var(--muted)', fontSize: 10 }}>Sisa hari saat sinkronisasi terakhir</div>
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
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => { if (profileQuery.data && !profile) setProfile(profileQuery.data); }, [profileQuery.data]);
  const save = useMutation({
    mutationFn: (value: Profile) => api<{ profile: Profile; policy: Policy }>('/profile', jsonRequest('PUT', value)),
    onSuccess: (result: { profile: Profile; policy: Policy }) => { setProfile(result.profile); setNotice({ text: result.policy.state === 'draft' ? 'Profil tersimpan. Kebijakan kembali ke draf; aktifkan ulang di kartu Kebijakan agar autopilot mengirim bid lagi.' : 'Profil tersimpan.', error: false }); queryClient.invalidateQueries({ queryKey: ['profile'] }); queryClient.invalidateQueries({ queryKey: ['policy'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (error: Error) => setNotice({ text: error.message, error: true }),
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
    {notice && (notice.error ? <ErrorNotice message={notice.text} /> : <div className="notice notice-success" role="status">{notice.text}</div>)}
    <form className="form-section" onSubmit={(event) => { event.preventDefault(); if (profile) save.mutate(profile); }}>
      <section className="form-card"><div className="section-heading"><div><p className="eyebrow">Arah layanan</p><h2>Bidang utama dan spesialisasi</h2></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Bidang utama</span><select value={profile.primaryField} onChange={(event) => setProfile({ ...profile, primaryField: event.target.value })}><option value="">Pilih bidang utama</option>{fields.map((field) => <option key={field}>{field}</option>)}</select></label>
          <label className="form-field"><span>Bahasa kerja</span><select value={profile.language} onChange={(event) => setProfile({ ...profile, language: event.target.value })}><option value="id">Bahasa Indonesia</option><option value="en">English</option><option value="id-en">Indonesia dan English</option></select></label>
        </div>
        <fieldset className="specialty-fieldset"><legend>Spesialisasi aktif ({profile.specializations.length}/{MAX_SPECIALIZATIONS})</legend>
          <p className="form-help">Dipakai autopilot sebagai kata kunci pencarian proyek Freelancer; skill teknis (mis. Python, Laravel) lebih cocok daripada nama peran.</p>
          <div className="specialty-grid">{[...new Set([...profile.specializations, ...fields])].map((field) => { const checked = profile.specializations.includes(field); return <label key={field} className="check-row"><input type="checkbox" checked={checked} disabled={!checked && profile.specializations.length >= MAX_SPECIALIZATIONS} onChange={() => toggleSpecialty(field)} /><span>{field}</span></label>; })}</div></fieldset>
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
  const [searched, setSearched] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const next = await Promise.all(selected.map(async (file) => ({ path: file.name, content: await file.text() })));
    setFiles(next);
    if (selected.length) setLabel((current) => current || selected.length === 1 ? (current || selected[0]?.name.replace(/\.[^.]+$/, '') || '') : `${selected.length} berkas pilihan`);
  };
  const runImport = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const result = await api<{ chunks: number; rejected: Array<{ path: string; reason: string }> }>('/knowledge/import', jsonRequest('POST', { provider, label, referenceUrl, sourceRef, files }));
      setNotice({ text: `${result.chunks} potongan aman ditambahkan. ${result.rejected.length} berkas dikecualikan.`, error: false }); setFiles([]); setLabel('');
      queryClient.invalidateQueries({ queryKey: ['knowledge'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['activity'] });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Impor gagal.', error: true }); }
    finally { setBusy(false); }
  };
  const syncGitHub = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice({ text: 'Membaca repositori terpilih...', error: false });
    try {
      const result = await api<{ chunks: number; filesSeen: number; rejected: number; complete: boolean }>('/knowledge/github/sync', jsonRequest('POST', { repository: repo }));
      setNotice({ text: `${result.filesSeen} berkas dibaca, ${result.chunks} potongan aman diindeks, ${result.rejected} dilewati.${result.complete ? '' : ' Cakupan parsial, periksa batas file.'}`, error: false });
      queryClient.invalidateQueries({ queryKey: ['knowledge'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['capabilities'] });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Sinkronisasi gagal.', error: true }); }
    finally { setBusy(false); }
  };
  const syncAllGitHub = async () => {
    setBusy(true); setNotice({ text: 'Membaca semua repositori milik Anda. Ini bisa memakan beberapa menit...', error: false });
    try {
      const result = await api<{ synced: number; chunks: number; repositories: Array<{ repository: string; error: string | null }> }>('/knowledge/github/sync-all', jsonRequest('POST'));
      const failed = result.repositories.filter((item) => item.error);
      setNotice({ text: `${result.synced} dari ${result.repositories.length} repositori diindeks (${result.chunks} potongan).${failed.length ? ` Dilewati: ${failed.map((item) => item.repository).join(', ')}.` : ''}`, error: false });
      queryClient.invalidateQueries({ queryKey: ['knowledge'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Sinkronisasi gagal.', error: true }); }
    finally { setBusy(false); }
  };
  const search = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { const nextResults = await api<Array<{ label: string; path: string; url: string; content: string }>>('/knowledge/search', jsonRequest('POST', { query: queryText, limit: 6 })); setResults(nextResults); setSearched(true); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Pencarian gagal.', error: true }); }
    finally { setBusy(false); }
  };
  const removeSource = async (id: string) => {
    if (!window.confirm('Hapus sumber dan semua potongan indeks terkait?')) return;
    try { await api(`/knowledge/sources/${encodeURIComponent(id)}`, { method: 'DELETE' }); setNotice({ text: 'Sumber dan indeks terkait dihapus.', error: false }); queryClient.invalidateQueries({ queryKey: ['knowledge'] }); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Sumber tidak dapat dihapus.', error: true }); }
  };

  if (knowledge.isPending) return <LoadingPanel label="Membuka knowledge hub lokal..." />;
  if (knowledge.isError) return <ErrorNotice message="Status knowledge hub belum dapat dimuat." onRetry={() => knowledge.refetch()} />;
  return <>
    <PageIntro eyebrow="Knowledge Hub" title="Bawa bukti kerja, bukan seluruh repositori ke setiap draf." description="Pilih sumber yang Anda izinkan. Teks diperiksa sebelum masuk indeks lokal dan setiap hasil menyimpan path serta provenance." />
    {notice && (notice.error ? <ErrorNotice message={notice.text} /> : <div className="notice notice-success" role="status">{notice.text}</div>)}
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
        <div className="form-actions"><button className="button button-primary" type="button" disabled={busy || !capabilities.data?.github.tokenConfigured} onClick={syncAllGitHub}>Sinkronkan semua repo saya</button><small className="form-help">Repo milik Anda (bukan fork/arsip), maks. 50 repo terbaru; sinkron ulang menggantikan indeks lama.</small></div>
        <div className="provider-limit"><strong>LinkedIn: impor lewat file ekspor.</strong><p>API LinkedIn tidak memberi akses ke riwayat kerja atau skill. Di LinkedIn buka Settings → Data privacy → Get a copy of your data, unduh arsipnya, ekstrak, lalu pada form “Impor berkas teks” pilih asal “Ekspor LinkedIn milik saya” dan unggah Profile.csv, Positions.csv, Skills.csv, Education.csv, Projects.csv, serta Certifications.csv.</p></div>
      </section>
    </div>
    <section className="form-card source-section"><div className="section-heading"><div><p className="eyebrow">Provenance dan freshness</p><h2>Sumber terindeks</h2></div></div>
      {knowledge.data.sources.length === 0 ? <div className="empty-state"><h3>Knowledge hub masih kosong</h3><p>Impor catatan teks atau pilih repositori agar draf dapat menyebutkan bukti yang bisa ditelusuri.</p></div> : <div className="source-list">{knowledge.data.sources.map((source) => <article key={source.id} className="source-row"><div><span className="source-provider">{source.provider}</span><h3>{source.label}</h3><p>{source.chunkCount} potongan / diperbarui {formatDate(source.updatedAt)}</p>{source.referenceUrl && source.referenceUrl.startsWith('https://') && <a href={source.referenceUrl} target="_blank" rel="noreferrer">Buka sumber</a>}</div><button className="button button-text" type="button" onClick={() => removeSource(source.id)}>Hapus sumber</button></article>)}</div>}
    </section>
    <section className="form-card search-section"><div className="section-heading"><div><p className="eyebrow">Retrieval lokal</p><h2>Temukan bukti yang relevan</h2></div></div><form className="search-inline" onSubmit={search}><label className="form-field"><span>Kata atau frasa</span><input value={queryText} onChange={(event) => setQueryText(event.target.value)} minLength={2} placeholder="Misalnya: cursor pagination" /></label><button type="submit" className="button button-primary" disabled={busy || queryText.trim().length < 2}>Cari di knowledge hub</button></form>
      {results.length > 0 ? <div className="search-results">{results.map((result, index) => <article key={`${result.path}-${index}`}><div><strong>{result.label} / {result.path}</strong>{result.url.startsWith('https://') ? <a href={result.url} target="_blank" rel="noreferrer">Lihat provenance</a> : <span className="local-reference">Sumber lokal</span>}</div><p>{result.content}</p></article>)}</div> : <p className="form-help">{searched ? 'Tidak ada hasil untuk pencarian ini.' : 'Hasil pencarian menampilkan potongan teks dan sumbernya, bukan seluruh dokumen.'}</p>}
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
      <p className="provider-limit">Autopilot mengirim bid pada proyek fixed price USD yang cocok dengan keahlian di ringkasan profil publik. Batas lokal tetap berlaku: USD 100–800, maksimal 4 bid per hari dan 12 per minggu, risiko, deadline, confidence, serta jam kerja. Job profile disinkronkan ulang dengan daftar yang sama pada startup; pesan hanya dikirim saat ada aturan respons untuk percakapan.</p>
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

function useClock(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

type StateChange = { key: string; at: string; name: string; from: AgentState; to: AgentState };

const SHEET_TITLES: Record<string, string> = { '/overview': 'Ringkasan', ...Object.fromEntries(BOARDS.map((board) => [board.route, board.label])) };
const BOARD_ACCENTS: Record<BoardId, string> = {
  opportunities: '#2a9d8f', pipeline: '#457b9d', tasks: '#6a4c93', calendar: '#e76f51', inbox: '#1c7ed6', work: '#2f9e44',
  activity: '#495057', agents: '#d62828', profile: '#f4a261', policy: '#9c6ade', knowledge: '#8ab17d', capabilities: '#277da1',
};

type ShellData = {
  dashboard?: { counts: { openProjects: number }; policy: { state: Policy['state'] }; bidUsage?: { today: number; week: number }; externalWrites: boolean } | undefined;
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
    opportunities: data.dashboard ? { lines: [`${data.dashboard.counts.openProjects} peluang`, data.autopilot?.nextRunAt ? `Pindai berikutnya ${timeOf(data.autopilot.nextRunAt)}` : `Autopilot ${data.autopilot?.state ?? 'tidak diketahui'}`] } : { lines: unavailable },
    pipeline: data.pipeline ? { lines: [`${count(['submitted', 'in_conversation'])} terkirim`, `${count(['won'])} menang · ${count(['lost'])} kalah`] } : { lines: unavailable },
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

function OfficeShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const stage = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const sheetHeading = useRef<HTMLHeadingElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'agent' | 'activity' | 'channels' | null>(null);
  const [rosterOpen, setRosterOpen] = useState(wideScreen);
  const [command, setCommand] = useState<CameraCommand>({ kind: 'overview', n: 0 });
  const [view, setView] = useState<'3d' | 'top'>('3d');
  const [tour, setTour] = useState(false);
  const [search, setSearch] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [changes, setChanges] = useState<StateChange[]>([]);
  const previous = useRef<Map<string, AgentState> | null>(null);
  const [webgl] = useState(() => {
    try { const canvas = document.createElement('canvas'); return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')); } catch { return false; }
  });
  const [reducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
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
  const policy = useQuery({ queryKey: ['policy'], queryFn: () => api<Policy>('/policy') });
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/profile') });
  const knowledge = useQuery({ queryKey: ['knowledge'], queryFn: () => api<{ coverage: { sources: number; chunks: number } }>('/knowledge') });
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
  const agents = useMemo(() => deriveOfficeAgents(autopilotData, activityData, { sync: syncData, inboxWaiting, dueSoon, hermes }), [autopilotData, activityData, syncData, inboxWaiting, dueSoon, hermes]);
  const spots = useMemo(() => spotsFor(agents), [agents]);
  const counts = summarize(agents);
  const boards = buildBoards({
    dashboard: fresh(dashboard), autopilot: autopilotData, pipeline: fresh(pipeline), policy: fresh(policy), profile: fresh(profile),
    knowledge: fresh(knowledge), capabilities: fresh(capabilities), inbox: fresh(inbox), work: fresh(work), activity: activityData, counts,
  });
  const selected = agents.find((agent) => agent.id === selectedId);
  const query = search.trim().toLocaleLowerCase();
  const visibleAgents = query ? agents.filter((agent) => `${agent.name} ${agent.role}`.toLocaleLowerCase().includes(query)) : agents;
  const stateKey = agents.map((agent) => agent.state).join();
  const sheetOpen = location.pathname !== '/';
  const dashboardData = fresh(dashboard);

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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.current?.focus(); }
      if (event.key === 'Escape' && window.location.pathname !== '/') navigate('/');
    };
    const onFullscreen = () => setFullscreen(document.fullscreenElement === stage.current);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFullscreen); };
  }, [navigate]);

  const fly = (next: Omit<CameraCommand, 'n'>) => setCommand((current) => ({ ...next, n: current.n + 1 }));
  useEffect(() => {
    const board = BOARDS.find((slot) => slot.route === location.pathname);
    if (board) fly({ kind: 'board', id: board.id });
    if (location.pathname !== '/') sheetHeading.current?.focus();
  }, [location.pathname]);

  const selectAgent = (id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    setPanel('agent');
    if (spots.has(id)) fly({ kind: 'agent', id });
  };
  const openBoard = (id: BoardId) => navigate(BOARDS.find((slot) => slot.id === id)!.route);
  const summary = autopilot.isPending ? 'Memuat status kru...'
    : [`${counts.working} bekerja`, `${counts.idle} idle`, `${counts.offline} offline`, ...(counts.unknown ? [`${counts.unknown} tidak diketahui`] : [])].join(' · ');
  const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(now);
  const width = FLOOR.maxX - FLOOR.minX;
  const depth = FLOOR.maxZ - FLOOR.minZ;
  const externalLabel = !dashboardData ? 'Status aksi eksternal tidak diketahui' : dashboardData.externalWrites ? 'Bid live ke Freelancer aktif' : 'Aksi eksternal nonaktif';

  return <div className="vo3d vo3d-app" ref={stage} style={{ background: phase.sky }}>
    <div className="vo3d-canvas" role="img" aria-label={`Kantor 3D Mission Control. ${summary}. Gunakan menu Papan dan daftar agen untuk navigasi dengan keyboard.`}>
      {webgl ? <Suspense fallback={<div className="vo3d-fallback">Memuat kantor visual...</div>}>
        <VisualOffice agents={agents} ready={!autopilot.isPending} selectedId={selectedId} onSelect={selectAgent} command={command} view={view} tour={tour} phase={phase} reducedMotion={reducedMotion} boards={boards} onOpenBoard={openBoard} />
      </Suspense> : <div className="vo3d-fallback">WebGL tidak tersedia di browser ini. Gunakan menu Papan untuk membuka setiap kartu.</div>}
    </div>

    <section className="vo3d-float vo3d-card" aria-live="polite">
      <h1><span className={`vo3d-live${autopilotData ? '' : ' is-off'}`} aria-hidden="true" />Mission Control</h1>
      <p><OfficeIcon name="sun" />{phase.label} · {time}</p>
      <p>{summary}</p>
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
      <details className="vo3d-menu">
        <summary className="vo3d-icon" aria-label="Menu papan"><OfficeIcon name="grid" /></summary>
        <nav aria-label="Papan Mission Control">
          <Link to="/overview">Ringkasan</Link>
          {BOARDS.map((board) => <Link key={board.id} to={board.route}>{board.label}</Link>)}
        </nav>
      </details>
      <label className="vo3d-search"><OfficeIcon name="search" /><span className="sr-only">Cari agen</span>
        <input ref={searchInput} type="search" placeholder="Cari agen" value={search} onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && visibleAgents[0]) selectAgent(visibleAgents[0].id); if (event.key === 'Escape') setSearch(''); }} />
        <kbd>Ctrl K</kbd>
      </label>
      {dashboardData && dashboardData.policy.state !== 'draft' && <button type="button" className={`vo3d-kill${dashboardData.policy.state === 'active' ? ' is-danger' : ''}`} disabled={pause.isPending}
        onClick={() => pause.mutate(dashboardData.policy.state === 'active' ? 'pause' : 'resume')}>{dashboardData.policy.state === 'active' ? 'Jeda automasi' : 'Lanjutkan kebijakan'}</button>}
      <button type="button" className="vo3d-icon" aria-pressed={fullscreen} aria-label={fullscreen ? 'Keluar dari layar penuh' : 'Layar penuh'} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void stage.current?.requestFullscreen?.(); }}><OfficeIcon name="expand" /></button>
    </div>
    {pause.isError && <div className="vo3d-float vo3d-toast" role="alert">{pause.error.message}</div>}

    {panel && !sheetOpen && <aside className="vo3d-float vo3d-panel" aria-label="Panel detail">
      <div className="vo3d-tabs" role="tablist">
        {([['agent', 'Agen'], ['activity', 'Aktivitas'], ['channels', 'Kanal']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={panel === id} onClick={() => setPanel(id)}>{label}</button>)}
        <button type="button" className="vo3d-close" aria-label="Tutup panel" onClick={() => setPanel(null)}><OfficeIcon name="close" /></button>
      </div>
      <div className="vo3d-panel-body" role="tabpanel">
        {panel === 'agent' && (selected ? <>
          <div className="vo3d-profile"><span className="vo3d-avatar" style={{ background: selected.color }}>{initials(selected.name)}</span>
            <div><h3>{selected.name}</h3><p>{selected.role}</p><span className="vo3d-badge"><span className="vo3d-state-dot" style={{ background: STATE_COLORS[selected.state] }} />{STATE_LABELS[selected.state]}</span></div></div>
          <dl>
            <dt>Ruangan</dt><dd>{selected.room ? ROOM_LABELS[selected.room] : 'Tidak di lantai kantor'}</dd>
            <dt>Alasan status</dt><dd>{selected.reason}</dd>
            <dt>Tugas saat ini</dt><dd>{selected.task ?? 'Tidak ada tugas berjalan'}</dd>
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
        {PODS.map((pod) => <rect key={pod.id} x={pod.x - 2.3} y={pod.z - 2.3} width="4.6" height="4.6" rx="0.5" fill={pod.color} opacity="0.3" onClick={() => selectAgent(pod.id)} />)}
        {agents.map((agent) => { const spot = spots.get(agent.id); return spot ? <circle key={agent.id} cx={spot.x} cy={spot.z} r="0.75" fill={STATE_COLORS[agent.state]} stroke="#fff" strokeWidth="0.3" /> : null; })}
      </svg>
      <p>Lt 1 · titik = posisi tujuan tiap agen</p>
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
      <button type="button" aria-pressed={tour} disabled={reducedMotion} title={reducedMotion ? 'Dinonaktifkan karena preferensi kurangi gerakan' : 'Putar kamera otomatis'} onClick={() => { setView('3d'); setTour((on) => !on); }}><OfficeIcon name="play" />Tur</button>
      <button type="button" aria-label="Pusatkan kamera" title="Pusatkan" onClick={() => fly({ kind: 'overview' })}><OfficeIcon name="target" /></button>
    </div>

    {sheetOpen && <div className="vo3d-sheet-backdrop" onClick={() => navigate('/')}>
      <section className="vo3d-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(event) => event.stopPropagation()}>
        <header className="vo3d-sheet-head">
          <h2 id="sheet-title" ref={sheetHeading} tabIndex={-1}>{SHEET_TITLES[location.pathname] ?? 'Halaman'}</h2>
          <button type="button" className="vo3d-icon" aria-label="Tutup kartu dan kembali ke kantor" onClick={() => navigate('/')}><OfficeIcon name="close" /></button>
        </header>
        <div className="vo3d-sheet-body page-content"><Outlet /></div>
      </section>
    </div>}
  </div>;
}

function waitingLabel(hours: number) {
  return hours >= 48 ? `menunggu ${Math.floor(hours / 24)} hari` : `menunggu ${hours} jam`;
}

function syncLine(sync: Inbox['sync'], label: string) {
  if (!sync) return `Sinkronisasi ${label} tidak tersedia di server ini.`;
  if (sync.ok === false) return `Sinkronisasi ${label} gagal: ${sync.error ?? 'tidak diketahui'}.`;
  return sync.lastRunAt ? `Terakhir disinkronkan ${formatDate(sync.lastRunAt)}.` : `${label[0]!.toUpperCase()}${label.slice(1)} belum pernah disinkronkan.`;
}

function InboxPage() {
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => api<Inbox>('/inbox'), refetchInterval: 60_000 });
  if (inbox.isPending) return <LoadingPanel label="Memuat kotak masuk..." />;
  if (inbox.isError) return <ErrorNotice message="Kotak masuk belum dapat dimuat." onRetry={() => inbox.refetch()} />;
  const { sync, needsReply, followUps } = inbox.data;
  return <>
    <PageIntro eyebrow="Klien" title="Pesan yang menunggu Anda." description="Dibaca dari Freelancer setiap 10 menit. Aplikasi tidak pernah mengirim pesan otomatis." />
    {sync?.ok === false ? <ErrorNotice message={syncLine(sync, 'pesan')} /> : <p className="form-help">{syncLine(sync, 'pesan')}</p>}
    <section className="activity-preview" aria-labelledby="needs-reply-title">
      <div className="section-heading"><div><p className="eyebrow">Pesan terakhir dari klien</p><h2 id="needs-reply-title">Menunggu balasan ({needsReply.length})</h2></div><a className="text-link" href="https://www.freelancer.com/messages" target="_blank" rel="noreferrer">Buka Freelancer</a></div>
      {needsReply.length ? <ul className="deadlines-list">{needsReply.map((thread) => <li className="deadline-item" key={thread.threadId}>
        <div><strong>{thread.projectTitle ?? 'Percakapan tanpa proyek tersinkron'}</strong><div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{thread.preview}</div></div>
        <div style={{ textAlign: 'right' }}><strong style={{ color: thread.waitingHours >= 24 ? 'var(--danger)' : 'var(--pine)' }}>{waitingLabel(thread.waitingHours)}</strong><div style={{ color: 'var(--muted)', fontSize: 10 }}>{formatDate(thread.lastMessageAt)}</div></div>
      </li>)}</ul> : <p className="form-help">{sync?.lastRunAt ? 'Tidak ada pesan yang menunggu balasan.' : 'Belum ada data pesan.'}</p>}
    </section>
    <section className="activity-preview" aria-labelledby="follow-up-title">
      <div className="section-heading"><div><p className="eyebrow">Bid tanpa percakapan klien ≥ 3 hari</p><h2 id="follow-up-title">Perlu follow-up ({followUps.length})</h2></div></div>
      {followUps.length ? <ul className="deadlines-list">{followUps.map((bid) => <li className="deadline-item" key={bid.projectId}>
        <div><Link to={`/opportunities?project=${encodeURIComponent(bid.projectId)}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{bid.title}</Link><div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>Bid dikirim {formatDate(bid.submittedAt)}</div></div>
        <div style={{ textAlign: 'right' }}><strong>{bid.daysSinceBid} hari</strong><div style={{ color: 'var(--muted)', fontSize: 10 }}>sejak bid</div></div>
      </li>)}</ul> : <p className="form-help">Tidak ada bid yang perlu ditindaklanjuti.</p>}
    </section>
  </>;
}

const SOURCE_LABELS: Record<ClientProject['source'], string> = { freelancer: 'Freelancer', direct: 'Langsung', linkedin: 'LinkedIn', other: 'Lainnya' };

function deadlineLabel(days: number | null) {
  if (days === null) return 'Tanpa tenggat';
  if (days === 0) return 'Hari ini';
  return days > 0 ? `${days} hari lagi` : `lewat ${-days} hari`;
}

function WorkPage() {
  const queryClient = useQueryClient();
  const work = useQuery({ queryKey: ['work'], queryFn: () => api<Work>('/work'), refetchInterval: 60_000 });
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/profile') });
  const currency = profile.data?.currency ?? 'USD';
  const [project, setProject] = useState({ title: '', client: '', source: 'direct' as ClientProject['source'], deadline: '', value: '', currency: '' });
  const [payment, setPayment] = useState({ projectId: '', amount: '', currency: '', status: 'expected' as 'expected' | 'received', dueDate: '', note: '' });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['work'] });
  const createProject = useMutation({
    mutationFn: () => api<ClientProject>('/work/projects', jsonRequest('POST', {
      title: project.title, client: project.client, source: project.source, deadline: project.deadline || null,
      value: project.value === '' ? null : Number(project.value), currency: project.currency || currency,
    })),
    onSuccess: async () => { setProject({ title: '', client: '', source: 'direct', deadline: '', value: '', currency: '' }); await refresh(); },
  });
  const updateProject = useMutation({ mutationFn: ({ id, status }: { id: string; status: ClientProject['status'] }) => api(`/work/projects/${encodeURIComponent(id)}`, jsonRequest('PUT', { status })), onSuccess: refresh });
  const recordPayment = useMutation({
    mutationFn: () => api('/work/payments', jsonRequest('POST', {
      projectId: payment.projectId, amount: Number(payment.amount), currency: payment.currency || currency,
      status: payment.status, dueDate: payment.dueDate || null, note: payment.note,
    })),
    onSuccess: async () => { setPayment({ projectId: '', amount: '', currency: '', status: 'expected', dueDate: '', note: '' }); await refresh(); },
  });
  const markReceived = useMutation({ mutationFn: (id: string) => api(`/work/payments/${encodeURIComponent(id)}/received`, jsonRequest('POST')), onSuccess: refresh });

  if (work.isPending) return <LoadingPanel label="Memuat proyek dan pendapatan..." />;
  if (work.isError) return <ErrorNotice message="Data proyek belum dapat dimuat." onRetry={() => work.refetch()} />;
  const { projects, payments, income, dueSoon } = work.data;
  const active = projects.filter((item) => item.status === 'active');
  const finished = projects.filter((item) => item.status !== 'active');
  const titles = new Map(projects.map((item) => [item.id, item.title]));
  const pendingPayments = payments.filter((item) => item.status === 'expected');
  const money = (rows: Array<{ currency: string; total: number }>) => rows.length ? rows.map((row) => formatMoney(row.total, row.currency)).join(' · ') : '–';
  const mutationError = [createProject, updateProject, recordPayment, markReceived].find((mutation) => mutation.isError)?.error;

  return <>
    <PageIntro eyebrow="Proyek berjalan" title="Proyek aktif dan pendapatan." description="Proyek Freelancer yang menang ditambahkan otomatis. Klien langsung atau LinkedIn dicatat manual di sini." />
    {mutationError && <ErrorNotice message={mutationError.message} />}
    <section className="metrics-row" aria-label="Ringkasan proyek dan pendapatan">
      <Metric label="Proyek aktif" value={active.length} note={`${finished.length} selesai atau ditutup`} tone="primary" />
      <Metric label="Tenggat ≤ 2 hari" value={dueSoon} note="Proyek aktif dengan tenggat dekat" />
      <Metric label={`Diterima ${income.month}`} value={money(income.received)} note="Per mata uang, tidak dijumlahkan lintas kurs" />
      <Metric label="Menunggu pembayaran" value={money(income.expected)} note={`${pendingPayments.length} pembayaran tercatat`} />
    </section>

    <section className="activity-preview" aria-labelledby="active-projects-title">
      <div className="section-heading"><div><p className="eyebrow">Diurutkan dari tenggat terdekat</p><h2 id="active-projects-title">Proyek aktif ({active.length})</h2></div></div>
      {active.length ? <ul className="deadlines-list">{active.map((item) => <li className="deadline-item" key={item.id}>
        <div><strong>{item.title}</strong><div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{item.client} · {SOURCE_LABELS[item.source]}{item.value !== null ? ` · ${formatMoney(item.value, item.currency)}` : ''}</div></div>
        <div style={{ textAlign: 'right', display: 'grid', gap: 6, justifyItems: 'end' }}>
          <strong style={{ color: item.daysToDeadline !== null && item.daysToDeadline <= 2 ? 'var(--danger)' : 'var(--pine)' }}>{deadlineLabel(item.daysToDeadline)}</strong>
          <span style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="button button-secondary" disabled={updateProject.isPending} onClick={() => updateProject.mutate({ id: item.id, status: 'delivered' })}>Tandai terkirim</button>
            <button type="button" className="button button-text" disabled={updateProject.isPending} onClick={() => updateProject.mutate({ id: item.id, status: 'closed' })}>Tutup</button>
          </span>
        </div>
      </li>)}</ul> : <p className="form-help">Belum ada proyek aktif.</p>}
      {finished.length > 0 && <details><summary>Selesai ({finished.length})</summary><ul className="deadlines-list">{finished.map((item) => <li className="deadline-item" key={item.id}><div>{item.title}<div style={{ color: 'var(--muted)', fontSize: 11 }}>{item.client} · {item.status === 'delivered' ? 'Terkirim' : 'Ditutup'}</div></div></li>)}</ul></details>}
    </section>

    <section className="activity-preview" aria-labelledby="payments-title">
      <div className="section-heading"><div><p className="eyebrow">Belum diterima</p><h2 id="payments-title">Pembayaran tertunda ({pendingPayments.length})</h2></div></div>
      {pendingPayments.length ? <ul className="deadlines-list">{pendingPayments.map((item) => <li className="deadline-item" key={item.id}>
        <div><strong>{formatMoney(item.amount, item.currency)}</strong><div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{titles.get(item.projectId) ?? 'Proyek'}{item.dueDate ? ` · jatuh tempo ${item.dueDate}` : ''}{item.note ? ` · ${item.note}` : ''}</div></div>
        <button type="button" className="button button-secondary" disabled={markReceived.isPending} onClick={() => markReceived.mutate(item.id)}>Tandai diterima</button>
      </li>)}</ul> : <p className="form-help">Belum ada pembayaran tertunda.</p>}
    </section>

    <div className="form-section">
      <form className="form-card" onSubmit={(event) => { event.preventDefault(); createProject.mutate(); }}>
        <div className="section-heading"><div><p className="eyebrow">Klien langsung, LinkedIn, atau lainnya</p><h2>Tambah proyek</h2></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Judul proyek</span><input required maxLength={150} value={project.title} onChange={(event) => setProject({ ...project, title: event.target.value })} /></label>
          <label className="form-field"><span>Klien</span><input required maxLength={120} value={project.client} onChange={(event) => setProject({ ...project, client: event.target.value })} /></label>
          <label className="form-field"><span>Sumber</span><select value={project.source} onChange={(event) => setProject({ ...project, source: event.target.value as ClientProject['source'] })}>{Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="form-field"><span>Tenggat</span><input type="date" value={project.deadline} onChange={(event) => setProject({ ...project, deadline: event.target.value })} /></label>
          <label className="form-field"><span>Nilai proyek</span><input type="number" min="0" step="any" value={project.value} onChange={(event) => setProject({ ...project, value: event.target.value })} /></label>
          <label className="form-field"><span>Mata uang</span><input maxLength={3} placeholder={currency} value={project.currency} onChange={(event) => setProject({ ...project, currency: event.target.value.toUpperCase() })} /></label>
        </div>
        <div className="form-actions"><button type="submit" className="button button-primary" disabled={createProject.isPending}>Simpan proyek</button></div>
      </form>

      <form className="form-card" onSubmit={(event) => { event.preventDefault(); recordPayment.mutate(); }}>
        <div className="section-heading"><div><p className="eyebrow">Pemasukan</p><h2>Catat pembayaran</h2></div></div>
        {projects.length ? <>
          <div className="form-grid">
            <label className="form-field"><span>Proyek</span><select required value={payment.projectId} onChange={(event) => setPayment({ ...payment, projectId: event.target.value, currency: projects.find((item) => item.id === event.target.value)?.currency ?? payment.currency })}><option value="">Pilih proyek</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label className="form-field"><span>Jumlah</span><input required type="number" min="0" step="any" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} /></label>
            <label className="form-field"><span>Mata uang</span><input maxLength={3} placeholder={currency} value={payment.currency} onChange={(event) => setPayment({ ...payment, currency: event.target.value.toUpperCase() })} /></label>
            <label className="form-field"><span>Status</span><select value={payment.status} onChange={(event) => setPayment({ ...payment, status: event.target.value as 'expected' | 'received' })}><option value="expected">Menunggu</option><option value="received">Sudah diterima</option></select></label>
            <label className="form-field"><span>Jatuh tempo</span><input type="date" value={payment.dueDate} onChange={(event) => setPayment({ ...payment, dueDate: event.target.value })} /></label>
            <label className="form-field"><span>Catatan</span><input maxLength={200} value={payment.note} onChange={(event) => setPayment({ ...payment, note: event.target.value })} /></label>
          </div>
          <div className="form-actions"><button type="submit" className="button button-primary" disabled={recordPayment.isPending}>Simpan pembayaran</button></div>
        </> : <p className="form-help">Tambahkan proyek terlebih dahulu.</p>}
      </form>
    </div>
  </>;
}

function NotFoundPage() {
  return <div className="not-found"><p className="eyebrow">Lokasi tidak dikenal</p><h1>Ruang ini belum ada.</h1><p>Tautan kembali ke ruang kerja yang tersedia.</p><Link className="button button-primary" to="/">Kembali ke kantor</Link></div>;
}

export default function App() {
  return <Routes>
    <Route element={<OfficeShell />}>
      <Route index element={null} />
      <Route path="overview" element={<OverviewPage />} />
      <Route path="agents" element={<AgentsPage />} />
      <Route path="tasks" element={<TaskBoardPage />} />
      <Route path="calendar" element={<CalendarPage />} />
      <Route path="opportunities" element={<OpportunitiesPage />} />
      <Route path="pipeline" element={<PipelinePage />} />
      <Route path="inbox" element={<InboxPage />} />
      <Route path="work" element={<WorkPage />} />
      <Route path="profile" element={<ProfilePage />} />
      <Route path="policy" element={<PolicyPage />} />
      <Route path="knowledge" element={<KnowledgePage />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="capabilities" element={<CapabilitiesPage />} />
      <Route path="office" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes>;
}
