import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { api, type AuditEvent, type Autopilot, type Opportunity, type Policy, type Work } from '../api/api.js';
import type { OperationsData } from '../api/operations-api.js';
import { formatMoney, formatDate, deadlineLabel } from '../components/format.js';
import { ErrorNotice, LoadingPanel, PageIntro, ActivityRows, useClock } from '../components/ui.js';

type CalendarView = 'agenda' | 'day' | 'month' | 'year';
type CalendarEvent = {
  id: string;
  dateKey: string;
  title: string;
  detail: string;
  kind: 'operation' | 'deadline' | 'payment' | 'policy' | 'activity'; source: string;
  time: string | null;
  href: string | null;
};

const calendarWeekdays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function dateKeyParts(value: string) {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  return { year, month, day };
}

function makeDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateKeyInTimezone(value: string, timezone: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
    const year = part('year');
    const month = part('month');
    const day = part('day');
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

function timeInTimezone(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('id-ID', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  } catch {
    return null;
  }
}

function calendarDateLabel(value: string, options: Intl.DateTimeFormatOptions = {}) {
  const { year, month, day } = dateKeyParts(value);
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', ...options }).format(new Date(Date.UTC(year, month - 1, day)));
}

function moveCalendarDate(value: string, view: CalendarView, amount: number) {
  const { year, month, day } = dateKeyParts(value);
  if (view === 'day') {
    const date = new Date(Date.UTC(year, month - 1, day + amount));
    return makeDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  if (view === 'month' || view === 'agenda') {
    const date = new Date(Date.UTC(year, month - 1 + amount, 1));
    return makeDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  }
  return makeDateKey(year + amount, 1, 1);
}

function calendarMonthCells(year: number, month: number) {
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const count = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, index - firstWeekday + 1));
    return {
      dateKey: makeDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()),
      inMonth: date.getUTCMonth() + 1 === month,
    };
  });
}

type AgendaSummary = { timezone: string; days: Record<string, Partial<Record<'bidSent' | 'bidFailed' | 'cycles' | 'skipped' | 'policy' | 'drafts' | 'knowledge' | 'sync' | 'other', number>>> };

const AGENDA_LABELS: Array<[keyof AgendaSummary['days'][string], (count: number) => string]> = [
  ['bidSent', (count) => `${count} bid terkirim ke Freelancer`], ['bidFailed', (count) => `${count} percobaan bid gagal atau hasil belum pasti`],
  ['drafts', (count) => `${count} draf proposal dibuat atau diubah`], ['cycles', (count) => `${count} siklus autopilot selesai`],
  ['skipped', (count) => `${count} peluang dilewati kebijakan`], ['policy', (count) => `${count} perubahan kebijakan`],
  ['knowledge', (count) => `${count} pembaruan Knowledge Hub`], ['sync', (count) => `${count} sinkronisasi marketplace dan bisnis`],
];

