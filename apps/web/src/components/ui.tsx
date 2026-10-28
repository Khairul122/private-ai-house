import { useEffect, useState, type ReactNode, type ElementType } from 'react';
import { Link } from 'react-router';
import type { AuditEvent, Autopilot, Opportunity } from '../api/api.js';
import { formatDate, activityTitle } from './format.js';

export function StateLabel({ state, source }: { state: string; source?: Opportunity['source'] }) {
  const labels: Record<string, string> = {
    active: 'Aktif', running: 'Berjalan', starting: 'Menyiapkan', connected: 'Terhubung', supported: 'Didukung API', unknown: 'Tidak diketahui', unverified: 'Belum diuji', invalid: 'Token tidak valid', unavailable: 'Tidak dapat diperiksa', expired: 'Kedaluwarsa', paused: 'Dijeda', draft: 'Belum aktif', recorded: 'Tercatat', blocked: 'Dilewati', failed: 'Gagal',
    new: 'Baru', scored: 'Dinilai', draft_ready: 'Draf siap', policy_check: 'Pemeriksaan kebijakan', submitted: 'Terkirim',
    in_conversation: 'Percakapan', won: 'Berhasil', lost: 'Tidak lanjut', skipped: 'Dilewati',
    reconciliation_required: 'Perlu rekonsiliasi', error: 'Kesalahan', allowed: 'Diizinkan',
  };
  return <span className={`state-label state-${state}`}>{source === 'projects_co_id' && state === 'submitted' ? 'Ditandai terkirim oleh Anda' : labels[state] ?? state}</span>;
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice notice-error" role="alert" aria-atomic="true">
      <span>{message}</span>
      {onRetry && <button className="button button-text" type="button" onClick={onRetry}>Coba lagi</button>}
    </div>
  );
}

export function LoadingPanel({ label = 'Memuat data lokal...' }: { label?: string }) {
  return <div className="loading-panel" role="status" aria-live="polite" aria-atomic="true" aria-busy="true"><span className="loading-line" aria-hidden="true" />{label}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3><p>{description}</p>{action && <div className="empty-state-action">{action}</div>}</div>;
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="intro-copy">{description}</p></div>{action && <div className="page-intro-action">{action}</div>}</div>;
}

export function Metric({ label, value, note, tone = 'plain', to }: { label: string; value: string | number; note: string; tone?: string; to?: string }) {
  const body = <><span>{label}</span><strong>{value}</strong><small>{note}</small></>;
  return to ? <Link to={to} className={`metric metric-${tone} metric-link`}>{body}</Link> : <div className={`metric metric-${tone}`}>{body}</div>;
}

