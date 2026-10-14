import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import { api, jsonRequest, type AuditEvent, type BidDraft, type Opportunity, type Policy, type Profile } from './api.js';

const ThreeOffice = lazy(() => import('./ThreeOffice.js'));

const navigation = [
  { to: '/', label: 'Ringkasan', end: true },
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
    active: 'Aktif', paused: 'Dijeda', draft: 'Belum aktif', recorded: 'Tercatat', blocked: 'Dilewati', failed: 'Gagal',
    new: 'Baru', scored: 'Dinilai', draft_ready: 'Draf siap', policy_check: 'Pemeriksaan kebijakan', submitted: 'Terkirim',
    in_conversation: 'Percakapan', won: 'Berhasil', lost: 'Tidak lanjut', skipped: 'Dilewati', expired: 'Kedaluwarsa',
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
          <p>Mode lokal memakai data contoh. Tidak ada bid yang dikirim.</p>
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
        <div className="mode-strip"><span className="mode-indicator" />{health.data?.mode === 'local' ? 'Data contoh lokal' : 'Menyiapkan data lokal'}<span className="mode-divider" />Aksi eksternal nonaktif</div>
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
        <div className="activity-copy"><strong>{activityTitle(event.type)}</strong><p>{event.reason}</p><small>{formatDate(event.createdAt)}</small></div>
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
    mode: string; counts: { openProjects: number; drafts: number; policySkips: number; knowledgeSources: number };
    policy: { state: Policy['state']; version: number; simulationOnly: boolean }; profileComplete: boolean;
    projects: Opportunity[]; activity: AuditEvent[]; externalWrites: boolean;
  }>('/dashboard') });
  const projects = useQuery({ queryKey: ['projects', 'overview'], queryFn: () => api<Opportunity[]>('/projects') });

  if (query.isPending || projects.isPending) return <LoadingPanel />;
  if (query.isError || projects.isError) return <ErrorNotice message="Ringkasan belum dapat dimuat." onRetry={() => { queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['projects'] }); }} />;
  const data = query.data;

  return <>
    <PageIntro eyebrow="14 Oktober 2026 / ruang operasi" title="Kerja yang baik dimulai dari konteks yang jelas." description="Tinjau peluang, siapkan draf berbasis fakta, dan biarkan kebijakan menjaga batas operasi." action={<Link to="/opportunities" className="button button-primary">Buka antrean peluang</Link>} />
    <section className="metrics-row" aria-label="Ringkasan ruang kerja">
      <Metric label="Peluang contoh" value={data.counts.openProjects} note="Tidak terhubung ke akun marketplace" tone="primary" />
      <Metric label="Draf lokal" value={data.counts.drafts} note="Belum pernah dikirim ke luar" />
      <Metric label="Sumber knowledge" value={data.counts.knowledgeSources} note="Fakta lokal yang bisa ditelusuri" />
      <Metric label="Keputusan dilewati" value={data.counts.policySkips} note="Alasan tersimpan di aktivitas" />
    </section>
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
        <p className="policy-copy">{data.policy.state === 'active' ? 'Simulasi lokal berjalan di bawah batas yang Anda tentukan. Tidak ada API marketplace yang dipanggil.' : data.policy.state === 'paused' ? 'Jeda darurat aktif. Simulasi dan tindakan berikutnya akan ditolak.' : 'Kebijakan masih berupa draf. Lengkapi profil dan pilih batas sebelum mengaktifkan simulasi.'}</p>
        <div className="policy-details"><span>Versi</span><strong>{data.policy.version}</strong><span>Profil</span><strong>{data.profileComplete ? 'Terisi' : 'Belum diatur'}</strong><span>Mode tulis</span><strong>Simulasi saja</strong></div>
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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const initialProject = new URLSearchParams(location.search).get('project');
  const [search, setSearch] = useState('');
  const [selectedDraft, setSelectedDraft] = useState<BidDraft | null>(null);
  const [notice, setNotice] = useState('');
  const query = useQuery({ queryKey: ['projects', 'opportunities', search], queryFn: () => api<Opportunity[]>(`/projects?search=${encodeURIComponent(search)}`) });
  const draftMutation = useMutation({
    mutationFn: (id: string) => api<BidDraft>(`/projects/${encodeURIComponent(id)}/draft`, jsonRequest('POST')),
    onSuccess: (draft) => { setSelectedDraft(draft); queryClient.invalidateQueries({ queryKey: ['pipeline'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); setNotice('Draf lokal dibuat. Periksa fakta dan harga sebelum simulasi.'); },
    onError: (error: Error) => setNotice(error.message),
  });
  const updateDraft = useMutation({
    mutationFn: (input: { id: string; proposal: string; proposedPrice: number }) => api<BidDraft>(`/drafts/${encodeURIComponent(input.id)}`, jsonRequest('PUT', { proposal: input.proposal, proposedPrice: input.proposedPrice })),
    onSuccess: (draft) => { setSelectedDraft(draft); queryClient.invalidateQueries({ queryKey: ['pipeline'] }); setNotice('Draf tersimpan di ruang kerja lokal.'); },
  });

  useEffect(() => {
    if (!initialProject || !query.data) return;
    const project = query.data.find((item) => item.id === initialProject);
    if (project && !selectedDraft) draftMutation.mutate(project.id);
    navigate('/opportunities', { replace: true });
  }, [initialProject, query.data]);

  if (query.isPending) return <LoadingPanel />;
  if (query.isError) return <ErrorNotice message="Peluang belum dapat dimuat." onRetry={() => query.refetch()} />;
  return <>
    <PageIntro eyebrow="Antrean peluang" title="Pilih pekerjaan dengan alasan yang bisa dijelaskan." description="Skor hanya memberi konteks. Setiap sumber, batas, dan ketidakpastian tetap terlihat sebelum draf disiapkan." />
    <section className="filter-bar" aria-label="Filter peluang">
      <label className="search-field"><span>Cari judul, teknologi, atau brief</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Contoh: TypeScript" /></label>
      <div className="filter-note"><strong>{query.data.length}</strong> peluang lokal tersedia <span>Semua ditandai sebagai data contoh</span></div>
    </section>
    {notice && <div className="notice notice-success" role="status">{notice}</div>}
    <div className="opportunity-list">
      {query.data.length === 0 && <div className="empty-state"><h3>Tidak ada peluang yang cocok</h3><p>Ubah kata pencarian untuk melihat peluang contoh lainnya.</p></div>}
      {query.data.map((project) => (
        <article className="opportunity-row" key={project.id}>
          <div className="opportunity-topline"><span className="eyebrow">{project.clientName} / CONTOH LOKAL</span><span className="score-mark"><strong>{project.score}</strong><small>skor kecocokan</small></span></div>
          <h2>{project.title}</h2>
          <p className="opportunity-description">{project.description}</p>
          <div className="tag-row">{project.skills.map((skill) => <span className="skill-tag" key={skill}>{skill}</span>)}</div>
          <div className="factor-list" aria-label="Alasan skor">
            {project.factors.map((factor) => <span key={factor.key}><small>{factor.label}</small><strong>{factor.value}</strong></span>)}
          </div>
          <div className="opportunity-footer"><div><strong>{formatMoney(project.budgetMin, project.currency)} - {formatMoney(project.budgetMax, project.currency)}</strong><span>Tenggat {project.deadlineDays} hari / brief {Math.round(project.briefQuality * 100)}%</span></div><button className="button button-primary" type="button" disabled={draftMutation.isPending} onClick={() => draftMutation.mutate(project.id)}>Buat draf lokal</button></div>
        </article>
      ))}
    </div>
    {selectedDraft && <DraftDialog
      draft={selectedDraft}
      saving={updateDraft.isPending}
      onClose={() => setSelectedDraft(null)}
      onSave={(proposal, proposedPrice) => updateDraft.mutate({ id: selectedDraft.id, proposal, proposedPrice })}
      onSimulate={async (proposal, proposedPrice) => {
        try {
          const saved = await api<BidDraft>(`/drafts/${encodeURIComponent(selectedDraft.id)}`, jsonRequest('PUT', { proposal, proposedPrice }));
          setSelectedDraft(saved);
          const result = await api<{ decision: { allowed: boolean; reason: string }; externalWrites: false }>('/projects/' + encodeURIComponent(saved.projectId) + '/simulate-submit', jsonRequest('POST'));
          setNotice(result.externalWrites ? 'Aksi eksternal tidak diizinkan.' : `${result.decision.allowed ? 'Simulasi dicatat' : 'Simulasi dilewati'}: ${result.decision.reason}`);
          queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['activity'] });
        } catch (error) { setNotice(error instanceof Error ? error.message : 'Simulasi tidak berhasil.'); }
      }}
    />}
  </>;
}

