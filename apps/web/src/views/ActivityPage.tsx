import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type AuditEvent } from '../api/api.js';
import { useSourceFilter, SourceSelect } from '../components/source-filter.js';
import { ErrorNotice, LoadingPanel, PageIntro, ActivityRows } from '../components/ui.js';

export default function ActivityPage() {
  const [limit, setLimit] = useState(100);
  const [filter, setFilter] = useState<'all' | 'allowed' | 'blocked' | 'recorded' | 'failed'>('all');
  const [source, setSource] = useSourceFilter();
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '');
  const query = useQuery({ queryKey: ['activity', limit], queryFn: () => api<AuditEvent[]>('/activity?limit=' + limit), refetchInterval: 10_000 });
  if (query.isPending) return <LoadingPanel label="Membaca jejak aktivitas..." />;
  if (query.isError) return <ErrorNotice message="Log aktivitas belum dapat dimuat." onRetry={() => query.refetch()} />;

  const fromProjectsCoId = (e: AuditEvent) => e.type.startsWith('projects_co_id.') || e.resourceId.startsWith('projects_co_id');
  const filteredEvents = query.data.filter((e) => {
    if (source !== 'all' && fromProjectsCoId(e) !== (source === 'projects_co_id')) return false;
    if (filter !== 'all' && e.status !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return e.type.toLowerCase().includes(q) || e.reason.toLowerCase().includes(q) || e.resourceId.toLowerCase().includes(q);
  });

  return <>
    <PageIntro eyebrow="Audit log" title="Aktivitas dan keputusan" description="Telusuri apa yang dilakukan aplikasi, kapan terjadi, dan alasan keberhasilan atau hambatannya." />
    <p className="card-status-note">Log ini adalah riwayat kejadian. Kegagalan atau penolakan lama tidak selalu mencerminkan kondisi integrasi saat ini.</p>
    <div className="filter-tabs" role="group" aria-label="Filter status audit">
      <button type="button" aria-pressed={filter === 'all'} className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Semua ({query.data.length})</button>
      <button type="button" aria-pressed={filter === 'allowed'} className={`filter-tab ${filter === 'allowed' ? 'active' : ''}`} onClick={() => setFilter('allowed')}>Diizinkan ({query.data.filter((e) => e.status === 'allowed').length})</button>
      <button type="button" aria-pressed={filter === 'blocked'} className={`filter-tab ${filter === 'blocked' ? 'active' : ''}`} onClick={() => setFilter('blocked')}>Dilewati ({query.data.filter((e) => e.status === 'blocked').length})</button>
      <button type="button" aria-pressed={filter === 'recorded'} className={`filter-tab ${filter === 'recorded' ? 'active' : ''}`} onClick={() => setFilter('recorded')}>Tercatat ({query.data.filter((e) => e.status === 'recorded').length})</button>
      <button type="button" aria-pressed={filter === 'failed'} className={`filter-tab ${filter === 'failed' ? 'active' : ''}`} onClick={() => setFilter('failed')}>Gagal ({query.data.filter((e) => e.status === 'failed').length})</button>
    </div>
    <div className="form-grid card-toolbar"><label className="search-field activity-search"><span>Cari jejak aktivitas</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Alasan, tipe, atau ID catatan" /></label><SourceSelect value={source} onChange={setSource} labels={{ freelancer: 'Freelancer & sistem' }} /></div>
    <p className="form-help" role="status">{filteredEvents.length} dari {query.data.length} catatan ditampilkan.</p>
    <section className="activity-section">
      {filteredEvents.length ? <ActivityRows events={filteredEvents} /> : <div className="empty-state"><h3>Tidak ada aktivitas sesuai filter</h3><p>Ubah kata pencarian, sumber, atau status. Filter hanya berlaku pada catatan yang sudah dimuat.</p></div>}
    </section>
    <p className="form-help">Pencarian dan filter berlaku pada {query.data.length} catatan terbaru yang dimuat.</p>{query.data.length >= limit && limit < 500 && <button className="button button-secondary" type="button" onClick={() => setLimit(Math.min(500, limit + 100))}>Muat 100 catatan lebih lama</button>}
  </>;
}