export function ActivityRows({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <EmptyState title="Belum ada aktivitas" description="Perubahan kebijakan, draf, bid, dan impor akan muncul di sini." />;
  return <ol className="activity-list">
    {events.map((event) => (
      <li key={event.id} className="activity-row">
        <span className={`activity-mark activity-mark-${event.status}`} aria-hidden="true" />
        <div className="activity-copy">
          <strong>{activityTitle(event.type)}</strong>
          <p>{event.reason}</p>
          <small>{formatDate(event.createdAt)}</small>
          {event.payloadHash && <small className="local-reference">Hash payload: {event.payloadHash.slice(0, 16)}...</small>}
        </div>
        <StateLabel state={event.status} />
      </li>
    ))}
  </ol>;
}

export function OperationStatus({ data, unavailable = false }: { data: Autopilot | undefined; unavailable?: boolean }) {
  if (unavailable) return <ErrorNotice message="Status operasi tidak tersedia. Data lama tidak ditampilkan sebagai status live." />;
  if (!data) return <LoadingPanel label="Membaca status operasi..." />;
  const reasons = Object.entries(data.summary?.reasons ?? {}).sort((a, b) => b[1] - a[1]);
  return <section className="form-card operation-status" aria-label="Diagnosis operasi otomatis">
    <div className="section-heading"><div><p className="eyebrow">Operasi otomatis</p><h2>{data.cycleInProgress ? 'Siklus sedang berjalan' : data.waitingReason ?? (data.state === 'running' ? 'Aktif, menunggu siklus berikutnya' : 'Operasi memerlukan perhatian')}</h2></div><StateLabel state={data.state} /></div>
    <p>{data.cycleInProgress && data.lastRunAt ? `Hasil siklus sebelumnya: ${data.lastMessage}` : data.lastMessage}</p>
    {data.marketplaceNotice && <div className="notice notice-warning" role="status"><strong>{data.marketplaceNotice.quotaExhausted ? 'Kuota akun Freelancer habis pada percobaan terakhir' : 'Pengiriman bid terakhir gagal'}</strong><small>Tercatat {formatDate(data.marketplaceNotice.at)}.</small><details className="card-disclosure"><summary>Rincian hasil pengiriman</summary><p>{data.marketplaceNotice.reason}</p>{data.marketplaceNotice.retryAt && <p>Kandidat baru dapat dicoba pada siklus setelah {formatDate(data.marketplaceNotice.retryAt)}. Waktu kuota pulih mengikuti Freelancer.</p>}{data.marketplaceNotice.quotaExhausted && <p><a href="https://www.freelancer.com/dashboard" target="_blank" rel="noreferrer">Periksa jatah bid di Freelancer</a></p>}</details></div>}
    <dl className="operation-facts"><div><dt>Siklus terakhir</dt><dd>{data.lastRunAt ? formatDate(data.lastRunAt) : 'Belum tercatat'}</dd></div><div><dt>Siklus berikutnya</dt><dd>{data.nextRunAt ? formatDate(data.nextRunAt) : 'Tidak terjadwal'}</dd></div><div><dt>Interval saat ini</dt><dd>{data.intervalMinutes === undefined ? 'Tidak tersedia' : `${data.intervalMinutes} menit selama server aktif`}</dd></div><div><dt>Proposal diproses</dt><dd>{data.draftsInProgress ?? 'Tidak diketahui'}</dd></div></dl>
    {data.summary && data.lastRunAt && <p><strong>{data.summary.considered}</strong> proyek terbuka ditinjau, <strong>{data.summary.eligible}</strong> lolos pemeriksaan awal, <strong>{data.lastSubmitted}</strong> bid terkirim pada siklus terakhir.</p>}
    {reasons.length > 0 && <details className="card-disclosure"><summary>Alasan proyek dilewati ({reasons.length})</summary><ul className="reason-breakdown">{reasons.map(([reason, total]) => <li key={reason}><span>{reason}</span><strong>{total}</strong></li>)}</ul></details>}
    {!!data.searchTerms?.length && <details className="card-disclosure"><summary>Pencarian siklus terakhir</summary><p>{data.searchTerms.join(', ')}</p><p className="form-help">Mengikuti keterampilan dan kata kunci tersimpan, bergiliran per siklus.</p></details>}
  </section>;
}

export function useClock(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export interface SkipLinkProps {
  targetId: string;
  label: string;
  onClick?: () => void;
}

export function SkipLink({ targetId, label, onClick }: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className="vo3d-skip-link"
      onClick={(e) => {
        if (onClick) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {label}
    </a>
  );
}

export interface LiveAnnouncerProps {
  message: string;
  politeness?: 'polite' | 'assertive';
}

export function LiveAnnouncer({ message, politeness = 'polite' }: LiveAnnouncerProps) {
  return (
    <div
      role={politeness === 'assertive' ? 'alert' : 'status'}
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}

export function useAnnouncer() {
  const [announcement, setAnnouncement] = useState('');
  const [politeness, setPoliteness] = useState<'polite' | 'assertive'>('polite');

  const announce = (message: string, mode: 'polite' | 'assertive' = 'polite') => {
    setPoliteness(mode);
    setAnnouncement(message);
  };

  return { announcement, politeness, announce };
}

export function VisuallyHidden({ children, as: Tag = 'span' }: { children: ReactNode; as?: ElementType }) {
  return <Tag className="sr-only">{children}</Tag>;
}
