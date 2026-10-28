import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { AuditEvent, Autopilot, Opportunity } from '../api/api.js';
import { formatDate, formatMoney, activityTitle } from './format.js';

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
  const body = <><span>{label}</span><strong className="nominal-wrap">{value}</strong><small>{note}</small></>;
  return to ? <Link to={to} className={`metric metric-${tone} metric-link`}>{body}</Link> : <div className={`metric metric-${tone}`}>{body}</div>;
}

export function MoneyDisplay({ amount, currency, className }: { amount: number; currency: string; className?: string }) {
  return <span className={`nominal-wrap ${className ?? ''}`.trim()}>{formatMoney(amount, currency)}</span>;
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
    {reasons.length > 0 && <details className="card-disclosure"><summary>Alasan proyek dilewati ({reasons.length})</summary><ul className="reason-breakdown">{reasons.map(([reason, total]) => <li key={reason}><span>{reason}</span><strong className="nominal-wrap">{total}</strong></li>)}</ul></details>}
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

/** State and hook for tracking virtual keyboard and visual viewport adjustments */
export interface VisualViewportState {
  isKeyboardOpen: boolean;
  keyboardHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  offsetBottom: number;
}

export function computeViewportState(
  win?: { innerHeight: number; innerWidth: number; visualViewport?: { height: number; width: number; offsetTop: number } | null | undefined } | null | undefined
): VisualViewportState {
  if (!win || !win.visualViewport) {
    return {
      isKeyboardOpen: false,
      keyboardHeight: 0,
      viewportHeight: win ? win.innerHeight : 800,
      viewportWidth: win ? win.innerWidth : 1200,
      offsetBottom: 0,
    };
  }
  const vv = win.visualViewport;
  const offset = Math.max(0, win.innerHeight - (vv.offsetTop + vv.height));
  const isKeyboardOpen = offset > 100 || (win.innerHeight - vv.height > 100);
  return {
    isKeyboardOpen,
    keyboardHeight: Math.max(0, win.innerHeight - vv.height),
    viewportHeight: vv.height,
    viewportWidth: vv.width,
    offsetBottom: offset,
  };
}

export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>(() =>
    computeViewportState(typeof window !== 'undefined' ? window : undefined)
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;

    const handleUpdate = () => {
      const next = computeViewportState(window);
      setState(next);

      if (next.isKeyboardOpen && typeof document !== 'undefined' && document.activeElement) {
        const el = document.activeElement as HTMLElement;
        if (el && typeof el.tagName === 'string' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
          if (typeof el.scrollIntoView === 'function') {
            try {
              el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } catch {
              el.scrollIntoView();
            }
          }
        }
      }
    };

    vv.addEventListener('resize', handleUpdate);
    vv.addEventListener('scroll', handleUpdate);
    return () => {
      vv.removeEventListener('resize', handleUpdate);
      vv.removeEventListener('scroll', handleUpdate);
    };
  }, []);

  return state;
}

/** Sticky, keyboard-aware action bar with safe area inset and >= 8px action spacing */
export interface FormActionBarProps {
  children: ReactNode;
  note?: ReactNode;
  sticky?: boolean | undefined;
  className?: string | undefined;
  ariaLabel?: string | undefined;
}

export function FormActionBar({
  children,
  note,
  sticky = true,
  className = '',
  ariaLabel = 'Aksi formulir',
}: FormActionBarProps) {
  const { isKeyboardOpen, offsetBottom } = useVisualViewport();

  const style: React.CSSProperties | undefined =
    sticky && isKeyboardOpen && offsetBottom > 0
      ? { bottom: `${offsetBottom}px` }
      : undefined;

  return (
    <div
      className={`form-actions form-action-bar ${sticky ? 'is-sticky' : ''} ${className}`.trim()}
      style={style}
      role="toolbar"
      aria-label={ariaLabel}
    >
      <div className="form-action-buttons">{children}</div>
      {note && <span className="form-action-note">{note}</span>}
    </div>
  );
}

/** Standalone field error notice rendered close to form controls */
export function FieldError({ message, id }: { message?: string | null | undefined; id?: string | undefined }) {
  if (!message) return null;
  return (
    <span className="field-error" role="alert" id={id}>
      <span className="field-error-icon" aria-hidden="true">⚠</span>
      <span>{message}</span>
    </span>
  );
}

/** Form field container binding label, input, help and inline error */
export interface FormFieldProps {
  label?: ReactNode;
  htmlFor?: string | undefined;
  help?: ReactNode;
  error?: string | null | undefined;
  required?: boolean | undefined;
  children: ReactNode;
  className?: string | undefined;
  id?: string | undefined;
}

export function FormField({
  label,
  htmlFor,
  help,
  error,
  required,
  children,
  className = '',
  id,
}: FormFieldProps) {
  const helpId = help && id ? `${id}-help` : undefined;
  const errorId = error && id ? `${id}-error` : undefined;

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`.trim()} id={id}>
      {label && (
        <label htmlFor={htmlFor} className="form-field-label">
          <span>{label}</span>
          {required && <span className="field-required" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="form-field-control">
        {children}
      </div>
      {error ? <FieldError message={error} id={errorId} /> : null}
      {help && (
        <small className="form-field-help" id={helpId}>
          {help}
        </small>
      )}
    </div>
  );
}

/** Number input preserving raw string while typing, enforcing 44px min-height */
export interface NumFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
  error?: string | null | undefined;
}

export function NumField({ value, onChange, error, ...rest }: NumFieldProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
  }, [value]);

  return (
    <input
      type="number"
      required
      aria-invalid={Boolean(error)}
      {...rest}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        if (event.target.value !== '' && Number.isFinite(Number(event.target.value))) {
          onChange(Number(event.target.value));
        }
      }}
    />
  );
}

/** Extracts field-level errors from an API error response message */
export function extractFieldErrors(errorMessage?: string | null): Record<string, string> {
  if (!errorMessage || typeof errorMessage !== 'string') return {};
  const errors: Record<string, string> = {};

  const parts = errorMessage.split(';').map(part => part.trim());
  for (const part of parts) {
    const match = part.match(/(?:^|.*\s)([a-zA-Z0-9_]+):\s*(.+)$/);
    if (match && match[1] && match[2]) {
      const field = match[1].trim();
      const message = match[2].trim();
      if (!errors[field]) {
        errors[field] = message;
      }
    }
  }

  return errors;
}