function OperationsCalendar({ policy, work, workPending, workError }: { policy: Policy; work: Work | undefined; workPending: boolean; workError: boolean }) {
  const ownerAgenda=useQuery({queryKey:['operations'],queryFn:()=>api<OperationsData>('/operations'),refetchInterval:10_000});
  const ownerTasks=ownerAgenda.isError?undefined:ownerAgenda.data?.tasks;
  const autopilotQuery = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 10_000 });
  const [searchParams, setSearchParams] = useSearchParams();
  const queryView = searchParams.get('view') as CalendarView | null;
  const [view, setView] = useState<CalendarView>(() => (
    queryView && ['agenda', 'day', 'month', 'year'].includes(queryView) ? queryView : 'month'
  ));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [logLimit, setLogLimit] = useState(30);
  const agendaQuery = useQuery({ queryKey: ['agenda', 'summary'], queryFn: () => api<AgendaSummary>('/agenda/activity?days=180'), refetchInterval: 30_000 });
  const autopilot = autopilotQuery.isError ? undefined : autopilotQuery.data;
  const agenda = agendaQuery.isError ? undefined : agendaQuery.data;
  const projectsQuery = useQuery({ queryKey: ['projects', 'calendar'], queryFn: () => api<Opportunity[]>('/projects'), refetchInterval: 30_000 });
  const listings = projectsQuery.isError ? undefined : projectsQuery.data;
  const events = useMemo<CalendarEvent[]>(() => {
    const result: CalendarEvent[] = [];
    for(const task of ownerTasks ?? []) {
      const dateKey=dateKeyInTimezone(task.startAt,policy.timezone);
      if(dateKey) result.push({id:`owner-${task.id}`,dateKey,title:`${task.done?'Selesai':'Tugas pemilik'}: ${task.title}`,detail:task.notes || (task.syncGoogle?'Dipilih untuk Google Calendar':'Jadwal pribadi'),kind:'operation',source:'Operasi pemilik',time:timeInTimezone(task.startAt,policy.timezone),href:'/operations'});
    }
    const expiryKey = dateKeyInTimezone(policy.expiresAt, policy.timezone);
    const expiryTime = timeInTimezone(policy.expiresAt, policy.timezone);
    if (expiryKey) result.push({ id: 'policy-expiry', dateKey: expiryKey, title: 'Masa berlaku kebijakan berakhir', detail: `Kebijakan versi ${policy.version}`, kind: 'policy', source: 'Kebijakan', time: expiryTime, href: '/policy' });

    if (autopilot?.state === 'running' && autopilot.nextRunAt) {
      const dateKey = dateKeyInTimezone(autopilot.nextRunAt, policy.timezone);
      const timestamp = new Date(autopilot.nextRunAt).getTime();
      if (dateKey && Number.isFinite(timestamp) && timestamp >= Date.now()) result.push({
        id: `autopilot-${autopilot.nextRunAt}`,
        dateKey,
        title: 'Siklus autopilot berikutnya',
        detail: autopilot.cycleInProgress ? 'Siklus saat ini sedang berjalan' : 'Jadwal dari status server',
        kind: 'operation', source: 'Freelancer autopilot',
        time: timeInTimezone(autopilot.nextRunAt, policy.timezone),
        href: '/activity',
      });
    }

    for (const item of work?.projects ?? []) {
      if (item.status !== 'active' || !item.deadline) continue;
      const dateKey = dateKeyInTimezone(item.deadline, policy.timezone);
      if (dateKey) result.push({ id: `project-${item.id}`, dateKey, title: `Tenggat: ${item.title}`, detail: `Klien: ${item.client}`, kind: 'deadline', source: item.source === 'projects_co_id' ? 'projects.co.id' : item.source === 'freelancer' ? 'Freelancer' : item.source === 'direct' ? 'Klien langsung' : 'Operasi klien', time: null, href: '/work' });
    }

    for (const item of listings ?? []) {
      // Only listings still waiting on the owner; closesAt is the source's own close time.
      if (item.source !== 'projects_co_id' || !item.closesAt || item.status !== 'open' || !['new', 'scored', 'draft_ready'].includes(item.pipelineStatus)) continue;
      const dateKey = dateKeyInTimezone(item.closesAt, policy.timezone);
      if (dateKey) result.push({ id: `listing-${item.id}`, dateKey, title: `Listing ditutup: ${item.title}`, detail: `projects.co.id · ${item.pipelineStatus === 'draft_ready' ? 'draf siap Anda kirim' : 'belum ada draf'}`, kind: 'deadline', source: 'projects.co.id', time: timeInTimezone(item.closesAt, policy.timezone), href: `/projects-co-id?project=${encodeURIComponent(item.id)}` });
    }

    for (const payment of work?.payments ?? []) {
      if (payment.status !== 'expected' || !payment.dueDate) continue;
      const dateKey = dateKeyInTimezone(payment.dueDate, policy.timezone);
      if (dateKey) result.push({ id: `payment-${payment.id}`, dateKey, title: 'Pembayaran diharapkan', detail: formatMoney(payment.amount, payment.currency), kind: 'payment', source: 'Pembayaran klien', time: null, href: '/work' });
    }

    for (const [dateKey, counts] of Object.entries(agenda?.days ?? {})) {
      for (const [category, label] of AGENDA_LABELS) {
        const count = counts[category];
        if (count) result.push({ id: `activity-${dateKey}-${category}`, dateKey, title: label(count), detail: 'Tercatat di log audit', kind: 'activity', source: 'Log audit', time: null, href: '/activity' });
      }
    }
    return result.sort((left, right) => left.dateKey.localeCompare(right.dateKey) || (left.time ?? '99:99').localeCompare(right.time ?? '99:99'));
  }, [policy, work, autopilot, agenda, ownerTasks, listings]);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const event of events) grouped.set(event.dateKey, [...(grouped.get(event.dateKey) ?? []), event]);
    return grouped;
  }, [events]);

  const now = new Date();
  const todayKey = dateKeyInTimezone(now.toISOString(), policy.timezone) ?? now.toISOString().slice(0, 10);
  const currentDateKey = selectedDateKey ?? todayKey;
  const { year, month } = dateKeyParts(currentDateKey);
  const monthCells = calendarMonthCells(year, month);
  const currentEvents = eventsByDate.get(currentDateKey) ?? [];
  const dayLog = useQuery({ queryKey: ['agenda', 'day', currentDateKey], enabled: view === 'day', queryFn: () => api<{ date: string; events: AuditEvent[] }>('/agenda/activity?date=' + currentDateKey), refetchInterval: 30_000 });
  const heading = view === 'year'
    ? String(year)
    : view === 'month' || view === 'agenda'
      ? calendarDateLabel(currentDateKey, { month: 'long', year: 'numeric' })
      : calendarDateLabel(currentDateKey, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const changePeriod = (amount: number) => setSelectedDateKey(moveCalendarDate(currentDateKey, view, amount));

  return <section className="calendar-card calendar-browser card-section" aria-labelledby="calendar-browser-title">
    <div className="calendar-browser-heading">
      <div><p className="eyebrow">Agenda ruang kerja</p><h2 id="calendar-browser-title">Kalender</h2><p>Zona waktu kebijakan: <strong>{policy.timezone}</strong></p></div>
      <div className="calendar-view-tabs" role="group" aria-label="Tampilan kalender">
        {(['agenda', 'day', 'month', 'year'] as const).map((item) => <button key={item} className={`calendar-view-button${view === item ? ' active' : ''}`} type="button" aria-pressed={view === item} onClick={() => { setView(item); setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('view', item); return next; }, { replace: true }); }}>{item === 'agenda' ? 'Agenda' : item === 'day' ? 'Hari' : item === 'month' ? 'Bulan' : 'Tahun'}</button>)}
      </div>
    </div>
    <div className="calendar-navigation">
      <div className="calendar-period-controls">
        <button className="calendar-nav-button" type="button" aria-label={`Periode ${view === 'day' ? 'hari' : view === 'month' ? 'bulan' : 'tahun'} sebelumnya`} onClick={() => changePeriod(-1)}>‹</button>
        <h3 aria-live="polite">{heading}</h3>
        <button className="calendar-nav-button" type="button" aria-label={`Periode ${view === 'day' ? 'hari' : view === 'month' ? 'bulan' : 'tahun'} berikutnya`} onClick={() => changePeriod(1)}>›</button>
      </div>
      <button className="calendar-today-button" type="button" onClick={() => { setSelectedDateKey(todayKey); setView('day'); }}>Hari ini</button>
    </div>
    <label className="form-field calendar-date-jump"><span>Lompat ke tanggal</span><input type="date" value={currentDateKey} min="1900-01-01" max="9999-12-31" onChange={(event) => { if (event.target.value) { setSelectedDateKey(event.target.value); setView('day'); setLogLimit(30); } }} /></label>

    {view === 'agenda' && (() => {
      const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
      const periodEvents = events.filter((e) => e.dateKey.startsWith(monthPrefix));
      return (
        <div className="calendar-agenda-view">
          <div className="calendar-day-summary">
            <strong>Agenda {heading}</strong>
            <span>{periodEvents.length} agenda tercatat</span>
          </div>
          {periodEvents.length === 0 ? (
            <div className="calendar-empty" role="status">
              <strong>Belum ada agenda pada periode {heading}.</strong>
              <span>Agenda berasal dari status autopilot, tenggat proyek klien, pembayaran tertunda, masa berlaku kebijakan, dan riwayat aktivitas 180 hari terakhir.</span>
            </div>
          ) : (
            <ol className="calendar-event-list calendar-agenda-list">
              {periodEvents.map((event) => (
                <li key={event.id} className={`calendar-event calendar-event-${event.kind}`}>
                  <div className="calendar-event-meta">
                    <span className="calendar-event-source">{event.source}</span>
                    <span className="calendar-event-status">{event.kind === 'deadline' ? 'Tenggat' : event.kind === 'payment' ? 'Pembayaran' : event.kind === 'policy' ? 'Kebijakan' : event.kind === 'activity' ? 'Aktivitas' : 'Operasi'}</span>
                    <span className="calendar-event-date">{event.dateKey}{event.time ? ` · ${event.time}` : ''}</span>
                  </div>
                  <div>
                    <strong>{event.title}</strong>
                    <span>{event.detail}</span>
                  </div>
                  {event.href && <Link to={event.href} className="calendar-event-link">Buka detail</Link>}
                </li>
              ))}
            </ol>
          )}
        </div>
      );
    })()}

    {view === 'month' && <div className="calendar-month-view">
      <div className="calendar-weekdays" aria-hidden="true">{calendarWeekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
      <div className="calendar-month-grid" aria-label={`Tanggal bulan ${heading}`}>
        {monthCells.map(({ dateKey, inMonth }) => {
          const dayEvents = eventsByDate.get(dateKey) ?? [];
          const date = dateKeyParts(dateKey);
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === currentDateKey;
          const eventLabel = dayEvents.length === 0 ? 'tanpa agenda' : `${dayEvents.length} agenda`;
          return <button key={dateKey} type="button" className={`calendar-day-cell${inMonth ? '' : ' outside-month'}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`} aria-label={`${calendarDateLabel(dateKey, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${eventLabel}`} aria-pressed={isSelected} onClick={() => { setSelectedDateKey(dateKey); setView('day'); }}>
            <span className="calendar-day-number">{date.day}</span>{dayEvents.length > 0 && <span className="calendar-day-events"><span className="calendar-event-mark" aria-hidden="true" />{dayEvents.length}</span>}
          </button>;
        })}
      </div>
    </div>}

    {view === 'day' && <div className="calendar-day-view">
      <div className="calendar-day-summary"><strong>{calendarDateLabel(currentDateKey, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong><span>{currentEvents.length} agenda tercatat</span></div>
      {currentEvents.length === 0
        ? <div className="calendar-empty"><strong>Belum ada agenda pada tanggal ini.</strong><span>Agenda berasal dari status autopilot, tenggat proyek, pembayaran, masa berlaku kebijakan, dan riwayat aktivitas 180 hari terakhir.</span></div>
        : <ol className="calendar-event-list">{currentEvents.map((event) => <li key={event.id} className={`calendar-event calendar-event-${event.kind}`}>
          <div className="calendar-event-meta"><span className="calendar-event-source">{event.source}</span><span className="calendar-event-status">{event.kind === 'deadline' ? 'Tenggat' : event.kind === 'payment' ? 'Pembayaran' : event.kind === 'policy' ? 'Kebijakan' : event.kind === 'activity' ? 'Aktivitas' : 'Operasi'}</span><span className="calendar-event-date">{event.time ?? (event.kind === 'deadline' ? 'Tenggat' : event.kind === 'payment' ? 'Pembayaran' : event.kind === 'policy' ? 'Kebijakan' : event.kind === 'activity' ? 'Aktivitas' : 'Operasi')}</span></div>
          <div><strong>{event.title}</strong><span>{event.detail}</span></div>{event.href && <Link to={event.href} className="calendar-event-link">Buka detail</Link>}
        </li>)}</ol>}
      <div className="calendar-day-log">
        <h4>Rincian aktivitas hari ini</h4>
        {dayLog.isPending ? <p className="form-help" role="status">Memuat log aktivitas...</p>
          : dayLog.isError ? <p className="form-help">Log aktivitas hari ini tidak dapat dimuat.</p>
            : <><ActivityRows events={dayLog.data.events.slice(0, logLimit)} />{dayLog.data.events.length > logLimit && <button type="button" className="button button-secondary" onClick={() => setLogLimit(logLimit + 50)}>Tampilkan {Math.min(50, dayLog.data.events.length - logLimit)} catatan lagi ({dayLog.data.events.length - logLimit} tersisa)</button>}</>}
        {(agenda?.days[currentDateKey]?.skipped ?? 0) > 0 && <p className="form-help">{agenda?.days[currentDateKey]?.skipped} keputusan "peluang dilewati" tidak dirinci satu per satu; alasannya ada di kartu Ringkasan.</p>}
      </div>
    </div>}

    {view === 'year' && <div className="calendar-year-grid">
      {Array.from({ length: 12 }, (_, index) => {
        const monthDate = new Date(Date.UTC(year, index, 1));
        const monthKey = `${year}-${String(index + 1).padStart(2, '0')}`;
        const count = events.filter((event) => event.dateKey.startsWith(`${monthKey}-`)).length;
        return <button className="calendar-year-month" type="button" key={monthKey} aria-label={`${new Intl.DateTimeFormat('id-ID', { month: 'long', timeZone: 'UTC' }).format(monthDate)} ${year}, ${count} agenda`} onClick={() => { setSelectedDateKey(makeDateKey(year, index + 1, 1)); setView('month'); }}>
          <strong>{new Intl.DateTimeFormat('id-ID', { month: 'long', timeZone: 'UTC' }).format(monthDate)}</strong><span>{count === 0 ? 'Tidak ada agenda' : `${count} agenda`}</span>
        </button>;
      })}
    </div>}

    <div className="calendar-source-state" aria-live="polite">
      <span>Diperbarui {(() => { const latest = Math.max(autopilotQuery.dataUpdatedAt, agendaQuery.dataUpdatedAt, projectsQuery.dataUpdatedAt); return latest > 0 ? new Date(latest).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'belum diketahui'; })()}</span>
      {autopilotQuery.isPending && <span role="status">Memuat jadwal siklus server...</span>}
      {autopilotQuery.isError && <span role="alert" className="is-late">Jadwal siklus server tidak tersedia; data lama disembunyikan.</span>}
      {agendaQuery.isError && <span role="alert" className="is-late">Riwayat aktivitas tidak tersedia; data lama disembunyikan.</span>}
      {ownerAgenda.isError && <span role="alert" className="is-late">Agenda pemilik tidak tersedia; kalender belum lengkap.</span>}
      {projectsQuery.isError && <span role="alert" className="is-late">Penutupan listing tidak tersedia; kalender belum lengkap.</span>}
      {workPending && <span role="status">Memuat tenggat proyek dan pembayaran...</span>}
      {workError && <span role="alert" className="is-late">Tenggat proyek dan pembayaran tidak tersedia; data lama disembunyikan.</span>}
      <span>Penutupan listing Freelancer menggunakan hitungan dari sinkronisasi terakhir, bukan tanggal pasti.</span>
    </div>
  </section>;
}

export default function CalendarPage() {
  const clockNow = useClock(30_000);
  const operation = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 10_000 });
  const policyQuery = useQuery({ queryKey: ['policy'], queryFn: () => api<Policy>('/policy'), refetchInterval: 30_000 });
  const projectsQuery = useQuery({ queryKey: ['projects', 'calendar'], queryFn: () => api<Opportunity[]>('/projects'), refetchInterval: 30_000 });
  const dashboardQuery = useQuery({ queryKey: ['dashboard'], queryFn: () => api<{ counts: { openProjects: number; drafts: number; policySkips: number }; bidUsage: { today: number; week: number } }>('/dashboard'), refetchInterval: 10_000 });
  const workQuery = useQuery({ queryKey: ['work'], queryFn: () => api<Work>('/work'), refetchInterval: 10_000 });

  if (policyQuery.isPending || projectsQuery.isPending || dashboardQuery.isPending) return <LoadingPanel label="Menyiapkan kalender dan jadwal operasi..." />;
  if (policyQuery.isError || projectsQuery.isError || dashboardQuery.isError) return <ErrorNotice message="Gagal memuat data kalender." />;

  const policy = policyQuery.data;
  const projects = projectsQuery.data;
  const dashboard = dashboardQuery.data;

  const now = clockNow;
  const operationData = operation.isError ? undefined : operation.data;
  const isWithinHours = operationData?.state === 'running' && !operationData.waitingReason;
  const deadlineProjects = projects.filter((p) => p.source !== 'projects_co_id' && p.deadlineDays !== null).sort((a, b) => (a.deadlineDays ?? 0) - (b.deadlineDays ?? 0));
  const expiryDate = new Date(policy.expiresAt);
  const daysUntilExpiry = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return <>
    <PageIntro
      eyebrow="Jadwal"
      title="Kalender kerja"
      description="Agenda pemilik, tenggat proyek, dan pembayaran dalam satu kalender."
      action={<Link to="/operations" className="button button-primary">Kelola jadwal pemilik</Link>}
    />

    <div className="calendar-grid">
      <OperationsCalendar policy={policy} work={workQuery.isError ? undefined : workQuery.data} workPending={workQuery.isPending} workError={workQuery.isError} />

      <section className="calendar-card card-section">
        <h2>Jadwal automasi</h2>
        <div className={`hours-status-badge ${isWithinHours && policy.state === 'active' ? 'hours-active' : 'hours-inactive'}`} aria-live="polite">
          <span className="mode-indicator" style={{ background: isWithinHours && policy.state === 'active' ? 'var(--success)' : 'var(--danger)' }} aria-hidden="true" />
          {operation.isPending ? 'Memuat status operasi…' : !operationData ? 'Status operasi tidak tersedia' : operationData.waitingReason ?? (isWithinHours ? `Operasi aktif (${policy.activeHours.start}:00 - ${policy.activeHours.end}:00)` : 'Operasi memerlukan perhatian')}
        </div>
        <p className="form-help">
          Zona waktu kerja: <strong>{policy.timezone}</strong>. Hari aktif: {(policy.activeDays ?? [0, 1, 2, 3, 4, 5, 6]).map((day) => ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][day]).join(', ')}. Bid mengikuti jadwal dan masa berlaku kebijakan.
        </p>

        <div className="meter-row">
          <div className="meter-label">
            <span>Batas Penawaran Harian</span>
            <strong>{dashboard.bidUsage.today} / {policy.dailyBidLimit}</strong>
          </div>
          <div className="meter-track" role="progressbar" aria-label="Batas penawaran harian" aria-valuemin={0} aria-valuemax={Math.max(1, policy.dailyBidLimit)} aria-valuenow={dashboard.bidUsage.today}>
            <div className="meter-fill" style={{ width: `${Math.min(100, Math.round((dashboard.bidUsage.today / (policy.dailyBidLimit || 1)) * 100))}%` }} />
          </div>
        </div>

        <div className="meter-row">
          <div className="meter-label">
            <span>Batas Penawaran Mingguan</span>
            <strong>{dashboard.bidUsage.week} / {policy.weeklyBidLimit}</strong>
          </div>
          <div className="meter-track" role="progressbar" aria-label="Batas penawaran mingguan" aria-valuemin={0} aria-valuemax={Math.max(1, policy.weeklyBidLimit)} aria-valuenow={dashboard.bidUsage.week}>
            <div className="meter-fill" style={{ width: `${Math.min(100, Math.round((dashboard.bidUsage.week / (policy.weeklyBidLimit || 1)) * 100))}%` }} />
          </div>
        </div>
        <p className="form-help">Dihitung dari bid live yang tercatat berhasil di log audit.</p>
      </section>

      <section className="calendar-card card-section">
        <h2>Masa berlaku kebijakan</h2>
        <p className="form-help">
          Pengiriman bid mengikuti masa berlaku dan jadwal kebijakan tersimpan.
        </p>
        <div className="calendar-expiry">
          <div>
            <span className="calendar-expiry-label">Kedaluwarsa pada</span>
            <strong>{formatDate(policy.expiresAt)}</strong>
          </div>
          <div>
            <span className="calendar-expiry-label">Sisa waktu</span>
            <strong className={daysUntilExpiry <= 3 ? 'is-late' : 'is-ok'}>{daysUntilExpiry} hari lagi</strong>
          </div>
        </div>
        <Link to="/policy" className="button button-secondary button-wide">
          Lihat kebijakan
        </Link>
      </section>

      <section className="calendar-card calendar-wide card-section">
        {(() => {
          const clientDeadlines = (workQuery.data?.projects ?? []).filter((item) => item.status === 'active' && item.daysToDeadline !== null);
          return <>
            <h2>Tenggat proyek klien ({workQuery.isError || workQuery.isPending ? '–' : clientDeadlines.length})</h2>
            {workQuery.isError ? <p className="form-help">Data proyek klien tidak dapat dimuat.</p>
              : workQuery.isPending ? <p className="form-help">Memuat tenggat proyek klien...</p>
                : clientDeadlines.length === 0 ? <p className="form-help">Belum ada tenggat proyek klien. <Link to="/work">Tambahkan proyek</Link></p>
                  : <ul className="deadlines-list">{clientDeadlines.map((item) => <li className="deadline-item" key={item.id}>
                    <div><Link to="/work" className="item-link">{item.title}</Link><div className="item-sub">Klien: {item.client} · {item.deadline}</div></div>
                    <div className="item-aside"><strong className={(item.daysToDeadline ?? 0) <= 2 ? 'is-late' : ''}>{deadlineLabel(item.daysToDeadline)}</strong></div>
                  </li>)}</ul>}
          </>;
        })()}
      </section>

      <section className="calendar-card calendar-wide card-section">
        <details className="card-disclosure"><summary>Penutupan listing Freelancer ({deadlineProjects.length})</summary>
        {projectsQuery.isFetching && <p className="form-help" role="status">Menyegarkan penutupan listing…</p>}
        {deadlineProjects.length === 0 ? (
          <p className="form-help">Belum ada proyek dengan tenggat tercatat.</p>
        ) : (
          <ul className="deadlines-list">
            {deadlineProjects.map((p) => (
              <li className="deadline-item" key={p.id}>
                <div>
                  <Link to={`/opportunities?project=${encodeURIComponent(p.id)}`} className="item-link">
                    {p.title}
                  </Link>
                  <div className="item-sub">
                    Klien: {p.clientName} · {formatMoney(p.budgetMin, p.currency)} - {formatMoney(p.budgetMax, p.currency)}
                  </div>
                </div>
                <div className="item-aside">
                  <strong className={(p.deadlineDays ?? 0) <= 3 ? 'is-late' : ''}>
                    {p.deadlineDays} hari
                  </strong>
                  <div className="item-sub">Sisa hari saat sinkronisasi terakhir</div>
                </div>
              </li>
            ))}
          </ul>
        )}</details>
      </section>
    </div>
  </>;
}
