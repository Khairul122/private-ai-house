import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type BidDraft, type Opportunity } from '../api/api.js';
import { useSourceFilter, SourceSelect, matchesSource, projectLink, opportunitySource } from '../components/source-filter.js';
import { StateLabel, ErrorNotice, LoadingPanel, PageIntro, Metric } from '../components/ui.js';
import { formatMoney, PIPELINE_STAGES } from '../components/format.js';

export default function PipelinePage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [source, setSource] = useSourceFilter();
  const [shown, setShown] = useState(30);
  const query = useQuery({ queryKey: ['pipeline'], queryFn: () => api<Array<Opportunity & { latestDraft: BidDraft | null }>>('/pipeline'), refetchInterval: 10_000 });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError) return <ErrorNotice message="Pipeline belum dapat dimuat." onRetry={() => query.refetch()} />;
  const projects = query.data;
  const visible = projects.filter((project) => matchesSource(source, project.source) && (filter === 'all' || project.pipelineStatus === filter) && `${project.title} ${project.clientName}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <PageIntro eyebrow="Pipeline bid" title="Pipeline penawaran" description="Bid Freelancer dikonfirmasi marketplace. Penandaan projects.co.id berasal dari konfirmasi Anda dan belum diverifikasi aplikasi." />
    <section className="card-summary-grid" aria-label="Ringkasan seluruh pipeline">
      <Metric label="Draf lokal" value={projects.filter(project => project.latestDraft).length} note="Proposal tersimpan, termasuk yang sudah diproses" />
      <Metric label="Terkirim Freelancer" value={projects.filter(project => project.source === 'freelancer' && project.pipelineStatus === 'submitted').length} note="Tahap terkirim, dikonfirmasi marketplace" />
      <Metric label="Ditandai terkirim oleh Anda" value={projects.filter(project => project.source === 'projects_co_id' && project.pipelineStatus === 'submitted').length} note="projects.co.id; belum diverifikasi aplikasi" />
    </section>
    <div className="form-grid"><label className="form-field"><span>Cari judul atau klien</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setShown(30); }} /></label><label className="form-field"><span>Tahap pipeline</span><select value={filter} onChange={(event) => { setFilter(event.target.value); setShown(30); }}><option value="all">Semua tahap</option>{[...new Set(projects.map((project) => project.pipelineStatus))].map((stage) => <option key={stage} value={stage}>{PIPELINE_STAGES.find(([key]) => key === stage)?.[1] ?? stage}</option>)}</select></label><SourceSelect value={source} onChange={next => { setSource(next); setShown(30); }} /></div>
    <p className="form-help">{visible.length} proyek sesuai filter</p>{visible.length === 0 && <div className="empty-state"><h3>Tidak ada proyek sesuai filter</h3><p>Ubah pencarian atau tahap pipeline.</p></div>}
    <div className="pipeline-list">{visible.slice(0, shown).map((project) => (
      <article className="pipeline-row" key={project.id}>
        <div><p className="eyebrow">{project.clientName} / {opportunitySource(project.source)}</p><h2><Link to={projectLink(project)}>{project.title}</Link></h2><p>{project.latestDraft ? project.latestDraft.proposal.slice(0, 180) : 'Belum ada proposal tersimpan. Buka detail untuk meninjau peluang.'}</p></div>
        <div className="pipeline-state"><StateLabel state={project.pipelineStatus} source={project.source} /><strong>{project.latestDraft ? formatMoney(project.latestDraft.proposedPrice, project.latestDraft.currency) : 'Harga belum tersedia'}</strong></div>
        <Link to={projectLink(project)} className="button button-secondary">{project.latestDraft ? 'Lihat draf dan detail' : 'Lihat peluang'}</Link>
      </article>
    ))}</div>
    {visible.length > shown && <button className="button button-secondary" type="button" onClick={() => setShown(shown + 30)}>Tampilkan 30 proyek berikutnya</button>}
  </>;
}
