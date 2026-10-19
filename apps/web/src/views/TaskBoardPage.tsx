import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type BidDraft, type Opportunity } from '../api/api.js';
import HermesKanbanCard from '../components/HermesKanbanCard.js';
import { useSourceFilter, SourceSelect, matchesSource, projectLink, opportunitySource } from '../components/source-filter.js';
import { StateLabel, ErrorNotice, LoadingPanel, PageIntro } from '../components/ui.js';
import { formatMoney } from '../components/format.js';

const KANBAN_LIMIT = 12;

export default function TaskBoardPage() {
  const [filter, setFilter] = useState('');
  const [source, setSource] = useSourceFilter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pipeline = useQuery({ queryKey: ['pipeline'], queryFn: () => api<Array<Opportunity & { latestDraft: BidDraft | null }>>('/pipeline'), refetchInterval: 10_000 });

  if (pipeline.isPending) return <LoadingPanel label="Memuat papan tugas..." />;
  if (pipeline.isError) return <ErrorNotice message="Gagal memuat data papan tugas." onRetry={() => pipeline.refetch()} />;

  const projects = pipeline.data.filter((p) => {
    if (!matchesSource(source, p.source)) return false;
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
      hint: 'Draf lokal dan pemeriksaan kebijakan; bukan bukti pengiriman',
    },
    {
      id: 'active',
      title: 'Terkirim & Diskusi',
      filter: (p: Opportunity) => p.pipelineStatus === 'submitted' || p.pipelineStatus === 'in_conversation' || p.pipelineStatus === 'won',
      hint: 'Freelancer terkonfirmasi; projects.co.id ditandai oleh Anda',
    },
    {
      id: 'archived',
      title: 'Selesai / Dilewati',
      filter: (p: Opportunity) => p.pipelineStatus === 'skipped' || p.pipelineStatus === 'lost' || p.pipelineStatus === 'expired' || p.pipelineStatus === 'reconciliation_required' || p.pipelineStatus === 'error',
      hint: 'Termasuk error dan hasil tidak pasti yang perlu diperiksa',
    },
  ];

  return <>
    <PageIntro
      eyebrow="Manajemen kerja"
      title="Papan tugas"
      description="Tugas tim Hermes dan tahapan peluang diperbarui mengikuti aktivitas aplikasi."
    />
    <HermesKanbanCard />
    <div className="section-heading"><div><h2>Alur peluang dan penawaran</h2><p className="form-help">Buka kartu untuk membaca detail proyek, draf, atau hasilnya.</p></div><Link to="/pipeline" className="text-link">Lihat pipeline</Link></div>
    <section className="filter-bar card-toolbar" aria-label="Filter papan tugas">
      <label className="search-field">
        <span>Cari proyek, klien, atau skill di papan tugas</span>
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Judul, klien, atau teknologi" />
      </label>
      <SourceSelect value={source} onChange={setSource} />
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
            <p className="kanban-hint">{col.hint}</p>
            {colProjects.length === 0 ? (
              <div className="kanban-empty">
                Tidak ada kartu
              </div>
            ) : (
              <>{colProjects.slice(0, expanded[col.id] ? colProjects.length : KANBAN_LIMIT).map((p) => (
                <article className="kanban-card" key={p.id}>
                  <div className="kanban-card-top">
                    <span className="kanban-card-client">{opportunitySource(p.source)} · {p.clientName}</span>
                    <StateLabel state={p.pipelineStatus} source={p.source} />
                  </div>
                  <h4>{p.title}</h4>
                  <div className="tag-row">
                    {p.skills.slice(0, 3).map((s) => (
                      <span className="skill-tag" key={s}>{s}</span>
                    ))}
                  </div>
                  <div className="kanban-card-foot">
                    <span className="kanban-card-budget">{formatMoney(p.budgetMin, p.currency)} - {formatMoney(p.budgetMax, p.currency)}</span>
                    <span className="kanban-card-score">Skor: {p.score}</span>
                  </div>
                  <div className="kanban-card-action">
                    <Link
                      to={projectLink(p)}
                      className="button button-secondary"
                    >
                      {p.latestDraft ? 'Buka draf' : 'Lihat peluang'}
                    </Link>
                  </div>
                </article>
              ))}
              {colProjects.length > KANBAN_LIMIT && !expanded[col.id] && <button type="button" className="button button-secondary kanban-more" onClick={() => setExpanded({ ...expanded, [col.id]: true })}>Tampilkan {colProjects.length - KANBAN_LIMIT} kartu lainnya</button>}
              </>
            )}
          </div>
        );
      })}
    </div>
  </>;
}
