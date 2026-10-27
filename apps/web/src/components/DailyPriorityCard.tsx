import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, jsonRequest } from '../api/api.js';
import type { DailyPrioritySummary } from '../../../server/src/models/daily-priority-types.js';
type DailyPriorityResponse = { day: string; summary: DailyPrioritySummary | null; job: { busy: boolean; error: string | null } | null };
import { EmptyState, ErrorNotice, LoadingPanel } from './ui.js';

const SOURCE_NAMES = { messages: 'Pesan Freelancer', projects: 'Tenggat proyek', tasks: 'Agenda pemilik', invoices: 'Invoice', payments: 'Pembayaran', kanban: 'Papan Tugas', reports: 'Laporan manajer' } as const;
const sourceState = { available: 'terbaca', stale: 'lama', failed: 'gagal', unknown: 'belum diketahui' } as const;
const wibTime = (value: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function DailyPriorityCard() {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['daily-priority'], queryFn: () => api<DailyPriorityResponse>('/operations/daily-priority'), refetchInterval: 10_000 });
  const data = query.isError ? null : query.data;
  const summary = data && data.summary?.day === data.day ? data.summary : null;
  const old = summary && Date.now() - Date.parse(summary.capturedAt) > 30 * 60_000;
  const refresh = async () => {
    setRefreshing(true); setRefreshError(null);
    try { await api('/operations/daily-priority/refresh', jsonRequest('POST')); await query.refetch(); }
    catch (error) { setRefreshError(error instanceof Error ? error.message : 'Pembaruan gagal.'); }
    finally { setRefreshing(false); }
  };

  return <section className="activity-preview card-section" aria-labelledby="daily-priority-title">
    <div className="section-heading" style={{ flexWrap: 'wrap', gap: 12 }}>
      <div><p className="eyebrow">Chief of Staff · aturan tersimpan</p><h2 id="daily-priority-title">Prioritas harian</h2></div>
      <button type="button" className="button button-secondary" onClick={() => void refresh()} disabled={refreshing || Boolean(data?.job?.busy)}>{refreshing ? 'Memperbarui…' : 'Perbarui dari data tersimpan'}</button>
    </div>
    {query.isPending && <LoadingPanel label="Membaca prioritas harian..." />}
    {query.isError && <ErrorNotice message="Prioritas harian tidak tersedia. Data lama tidak ditampilkan sebagai status terkini." onRetry={() => query.refetch()} />}
    {refreshError && <p className="notice notice-error" role="alert">{refreshError}</p>}
    {data?.job?.error && <p className="notice notice-warning" role="status">Penyusunan terakhir gagal. Ringkasan tersimpan mungkin lama. {data.job.error}</p>}
    {data && !summary && <EmptyState title="Ringkasan hari ini belum tersedia" description="Siklus operasional akan menyusun ringkasan dari data tersimpan. Gunakan Perbarui untuk mencoba sekarang." />}
    {summary && <>
      <p className="form-help">Tanggal WIB {summary.day} · revisi {summary.revision} · diambil {wibTime(summary.capturedAt)} WIB. {old ? 'Ringkasan lebih dari 30 menit; data mungkin berubah.' : 'Ini cuplikan saat pengambilan, bukan status langsung.'}</p>
      {summary.state === 'partial' && <p className="notice notice-warning" role="status">Sebagian sumber gagal, lama, atau belum diketahui. Daftar ini mungkin belum lengkap.</p>}
      <ul className="deadlines-list">{Object.entries(summary.sources).filter(([, source]) => source.state !== 'available').map(([key, source]) => <li className="deadline-item" key={key}><span><strong>{SOURCE_NAMES[key as keyof typeof SOURCE_NAMES]}</strong>: {sourceState[source.state]}. {source.reason} {source.observedAt ? `Terakhir ${wibTime(source.observedAt)} WIB.` : ''}</span></li>)}</ul>
      {summary.items.length ? <ol className="deadlines-list">{summary.items.map((item, index) => <li className="deadline-item" key={item.id} style={{ alignItems: 'flex-start' }}><div style={{ minWidth: 0 }}>
        <strong>{index + 1}. <Link to={item.href}>{item.title}</Link></strong>
        <p className="item-sub">{item.reason}</p>
        <p className="item-sub">Keputusan Anda: {item.decision}</p>
        <small>Sumber: {SOURCE_NAMES[item.source]} · {item.sourceId} · teramati {wibTime(item.observedAt)} WIB{item.dueAt ? ` · tenggat ${item.dueAt}` : ''}</small>
      </div></li>)}</ol> : <EmptyState title="Belum ada tindakan dari sumber yang terbaca" description="Periksa status sumber di atas. Ringkasan dibuat dari pesan terakhir yang teramati, tenggat, tugas, dan tagihan tersimpan." />}
      {summary.reports.length > 0 && <p className="form-help">Laporan manajer: {summary.reports.map(report => `lantai ${report.floor} (${wibTime(report.createdAt)} WIB, ${report.state === 'reviewed' ? 'tinjauan Hermes adalah saran AI' : report.state === 'waiting' ? 'menunggu tinjauan' : 'tinjauan tidak tersedia'})`).join('; ')}. <Link to="/operations">Buka laporan</Link></p>}
    </>}
  </section>;
}
