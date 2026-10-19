import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { api, jsonRequest, type Autopilot, type BidDraft, type Opportunity } from '../api/api.js';
import { useSourceFilter, SourceSelect, matchesSource, projectLink, opportunitySource } from '../components/source-filter.js';
import { StateLabel, ErrorNotice, LoadingPanel, PageIntro } from '../components/ui.js';
import { formatMoney, formatDate } from '../components/format.js';

export default function OpportunitiesPage() {
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [source, setSource] = useSourceFilter();
  const [shown, setShown] = useState(20);
  const query = useQuery({ queryKey: ['projects', 'opportunities'], queryFn: () => api<Opportunity[]>('/projects'), refetchInterval: 30_000 });
  const autopilot = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 30_000 });
  useEffect(() => {
    const projectId = new URLSearchParams(location.search).get('project');
    if (!projectId || !query.data) return;
    const project = query.data.find((item) => item.id === projectId);
    if (project) document.getElementById('opportunity-' + project.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [location.search, query.data]);
  if (query.isPending) return <LoadingPanel />;
  if (query.isError) return <ErrorNotice message="Peluang belum dapat dimuat." onRetry={() => query.refetch()} />;
  const status = autopilot.isError ? undefined : autopilot.data;
  const selectedId = new URLSearchParams(location.search).get('project');
  if (selectedId) return <OpportunityDetail project={query.data.find((item) => item.id === selectedId)} />;
  const searchText = search.trim().toLowerCase();
  const visible = query.data.filter((project) => matchesSource(source, project.source) && (statusFilter === 'all' || project.status === statusFilter) && `${project.title} ${project.description} ${project.clientName} ${project.skills.join(' ')}`.toLowerCase().includes(searchText));
  return <>
    <PageIntro eyebrow="Antrean peluang" title="Peluang dipindai otomatis." description="Autopilot membaca pencarian yang cocok dengan profil Freelancer dan membuat bid tanpa form per proyek. Daftar ini diperbarui berkala." />
    <section className="filter-bar" aria-label="Filter peluang tersimpan">
      <label className="search-field"><span>Filter daftar lokal</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setShown(20); }} placeholder="Judul atau teknologi" /></label>
      <label className="form-field"><span>Status peluang</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setShown(20); }}><option value="open">Terbuka</option><option value="closed">Ditutup</option><option value="expired">Kedaluwarsa</option><option value="all">Semua status</option></select></label>
      <SourceSelect value={source} onChange={next => { setSource(next); setShown(20); }} />
      <div className="filter-note"><strong>{query.data.length}</strong> peluang tersimpan <span>{status?.lastRunAt ? 'Siklus terakhir ' + formatDate(status.lastRunAt) : 'Autopilot sedang menyiapkan siklus'}</span></div>
    </section>
    <section className="sync-panel form-card" aria-label="Status pemindaian otomatis Freelancer">
      <div className="section-heading"><div><p className="eyebrow">Freelancer.com</p><h2>Pemindaian otomatis</h2></div><StateLabel state={status?.state ?? 'unknown'} /></div>
      <p className="form-help">{autopilot.isError ? 'Status pemindaian tidak tersedia. Coba perbarui data.' : status?.lastMessage ?? 'Memuat status pemindaian dari server.'}</p>
      {status?.specializations.length ? <div className="tag-row">{status.specializations.map((skill) => <span className="skill-tag" key={skill}>{skill}</span>)}</div> : null}
      <div className="autopilot-metrics"><span>{status?.lastImported ?? 'Tidak diketahui'} proyek terakhir dipindai</span><span>{status?.lastSubmitted ?? 'Tidak diketahui'} bid dikirim pada siklus terakhir</span><span>{status?.nextRunAt ? 'Pindai lagi ' + formatDate(status.nextRunAt) : 'Jadwal berikutnya belum tersedia'}</span></div>
    </section>
    <div className="opportunity-list">
      {visible.length === 0 && <div className="empty-state"><h3>Tidak ada peluang sesuai filter</h3><p>Ubah pencarian atau status peluang. Daftar diperbarui pada siklus berikutnya.</p></div>}
      {visible.slice(0, shown).map((project) => (
        <article className="opportunity-row" id={'opportunity-' + project.id} key={project.id}>
          <div className="opportunity-topline"><span className="eyebrow">{project.clientName} / {opportunitySource(project.source)}</span><span className="score-mark"><strong>{project.score}</strong><small>skor kecocokan</small></span></div>
          <h2><Link to={`/opportunities?project=${encodeURIComponent(project.id)}`}>{project.title}</Link></h2>
          <p className="opportunity-description">{project.description}</p>
          <div className="tag-row">{project.skills.map((skill) => <span className="skill-tag" key={skill}>{skill}</span>)}</div>
          <div className="factor-list" aria-label="Alasan skor">{project.factors.map((factor) => <span key={factor.key}><small>{factor.label}</small><strong>{factor.value}</strong></span>)}</div>
          <div className="opportunity-footer"><div><strong>{formatMoney(project.budgetMin, project.currency)} - {formatMoney(project.budgetMax, project.currency)}</strong><span>{project.deadlineDays === null ? 'Deadline tidak diberikan; proposal menetapkan durasi 14 hari' : 'Sisa ' + project.deadlineDays + ' hari'} / brief {Math.round(project.briefQuality * 100)}%</span></div><StateLabel state={project.pipelineStatus} source={project.source} /></div>
        </article>
      ))}
    </div>
    {visible.length > shown && <button className="button button-secondary" type="button" onClick={() => setShown(shown + 20)}>Tampilkan {Math.min(20, visible.length - shown)} peluang berikutnya ({visible.length - shown} tersisa)</button>}
  </>;
}

