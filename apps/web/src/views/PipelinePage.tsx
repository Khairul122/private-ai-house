import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type BidDraft, type Insights, type Opportunity } from '../api/api.js';
import { useSourceFilter, SourceSelect, matchesSource, projectLink, opportunitySource } from '../components/source-filter.js';
import { StateLabel, EmptyState, ErrorNotice, LoadingPanel, PageIntro, Metric } from '../components/ui.js';
import { formatDate, formatMoney, PIPELINE_STAGES } from '../components/format.js';

const PAGE_SIZE = 30;

export default function PipelinePage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [source, setSource] = useSourceFilter();
  const [shown, setShown] = useState(PAGE_SIZE);
  const query = useQuery({ queryKey: ['pipeline'], queryFn: () => api<Array<Opportunity & { latestDraft: BidDraft | null }>>('/pipeline'), refetchInterval: 10_000 });
  const insights = useQuery({ queryKey: ['insights'], queryFn: () => api<Insights>('/insights/bids'), refetchInterval: 60_000 });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError) return <ErrorNotice message="Pipeline belum dapat dimuat. Data lama tidak ditampilkan." onRetry={() => query.refetch()} />;
  const projects = query.data;
  const stageLabel = (stage: string) => PIPELINE_STAGES.find(([key]) => key === stage)?.[1] ?? stage;
  const term = search.trim().toLowerCase();
  const visible = projects.filter((project) => matchesSource(source, project.source) && (filter === 'all' || project.pipelineStatus === filter) && `${project.title} ${project.clientName}`.toLowerCase().includes(term));
  const remaining = Math.max(0, visible.length - shown);
  const filtered = filter !== 'all' || source !== 'all' || term.length > 0;
  const resetFilters = () => { setFilter('all'); setSearch(''); setSource('all'); setShown(PAGE_SIZE); };
  const analytics = insights.isError ? undefined : insights.data?.analytics;
  const percent = (rate: number | null) => rate === null ? 'Belum tersedia' : `${Math.round(rate * 100)}%`;

  return <>
    <PageIntro eyebrow="Pipeline bid" title="Pipeline penawaran" description="Bid Freelancer dikonfirmasi marketplace. Penandaan projects.co.id berasal dari konfirmasi Anda dan belum diverifikasi aplikasi." />
    <section className="card-summary-grid" aria-label="Ringkasan seluruh pipeline" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 12rem), 1fr))' }}>
      <Metric label="Draf lokal" value={projects.filter((project) => project.latestDraft).length} note="Proposal tersimpan, termasuk yang sudah diproses" />
      <Metric label="Terkirim Freelancer" value={projects.filter((project) => project.source === 'freelancer' && project.pipelineStatus === 'submitted').length} note="Dikonfirmasi marketplace" />
      <Metric label="Ditandai terkirim oleh Anda" value={projects.filter((project) => project.source === 'projects_co_id' && project.pipelineStatus === 'submitted').length} note="projects.co.id, belum diverifikasi aplikasi" tone="primary" />
    </section>
    <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))' }}>
      <label className="form-field"><span>Cari judul atau klien</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setShown(PAGE_SIZE); }} /></label>
      <label className="form-field"><span>Tahap pipeline</span><select value={filter} onChange={(event) => { setFilter(event.target.value); setShown(PAGE_SIZE); }}><option value="all">Semua tahap</option>{[...new Set(projects.map((project) => project.pipelineStatus))].map((stage) => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}</select></label>
      <SourceSelect value={source} onChange={(next) => { setSource(next); setShown(PAGE_SIZE); }} />
    </div>
    <p className="form-help" role="status" aria-live="polite">
      {visible.length === 0 ? `Tidak ada proyek cocok dari ${projects.length} proyek.` : `Menampilkan ${Math.min(shown, visible.length)} dari ${visible.length} proyek sesuai filter${filtered ? `, total ${projects.length} proyek` : ''}.`}
    </p>
    {visible.length === 0 && (projects.length === 0
      ? <EmptyState title="Belum ada proyek di pipeline" description="Pipeline terisi setelah pemindaian proyek berhasil. Periksa integrasi dan status operasi untuk langkah berikutnya." action={<><Link to="/opportunities" className="button button-secondary">Buka peluang</Link><Link to="/capabilities" className="button button-secondary">Periksa integrasi</Link></>} />
      : <EmptyState title="Tidak ada proyek yang cocok dengan filter" description="Filter saat ini tidak menemukan judul, klien, tahap, atau sumber yang sesuai. Hapus filter untuk melihat seluruh pipeline." action={<button className="button button-secondary" type="button" onClick={resetFilters}>Hapus semua filter</button>} />)}
    <div className="pipeline-list">{visible.slice(0, shown).map((project) => (
      <article className="pipeline-row pipeline-card" key={project.id}>
        <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <div className="pipeline-meta"><span className="pipeline-id">ID: {project.id}</span><span className="pipeline-source">{opportunitySource(project.source)}</span><span className="pipeline-date">{formatDate(project.createdAt || project.latestDraft?.createdAt || '')}</span></div><p className="eyebrow">{project.clientName} / {opportunitySource(project.source)}</p>
          <h2><Link to={projectLink(project)}>{project.title}</Link></h2>
          <p>{project.latestDraft ? project.latestDraft.proposal.slice(0, 180) : 'Belum ada proposal tersimpan. Buka detail untuk meninjau peluang.'}</p>
        </div>
        <div className="pipeline-state">
          <StateLabel state={project.pipelineStatus} source={project.source} />
          <strong>{project.latestDraft ? formatMoney(project.latestDraft.proposedPrice, project.latestDraft.currency) : 'Harga belum tersedia'}</strong>
        </div>
        <Link to={projectLink(project)} className="button button-secondary">{project.latestDraft ? 'Lihat draf dan detail' : 'Lihat peluang'}</Link>
      </article>
    ))}</div>
    {remaining > 0 && <button className="button button-secondary" type="button" onClick={() => setShown(shown + PAGE_SIZE)}>Tampilkan {Math.min(PAGE_SIZE, remaining)} proyek berikutnya, {remaining} tersisa</button>}
    <section className="activity-preview card-section" aria-labelledby="bid-results-title">
      <div className="section-heading">
        <div><p className="eyebrow">Bid Strategist</p><h2 id="bid-results-title">Hasil bid tersimpan</h2></div>
      </div>
      {insights.isPending && <LoadingPanel label="Membaca hasil bid tersimpan..." />}
      {insights.isError && <ErrorNotice message="Hasil bid tidak tersedia. Data lama tidak ditampilkan." onRetry={() => insights.refetch()} />}
      {analytics && (analytics.totals.submitted === 0
        ? <EmptyState title="Belum ada bid tersimpan" description="Ringkasan hasil muncul setelah ada bid tercatat dan hasilnya diperiksa dari marketplace." />
        : <>
          <div className="metrics-row">
            <Metric label="Bid tersimpan" value={analytics.totals.submitted} note={`${analytics.totals.pending} masih pending`} />
            <Metric label="Diputuskan" value={analytics.totals.decided} note={`${analytics.totals.won} menang, ${analytics.totals.lost} kalah`} />
            <Metric label="Tingkat kemenangan" value={percent(analytics.totals.winRate)} note={analytics.totals.winRate === null ? 'Belum ada bid diputuskan' : `Dari ${analytics.totals.decided} bid diputuskan`} tone={analytics.totals.winRate === null ? 'plain' : 'primary'} />
          </div>
          <p className="form-help">
            Periode data: {analytics.period.firstSubmittedAt ? `bid pertama ${formatDate(analytics.period.firstSubmittedAt)}` : 'bid pertama belum tercatat'}
            {analytics.period.lastCheckedAt ? `, pemeriksaan terakhir ${formatDate(analytics.period.lastCheckedAt)}` : ', hasil belum pernah diperiksa'}.
            {analytics.sample.sufficient ? '' : ` Sampel keputusan ${analytics.sample.decided} dari minimal ${analytics.sample.minimum}; angka ini belum cukup untuk menyimpulkan sebab-akibat.`}
          </p>
          {analytics.byPriceBand.length > 0 && <>
            <h3>Per rentang harga bid</h3>
            <ul className="deadlines-list">
              {analytics.byPriceBand.map((group) => <li className="deadline-item" key={`band-${group.key}`}>
                <div><strong>{group.key}</strong><div className="item-sub">{group.submitted} bid · {group.decided} diputuskan</div></div>
                <div className="item-aside"><strong>{percent(group.winRate)}</strong><div className="item-sub">{group.won} menang · {group.lost} kalah · {group.pending} pending</div></div>
              </li>)}
            </ul>
          </>}
          {analytics.byMonth.length > 0 && <>
            <h3>Per bulan pengiriman</h3>
            <ul className="deadlines-list">
              {analytics.byMonth.map((group) => <li className="deadline-item" key={`month-${group.key}`}>
                <div><strong>{monthLabel(group.key)}</strong><div className="item-sub">{group.submitted} bid · {group.decided} diputuskan</div></div>
                <div className="item-aside"><strong>{percent(group.winRate)}</strong><div className="item-sub">{group.won} menang · {group.lost} kalah · {group.pending} pending</div></div>
              </li>)}
            </ul>
          </>}
          <details className="card-disclosure">
            <summary>Batas data ({analytics.limitations.length})</summary>
            <ul className="message-intel-list">{analytics.limitations.map((line) => <li key={line}>{line}</li>)}</ul>
          </details>
        </>)}
    </section>
  </>;
}

/** "2026-10" → "Oktober 2026"; unknown keys are shown as stored rather than guessed. */
function monthLabel(key: string): string {
  const parsed = new Date(`${key}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return key;
  return parsed.toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
