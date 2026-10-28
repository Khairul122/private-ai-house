import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, jsonRequest, type BidDraft, type Opportunity } from '../api/api.js';
import HermesKanbanCard from '../components/HermesKanbanCard.js';
import { useSourceFilter, SourceSelect, matchesSource, projectLink, opportunitySource } from '../components/source-filter.js';
import { StateLabel, ErrorNotice, LoadingPanel, PageIntro } from '../components/ui.js';
import { formatMoney } from '../components/format.js';

const KANBAN_LIMIT = 12;

export default function TaskBoardPage() {
  const [filter, setFilter] = useState('');
  const [source, setSource] = useSourceFilter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [moveErrors, setMoveErrors] = useState<Record<string, string>>({});
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

  const handleMove = async (p: Opportunity, targetColId: string) => {
    const targetCol = columns.find((c) => c.id === targetColId);
    if (!targetCol) return;
    if (p.source === 'projects_co_id' && targetColId === 'archived' && p.status === 'open') {
      try {
        await api(`/projects-co-id/projects/${encodeURIComponent(p.id)}/skip`, jsonRequest('POST', { confirm: true }));
        setMoveErrors((prev) => { const next = { ...prev }; delete next[p.id]; return next; });
        await pipeline.refetch();
        return;
      } catch (err) {
        setMoveErrors((prev) => ({ ...prev, [p.id]: err instanceof Error ? err.message : 'Perpindahan kartu gagal.' }));
        return;
      }
    }
    if (targetColId === 'active') {
      setMoveErrors((prev) => ({
        ...prev,
        [p.id]: `Perpindahan ke "${targetCol.title}" gagal: konfirmasi marketplace diperlukan sesuai kebijakan.`,
      }));
    } else {
      setMoveErrors((prev) => ({
        ...prev,
        [p.id]: `Perpindahan ke "${targetCol.title}" gagal: status kartu dikelola otomatis oleh kebijakan dan sistem.`,
      }));
    }
  };

  return <>
    <PageIntro
      eyebrow="Manajemen kerja"
      title="Papan tugas"
      description="Tugas tim Hermes dan tahapan peluang diperbarui mengikuti aktivitas aplikasi."
    />
    <HermesKanbanCard />
    <div className="section-heading"><div><h2>Alur peluang dan penawaran</h2><p className="form-help" role="status">Buka kartu untuk membaca detail proyek, draf, atau hasilnya. Papan diperbarui otomatis setiap 10 detik.</p></div><Link to="/pipeline" className="text-link">Lihat pipeline</Link></div>
    <section className="filter-bar card-toolbar" aria-label="Filter papan tugas">
      <label className="search-field">
        <span>Cari proyek, klien, atau skill di papan tugas</span>
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Judul, klien, atau teknologi" />
      </label>
      <SourceSelect value={source} onChange={setSource} />
      <div className="filter-note" role="status">
        <strong>{projects.length}</strong> kartu ditampilkan
        <span>Diperbarui {new Date(pipeline.dataUpdatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
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
                {filter.trim() || source !== 'all' ? 'Tidak ada kartu sesuai filter' : `Tidak ada kartu di tahap ${col.title.toLowerCase()}`}
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
                  {moveErrors[p.id] && <div className="notice notice-error kanban-move-error" role="alert"><span>{moveErrors[p.id]}</span></div>}
                  <div className="kanban-card-action">
                    <div className="kanban-move-control">
                      <label className="kanban-move-label">
                        <span className="sr-only">Pindahkan ke</span>
                        <select aria-label={`Pindahkan peluang ${p.title} ke tahap lain`} className="kanban-move-select" value="" onChange={(e) => void handleMove(p, e.target.value)}>
                          <option value="" disabled>Pindahkan ke…</option>
                          {columns.map((target) => <option key={target.id} value={target.id} disabled={target.id === col.id}>{target.title}</option>)}
                        </select>
                      </label>
                    </div>
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