function OpportunityDetail({ project }: { project: Opportunity | undefined }) {
  const back = <Link to="/opportunities" className="button button-secondary opp-back">← Semua peluang</Link>;
  if (!project) return <>{back}<div className="empty-state"><h3>Peluang tidak ditemukan</h3><p>Proyek ini mungkin sudah dihapus dari daftar tersimpan.</p></div></>;
  const fixed = project.projectType === 'hourly' ? 'Per jam' : project.projectType === 'fixed' ? 'Harga tetap' : 'Tipe tidak diketahui';
  const facts: Array<[string, string]> = [
    ['Budget', formatMoney(project.budgetMin, project.currency) + ' – ' + formatMoney(project.budgetMax, project.currency)],
    ['Tipe', fixed],
    ['Sisa waktu', project.deadlineDays === null ? 'Tidak diberikan (durasi bid 14 hari)' : project.deadlineDays + ' hari'],
    ['Klien', project.clientName],
    ['Kualitas brief', Math.round(project.briefQuality * 100) + '%'],
    ['Risiko', Math.round(project.riskScore * 100) + '%'],
    ['Sumber', opportunitySource(project.source)],
  ];
  return <article className="opp-detail">
    {back}
    <header className="opp-head">
      <div><p className="eyebrow">{project.clientName}</p><h2>{project.title}</h2></div>
      <div className="opp-score"><strong>{project.score}</strong><small>skor kecocokan</small></div>
    </header>
    <div className="opp-status"><StateLabel state={project.pipelineStatus} source={project.source} /></div>
    <dl className="opp-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <section><h3>Deskripsi</h3><p className="opp-description">{project.description}</p></section>
    <section><h3>Skill dibutuhkan</h3><div className="tag-row">{project.skills.map((skill) => <span className="skill-tag" key={skill}>{skill}</span>)}</div></section>
    <section><h3>Alasan skor</h3><ul className="opp-factors">{project.factors.map((factor) => <li key={factor.key}><span>{factor.label}</span><strong>{factor.value}</strong><em>{factor.points > 0 ? '+' : ''}{factor.points}</em></li>)}</ul></section>
    {project.source === 'projects_co_id' ? <Link className="button button-primary" to={projectLink(project)}>Buka di kartu projects.co.id</Link> : <ProposalPanel key={project.id} project={project} />}
  </article>;
}

