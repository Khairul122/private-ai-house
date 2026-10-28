import { cloneElement, Fragment, isValidElement, useEffect, useId, useRef, useState, type ReactNode, type ElementType } from 'react';
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

export function auditSource(event: AuditEvent): string {
  if (event.type.startsWith('projects_co_id.') || event.resourceId.startsWith('projects_co_id')) return 'projects.co.id';
  if (event.type.startsWith('marketplace.') || event.type.startsWith('freelancer.') || event.type.startsWith('autopilot.')) return 'Freelancer';
  if (event.type.startsWith('github.')) return 'GitHub';
  if (event.type.startsWith('linkedin.')) return 'LinkedIn';
  if (event.type.startsWith('hermes.')) return 'Hermes';
  if (event.type.startsWith('operations.')) return 'Operasi';
  return 'Sistem';
}

export function MoneyDisplay({ amount, currency, className }: { amount: number; currency: string; className?: string }) {
  return <span className={`nominal-wrap ${className ?? ''}`.trim()}>{formatMoney(amount, currency)}</span>;
}

export function ActivityRows({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <EmptyState title="Belum ada aktivitas" description="Perubahan kebijakan, draf, bid, dan impor akan muncul di sini." />;
  return <ol className="activity-list">
    {events.map((event) => (
      <li key={event.id} className="activity-row activity-card">
        <span className={`activity-mark activity-mark-${event.status}`} aria-hidden="true" />
        <div className="activity-copy"><div className="activity-meta"><span className="audit-source">{auditSource(event)}</span><small className="activity-time">{formatDate(event.createdAt)}</small></div>
          <strong>{activityTitle(event.type)}</strong>
          <p>{event.reason}</p>
          <div className="activity-details">{event.resourceId && <small className="activity-resource">Sumber daya: {event.resourceId}</small>}{event.policyVersion !== null && <small className="activity-policy-ver">Kebijakan v{event.policyVersion}</small>}<small className="activity-id">ID: {event.id}</small></div>
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

/** Control props passed to children when using render prop API */
export interface FormFieldControlProps {
  id?: string | undefined;
  'aria-invalid'?: boolean | 'true' | 'false' | undefined;
  'aria-describedby'?: string | undefined;
}

export interface FormFieldMeta {
  error?: string | null | undefined;
  helpId?: string | undefined;
  errorId?: string | undefined;
  controlId?: string | undefined;
}

/** Form field container binding label, input, help and inline error */
export interface FormFieldProps {
  label?: ReactNode;
  htmlFor?: string | undefined;
  help?: ReactNode;
  error?: string | null | undefined;
  required?: boolean | undefined;
  children: ReactNode | ((controlProps: FormFieldControlProps, meta: FormFieldMeta) => ReactNode);
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
  const generatedId = useId();
  const rawChildId = isValidElement(children) ? (children.props as Record<string, unknown> | undefined)?.id : undefined;
  const rawBaseId = id || htmlFor || (typeof rawChildId === 'string' ? rawChildId : undefined) || `field-${generatedId.replace(/:/g, '')}`;
  const baseId = String(rawBaseId);

  const helpId = help ? `${baseId}-help` : undefined;
  const errorId = error ? `${baseId}-error` : undefined;

  const controlId = htmlFor || (typeof rawChildId === 'string' ? rawChildId : undefined) || `${baseId}-control`;
  const effectiveLabelFor = htmlFor || (typeof rawChildId === 'string' ? rawChildId : undefined) || controlId;

  const describedByParts: string[] = [];
  if (error && errorId) describedByParts.push(errorId);
  if (help && helpId) describedByParts.push(helpId);

  const renderControl = () => {
    if (typeof children === 'function') {
      const controlProps: FormFieldControlProps = {
        id: controlId,
        ...(error ? { 'aria-invalid': true } : {}),
        ...(describedByParts.length > 0 ? { 'aria-describedby': describedByParts.join(' ') } : {}),
      };
      const meta: FormFieldMeta = {
        error: error ?? undefined,
        helpId,
        errorId,
        controlId,
      };
      return children(controlProps, meta);
    }

    if (isValidElement(children) && children.type !== Fragment) {
      const childProps = (children.props || {}) as Record<string, unknown>;
      const existingDescribedBy = childProps['aria-describedby'];

      const combinedParts = [...describedByParts];
      if (typeof existingDescribedBy === 'string' && existingDescribedBy.trim()) {
        for (const part of existingDescribedBy.split(/\s+/)) {
          if (part && !combinedParts.includes(part)) {
            combinedParts.push(part);
          }
        }
      }

      const injectedProps: Record<string, unknown> = {};
      if (!childProps.id && controlId) {
        injectedProps.id = controlId;
      }
      if (error) {
        injectedProps['aria-invalid'] = true;
      }
      if (combinedParts.length > 0) {
        injectedProps['aria-describedby'] = combinedParts.join(' ');
      }
      if (error && 'error' in childProps && childProps.error === undefined) {
        injectedProps.error = error;
      }

      return cloneElement(children, injectedProps);
    }

    return children;
  };

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`.trim()} id={id}>
      {label && (
        <label htmlFor={effectiveLabelFor} className="form-field-label">
          <span>{label}</span>
          {required && <span className="field-required" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="form-field-control">
        {renderControl()}
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

/** Parses a raw input string to finite number or null when empty/incomplete */
export function parseNumInputValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

/** Determines if external numeric value changed outside local editing flow */
export function shouldSyncExternalNumValue(
  currentText: string,
  externalValue: number,
  lastCommittedValue: number
): boolean {
  if (lastCommittedValue === externalValue) {
    return false;
  }
  const parsed = Number(currentText.trim());
  if (currentText.trim() === '' || !Number.isFinite(parsed) || parsed !== externalValue) {
    return true;
  }
  return false;
}

/** Number input preserving raw string while typing, enforcing 44px min-height */
export interface NumFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
  error?: string | null | undefined;
}

export function NumField({ value, onChange, error, ...rest }: NumFieldProps) {
  const [text, setText] = useState(() => (Number.isFinite(value) ? String(value) : ''));
  const lastCommittedRef = useRef(value);

  // Synchronize only when external value changed from outside
  useEffect(() => {
    if (shouldSyncExternalNumValue(text, value, lastCommittedRef.current)) {
      lastCommittedRef.current = value;
      setText(Number.isFinite(value) ? String(value) : '');
    } else if (lastCommittedRef.current !== value && Number(text.trim()) === value) {
      lastCommittedRef.current = value;
    }
  }, [value, text]);

  const ariaInvalid = Boolean(error) || rest['aria-invalid'] === true || rest['aria-invalid'] === 'true' || undefined;

  return (
    <input
      type="number"
      required
      {...rest}
      aria-invalid={ariaInvalid}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const parsed = parseNumInputValue(next);
        if (parsed !== null) {
          lastCommittedRef.current = parsed;
          onChange(parsed);
        }
      }}
      onBlur={(event) => {
        if (parseNumInputValue(text) === null) {
          setText(Number.isFinite(value) ? String(value) : '');
        }
        rest.onBlur?.(event);
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
