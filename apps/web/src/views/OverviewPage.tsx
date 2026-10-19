import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type AuditEvent, type Autopilot, type BidDraft, type Insights, type Opportunity, type Policy } from '../api/api.js';
import { StateLabel, ErrorNotice, LoadingPanel, PageIntro, Metric, ActivityRows, OperationStatus } from '../components/ui.js';
import { formatMoney, formatDate, PIPELINE_STAGES } from '../components/format.js';

export default function OverviewPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => api<{
    mode: string; counts: { openProjects: number; drafts: number; submittedBids: number; policySkips: number; knowledgeSources: number };
    policy: { state: Policy['state']; version: number; simulationOnly: boolean }; profileComplete: boolean;
    projects: Opportunity[]; activity: AuditEvent[]; externalWrites: boolean;
  }>('/dashboard') });
  const projects = useQuery({ queryKey: ['projects', 'overview'], queryFn: () => api<Opportunity[]>('/projects') });
  const pipeline = useQuery({ queryKey: ['pipeline'], queryFn: () => api<Array<Opportunity & { latestDraft: BidDraft | null }>>('/pipeline') });
  const insights = useQuery({ queryKey: ['insights', 'bids'], queryFn: () => api<Insights>('/insights/bids'), refetchInterval: 60_000 });
  const operation = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 15_000 });

  if (query.isPending || projects.isPending) return <LoadingPanel />;
  if (query.isError || projects.isError) return <ErrorNotice message="Ringkasan belum dapat dimuat." onRetry={() => { queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['projects'] }); }} />;
  const data = query.data;

  return <>
    <PageIntro eyebrow={`${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date())} / ruang operasi`} title="Kerja yang baik dimulai dari konteks yang jelas." description="Autopilot memantau peluang Freelancer, menyusun penawaran, dan menjalankan batas operasi tersimpan." action={<Link to="/opportunities" className="button button-primary">Buka antrean peluang</Link>} />
    <OperationStatus data={operation.isError ? undefined : operation.data} unavailable={operation.isError} />
    <section className="metrics-row" aria-label="Ringkasan ruang kerja">
      <Metric label="Peluang terbuka" value={data.counts.openProjects} note="Dipindai otomatis" tone="primary" to="/opportunities" />
      <Metric label="Bid terkirim" value={data.counts.submittedBids} note="Dikonfirmasi Freelancer" to="/pipeline" />
      <Metric label="Sumber knowledge" value={data.counts.knowledgeSources} note="Fakta lokal yang bisa ditelusuri" to="/knowledge" />
      <Metric label="Keputusan dilewati" value={data.counts.policySkips} note="Alasan tersimpan di aktivitas" to="/activity" />
    </section>
    {insights.isPending && <LoadingPanel label="Memuat hasil bid..." />}
    {insights.isError && <ErrorNotice message="Hasil bid belum dapat dimuat." onRetry={() => insights.refetch()} />}
    {!insights.isError && insights.data && <section className="activity-preview" aria-labelledby="bid-results-title">
      <div className="section-heading"><div><p className="eyebrow">Hasil penawaran</p><h2 id="bid-results-title">Hasil bid</h2></div><Link to="/inbox" className="text-link">Kotak masuk</Link></div>
      <div className="metrics-row">
        <Metric label="Menang" value={insights.data.outcomes.won} note={`dari ${insights.data.outcomes.submitted} bid terkirim`} tone="primary" to="/pipeline" />
        <Metric label="Kalah" value={insights.data.outcomes.lost} note="Ditolak, dicabut, atau ditarik" />
        <Metric label="Menunggu" value={insights.data.outcomes.pending} note={`${insights.data.outcomes.withConversation} dengan percakapan klien`} to="/inbox" />
        <Metric label="Tingkat kemenangan" value={insights.data.outcomes.winRate === null ? '–' : `${Math.round(insights.data.outcomes.winRate * 100)}%`} note={insights.data.outcomes.winRate === null ? 'Belum ada bid yang diputuskan' : 'Menang ÷ (menang + kalah)'} />
      </div>
      <p className="form-help">{insights.data.lastCheck.ok === false ? `Pengecekan status bid gagal: ${insights.data.lastCheck.error ?? 'tidak diketahui'}` : insights.data.lastCheck.at ? `Status bid dicek dari Freelancer ${formatDate(insights.data.lastCheck.at)}.` : 'Status bid belum pernah dicek.'}</p>
    </section>}
    {!insights.isError && insights.data && <section className="activity-preview" aria-labelledby="skip-reasons-title">
      <div className="section-heading"><div><p className="eyebrow">{insights.data.skips.total} keputusan · {insights.data.skips.recent7d} dalam 7 hari</p><h2 id="skip-reasons-title">Kenapa peluang dilewati</h2></div><Link to="/policy" className="text-link">Tinjau kebijakan</Link></div>
      {insights.data.skips.reasons.length ? <ul className="reason-list">
        {insights.data.skips.reasons.slice(0, 5).map(({ reason, total, recent }) => <li className="reason-item" key={reason}>
          <div className="reason-text">{reason}</div>
          <div className="reason-meter" aria-hidden="true"><span style={{ width: Math.max(4, Math.round(total / Math.max(1, insights.data.skips.reasons[0]?.total ?? total) * 100)) + '%' }} /></div>
          <div className="item-aside"><strong>{total}</strong><small>{recent} dalam 7 hari</small></div>
        </li>)}
      </ul> : <p className="form-help">Belum ada peluang yang dilewati.</p>}
    </section>}
    {!pipeline.isError && pipeline.data && (
      <nav className="pipeline-overview-bar" aria-label="Ringkasan status pipeline">
        <span className="pipeline-overview-title">Distribusi pipeline</span>
        {PIPELINE_STAGES.map(([key, label]) => <Link className="pipeline-chip" to="/pipeline" key={key}><span>{label}</span><strong>{pipeline.data.filter((p) => p.pipelineStatus === key).length}</strong></Link>)}
      </nav>
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