function ProposalPanel({ project }: { project: Opportunity }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['draft', project.id], queryFn: () => api<{ draft: BidDraft | null }>(`/projects/${encodeURIComponent(project.id)}/draft`) });
  const [text, setText] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const refresh = () => { client.invalidateQueries({ queryKey: ['draft', project.id] }); client.invalidateQueries({ queryKey: ['pipeline'] }); client.invalidateQueries({ queryKey: ['projects'] }); };
  const create = useMutation({ mutationFn: () => api<BidDraft>(`/projects/${encodeURIComponent(project.id)}/draft`, jsonRequest('POST')), onSuccess: (draft) => { client.setQueryData(['draft', project.id], { draft }); setText(null); setPrice(null); setNotice('Draf tersimpan; tidak ada bid yang dikirim.'); refresh(); } });
  const draft = query.isError ? null : query.data?.draft;
  const save = useMutation({ mutationFn: () => api<BidDraft>(`/drafts/${encodeURIComponent(draft!.id)}`, jsonRequest('PUT', { proposal: text ?? draft!.proposal, proposedPrice: price ?? draft!.proposedPrice })), onSuccess: (draft) => { client.setQueryData(['draft', project.id], { draft }); setText(null); setPrice(null); setNotice('Perubahan draf tersimpan.'); refresh(); } });
  const locked = ['submitted', 'in_conversation', 'won', 'lost', 'reconciliation_required'].includes(project.pipelineStatus);
  return <section className="form-card proposal-panel"><h3>Proposal tersimpan</h3>
    {notice && <p className="notice notice-success" role="status">{notice}</p>}
    {(create.isError || save.isError) && <ErrorNotice message={(create.error ?? save.error)?.message ?? 'Draf tidak dapat diproses.'} />}
    {query.isPending ? <LoadingPanel label="Membaca proposal..." /> : query.isError ? <ErrorNotice message="Proposal tidak dapat dimuat." onRetry={() => query.refetch()} /> : draft ? <>
      <p className="form-help">Dibuat {formatDate(draft.createdAt)}, durasi {draft.durationDays} hari. {locked ? 'Proposal ini terkait bid yang sudah diproses.' : 'Draf lokal tidak dikirim otomatis oleh autopilot.'}</p>
      <form className="stack-form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><label className="form-field"><span>Isi proposal</span><textarea rows={10} minLength={40} maxLength={4000} required readOnly={locked} value={text ?? draft.proposal} onChange={(event) => setText(event.target.value)} /></label><label className="form-field"><span>Harga ({draft.currency})</span><input type="number" required min="0.01" step="any" readOnly={locked} value={price ?? draft.proposedPrice} onChange={(event) => setPrice(Number(event.target.value))} /></label>{!locked && <button type="submit" className="button button-primary" disabled={save.isPending || (text === null && price === null)}>{save.isPending ? 'Menyimpan…' : 'Simpan perubahan draf'}</button>}</form>
      <details><summary>Bukti dan asumsi</summary><ul>{draft.evidence.map((item, index) => <li key={index}>{item.label}: {item.source}</li>)}{draft.assumptions.map((item, index) => <li key={`assumption-${index}`}>{item}</li>)}</ul></details>
    </> : <><p>Belum ada proposal tersimpan. Membuat draf manual akan membuat autopilot melewati proyek ini.</p><button className="button button-secondary" type="button" disabled={create.isPending || locked || project.status !== 'open'} onClick={() => create.mutate()}>{create.isPending ? 'Hermes sedang menulis…' : 'Buat draf manual dengan Hermes'}</button></>}
  </section>;
}