function DraftDialog({ draft, saving, onClose, onSave, onSimulate }: {
  draft: BidDraft; saving: boolean; onClose: () => void;
  onSave: (proposal: string, proposedPrice: number) => void;
  onSimulate: (proposal: string, proposedPrice: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [proposal, setProposal] = useState(draft.proposal);
  const [price, setPrice] = useState(String(draft.proposedPrice));
  useEffect(() => { setProposal(draft.proposal); setPrice(String(draft.proposedPrice)); }, [draft.id]);
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
  const parsedPrice = Number(price);
  const dirty = proposal !== draft.proposal || parsedPrice !== draft.proposedPrice;
  return <dialog className="draft-dialog" ref={dialog} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose} aria-labelledby="draft-title">
    <div className="dialog-heading"><div><p className="eyebrow">Proposal draft / lokal</p><h2 id="draft-title">Periksa sebelum simulasi</h2></div><button className="close-button" type="button" onClick={onClose} aria-label="Tutup draf">Tutup</button></div>
    <p className="dialog-caution">Draf ini belum dikirim. Simulasi hanya menguji policy dan menulis jejak audit lokal.</p>
    <label className="form-field"><span>Isi proposal</span><textarea rows={9} value={proposal} onChange={(event) => setProposal(event.target.value)} /></label>
    <div className="draft-meta">
      <label className="form-field"><span>Harga usulan ({draft.currency})</span><input type="number" min="1" step="1" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      <div><span>Keyakinan</span><strong>{Math.round(draft.confidence * 100)}%</strong></div>
      <div><span>Durasi awal</span><strong>{draft.durationDays} hari</strong></div>
    </div>
    <div className="evidence-note"><strong>Sumber fakta</strong>{draft.evidence.length ? <ul>{draft.evidence.map((item) => <li key={`${item.label}-${item.source}`}>{item.label} / {item.source}</li>)}</ul> : <p>Belum ada fakta profil. Draf tidak membuat klaim pengalaman.</p>}</div>
    <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onClose}>Tutup</button><button className="button button-secondary" type="button" disabled={saving || !dirty || proposal.trim().length < 40 || !Number.isFinite(parsedPrice) || parsedPrice <= 0} onClick={() => onSave(proposal, parsedPrice)}>Simpan perubahan</button><button className="button button-primary" type="button" disabled={saving || proposal.trim().length < 40 || !Number.isFinite(parsedPrice) || parsedPrice <= 0} onClick={() => onSimulate(proposal, parsedPrice)}>Uji keputusan policy</button></div>
  </dialog>;
}

function PipelinePage() {
  const query = useQuery({ queryKey: ['pipeline'], queryFn: () => api<Array<Opportunity & { latestDraft: BidDraft | null }>>('/pipeline') });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError) return <ErrorNotice message="Pipeline belum dapat dimuat." onRetry={() => query.refetch()} />;
  const projects = query.data;
  return <>
    <PageIntro eyebrow="Pipeline bid" title="Status yang tersimpan, bukan dugaan." description="Simulasi tidak mengubah status menjadi terkirim. Status itu hanya dibuat setelah adapter marketplace mengonfirmasi hasil." />
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
  const client = useQueryClient();
  const policyQuery = useQuery({ queryKey: ['policy'], queryFn: () => api<Policy>('/policy') });
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/profile') });
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { if (policyQuery.data && !policy) setPolicy(policyQuery.data); }, [policyQuery.data]);
  const save = useMutation({
    mutationFn: (value: Policy) => api<Policy>('/policy', jsonRequest('PUT', {
      allowedActions: value.allowedActions, keywords: value.keywords, minimumConfidence: value.minimumConfidence,
      minPrice: value.minPrice, maxPrice: value.maxPrice, dailyBidLimit: value.dailyBidLimit, weeklyBidLimit: value.weeklyBidLimit,
      timezone: value.timezone, activeHours: value.activeHours, noNegotiationTerms: value.noNegotiationTerms,
    })),
    onSuccess: (value) => { setPolicy(value); client.setQueryData(['policy'], value); setConsent(false); setNotice('Batas tersimpan sebagai draf. Aktifkan satu kali untuk menjalankan simulasi lokal.'); client.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (error: Error) => setNotice(error.message),
  });
  const activate = useMutation({
    mutationFn: () => api<{ policy: Policy }>('/policy/activate', jsonRequest('POST', { confirmSimulation: true })),
    onSuccess: (value) => { setPolicy(value.policy); client.setQueryData(['policy'], value.policy); setConsent(false); setNotice('Kebijakan simulasi lokal aktif. Tidak ada tindakan marketplace yang diaktifkan.'); client.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (error: Error) => setNotice(error.message),
  });
  if (policyQuery.isPending || profileQuery.isPending || !policy) return <LoadingPanel label="Memuat batas operasi..." />;
  if (policyQuery.isError || profileQuery.isError) return <ErrorNotice message="Kebijakan belum dapat dimuat." onRetry={() => { policyQuery.refetch(); profileQuery.refetch(); }} />;

  const updateList = (key: 'keywords' | 'noNegotiationTerms', value: string) => setPolicy({ ...policy, [key]: value.split(',').map((item) => item.trim()).filter(Boolean) });
  const savePolicy = (event: FormEvent) => { event.preventDefault(); save.mutate(policy); };
  const policyHasUnsavedChanges = JSON.stringify(policy) !== JSON.stringify(policyQuery.data);

  return <>
    <PageIntro eyebrow="Policy engine" title="Aturan berjalan sebelum setiap simulasi." description="Satu persetujuan kebijakan mengatur harga, bidang, keyakinan, frekuensi, jam kerja, dan kill switch. Aplikasi ini hanya menjalankan simulasi lokal." action={<StateLabel state={policy.state} />} />
    {notice && <div className="notice notice-success" role="status">{notice}</div>}
    <div className="capability-warning"><strong>Marketplace write: unknown</strong><p>Endpoint dan sandbox Freelancer belum dapat diverifikasi. Bid, pesan, dan perubahan profil eksternal tetap nonaktif meskipun kebijakan simulasi diaktifkan.</p></div>
    <form className="policy-form" onSubmit={savePolicy}>
      <section className="form-card"><div className="section-heading"><div><p className="eyebrow">Cakupan tindakan</p><h2>Yang boleh diuji</h2></div></div>
        <label className="check-row check-row-emphasis"><input type="checkbox" checked={policy.allowedActions.includes('bid.submit')} onChange={(event) => setPolicy({ ...policy, allowedActions: event.target.checked ? ['bid.submit'] : [] })} /><span>Memeriksa bid simulasi berdasarkan policy</span></label>
        <p className="form-help">Ini tidak mengirim bid. Aksi eksternal tetap manual-only sampai capability resmi berubah menjadi supported.</p>
        <div className="form-grid"><label className="form-field"><span>Kata kunci peluang, pisahkan dengan koma</span><input value={policy.keywords.join(', ')} onChange={(event) => updateList('keywords', event.target.value)} placeholder="TypeScript, API" /></label><label className="form-field"><span>Topik yang tidak dinegosiasikan</span><input value={policy.noNegotiationTerms.join(', ')} onChange={(event) => updateList('noNegotiationTerms', event.target.value)} placeholder="Topik yang harus dilewati" /></label></div>
      </section>
      <section className="form-card"><div className="section-heading"><div><p className="eyebrow">Batas angka</p><h2>Harga, keyakinan, dan frekuensi</h2></div></div>
        <div className="form-grid form-grid-three"><label className="form-field"><span>Harga minimum (USD)</span><input type="number" min="0" value={policy.minPrice} onChange={(event) => setPolicy({ ...policy, minPrice: Number(event.target.value) })} /></label><label className="form-field"><span>Harga maksimum (USD)</span><input type="number" min="0" value={policy.maxPrice} onChange={(event) => setPolicy({ ...policy, maxPrice: Number(event.target.value) })} /></label><label className="form-field"><span>Confidence minimum (%)</span><input type="number" min="50" max="100" value={Math.round(policy.minimumConfidence * 100)} onChange={(event) => setPolicy({ ...policy, minimumConfidence: Number(event.target.value) / 100 })} /></label><label className="form-field"><span>Batas per hari</span><input type="number" min="0" max="50" value={policy.dailyBidLimit} onChange={(event) => setPolicy({ ...policy, dailyBidLimit: Number(event.target.value) })} /></label><label className="form-field"><span>Batas per minggu</span><input type="number" min="0" max="200" value={policy.weeklyBidLimit} onChange={(event) => setPolicy({ ...policy, weeklyBidLimit: Number(event.target.value) })} /></label><label className="form-field"><span>Zona waktu</span><input value={policy.timezone} onChange={(event) => setPolicy({ ...policy, timezone: event.target.value })} /></label><label className="form-field"><span>Jam mulai</span><input type="number" min="0" max="23" value={policy.activeHours.start} onChange={(event) => setPolicy({ ...policy, activeHours: { ...policy.activeHours, start: Number(event.target.value) } })} /></label><label className="form-field"><span>Jam selesai</span><input type="number" min="1" max="24" value={policy.activeHours.end} onChange={(event) => setPolicy({ ...policy, activeHours: { ...policy.activeHours, end: Number(event.target.value) } })} /></label></div>
        <p className="form-help">Harga mata uang mengikuti profil layanan. Bid di luar bidang dan spesialisasi aktif akan dilewati.</p>
      </section>
      <section className="form-card confirmation-card"><div className="section-heading"><div><p className="eyebrow">Persetujuan sekali</p><h2>Aktifkan simulasi lokal</h2></div><StateLabel state={policy.state} /></div>
        <p className="form-help">Bidang utama: <strong>{profileQuery.data?.primaryField || 'belum diatur'}</strong>. Spesialisasi aktif: <strong>{profileQuery.data?.specializations.join(', ') || 'belum diatur'}</strong>.</p>
        <label className="check-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Saya mengaktifkan policy ini untuk simulasi lokal dan memahami bahwa tidak ada tindakan marketplace yang dikirim.</span></label>
        <div className="form-actions"><button className="button button-secondary" type="submit" disabled={save.isPending}>{save.isPending ? 'Menyimpan...' : 'Simpan batas'}</button><button className="button button-primary" type="button" disabled={!consent || policyHasUnsavedChanges || activate.isPending} onClick={() => activate.mutate()}>{activate.isPending ? 'Mengaktifkan...' : 'Aktifkan policy simulasi'}</button><span>{policyHasUnsavedChanges ? 'Simpan perubahan sebelum aktivasi.' : `Versi ${policy.version} / berlaku sampai ${new Date(policy.expiresAt).toLocaleDateString('id-ID')}`}</span></div>
      </section>
    </form>
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
      queryClient.invalidateQueries({ queryKey: ['knowledge'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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
  const query = useQuery({ queryKey: ['activity'], queryFn: () => api<AuditEvent[]>('/activity?limit=100') });
  if (query.isPending) return <LoadingPanel label="Membaca jejak aktivitas..." />;
  if (query.isError) return <ErrorNotice message="Log aktivitas belum dapat dimuat." onRetry={() => query.refetch()} />;
  return <><PageIntro eyebrow="Audit log" title="Setiap keputusan meninggalkan jejak yang dapat dibaca." description="Log menyimpan waktu, versi policy, alasan allow/skip, serta hash payload. Isi rahasia dan token tidak dicatat." /><section className="activity-section"><ActivityRows events={query.data} /></section></>;
}

function CapabilitiesPage() {
  const query = useQuery({ queryKey: ['capabilities'], queryFn: () => api<{
    marketplace: Array<{ operation: string; status: string; evidence: string }>;
    freelancerCredentials: { accessTokenConfigured: boolean };
    github: { read: string; scope: string; tokenConfigured: boolean };
    linkedin: { read: string; reason: string; clientConfigured: boolean };
    opencode: { draft: string; active: boolean; reason: string };
  }>('/capabilities') });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError) return <ErrorNotice message="Status integrasi belum dapat dimuat." onRetry={() => query.refetch()} />;
  return <><PageIntro eyebrow="Koneksi dan capability" title="Status provider sesuai bukti yang tersedia." description="Aplikasi tidak menganggap endpoint, scope, sandbox, atau izin tersedia sebelum diverifikasi." /><div className="capability-grid"><section className="form-card"><div className="section-heading"><div><p className="eyebrow">Freelancer.com</p><h2>Capability marketplace</h2></div></div>{query.data.marketplace.map((item) => <div className="capability-row" key={item.operation}><div><strong>{item.operation.replaceAll('_', ' ')}</strong><p>{item.evidence}</p></div><StateLabel state={item.status} /></div>)}<p className="provider-limit">Token API {query.data.freelancerCredentials.accessTokenConfigured ? 'tersimpan terenkripsi untuk akun Windows ini' : 'belum diatur'}. Semua request marketplace tetap nonaktif sampai capability API diverifikasi.</p></section><section className="form-card"><div className="section-heading"><div><p className="eyebrow">Sumber lain</p><h2>Knowledge dan drafting</h2></div></div><div className="capability-row"><div><strong>GitHub</strong><p>{query.data.github.scope}; mode read-only. Token server {query.data.github.tokenConfigured ? 'diatur' : 'belum diatur'}.</p></div><StateLabel state="active" /></div><div className="capability-row"><div><strong>LinkedIn</strong><p>{query.data.linkedin.reason} Kredensial aplikasi {query.data.linkedin.clientConfigured ? 'tersimpan terenkripsi untuk akun Windows ini' : 'belum diatur'}; OAuth/API belum aktif.</p></div><StateLabel state="draft" /></div><div className="capability-row"><div><strong>OpenCode CLI</strong><p>{query.data.opencode.reason}</p></div><StateLabel state="draft" /></div></section></div></>;
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
    { name: 'Lobby', to: '/', role: 'Chief of staff', note: `${query.data.counts.openProjects} peluang contoh / ringkasan ruang kerja` },
    { name: 'Sales & Bids', to: '/opportunities', role: 'Market scout / bid strategist', note: `${query.data.counts.openProjects} peluang / ${query.data.counts.drafts} draf lokal` },
    { name: 'Profile Studio', to: '/profile', role: 'Profile editor', note: query.data.profileComplete ? 'Bidang dan spesialisasi sudah diisi' : 'Profil layanan belum diatur' },
    { name: 'Client Relations', to: '/pipeline', role: 'Client relations', note: 'Pipeline lokal / akses pesan marketplace manual-only' },
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
