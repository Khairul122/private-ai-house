import type { MissionPriority, MissionStatus } from './mission.js';

/** Deterministic order also breaks ties, so the same facts always produce the same list. */
export const DAILY_ACTION_KINDS = ['payment_due', 'project_deadline', 'mission_due', 'message_waiting', 'bid_follow_up'] as const;
export type DailyActionKind = typeof DAILY_ACTION_KINDS[number];

export type DailyAction = {
  id: string;
  kind: DailyActionKind;
  title: string;
  /** The explicit rule that put this action on the list. */
  reason: string;
  dueAt: string | null;
  linkTo: string;
  source: string;
};

export type DailyCurrencyTotal = { currency: string; amount: number; payments: number };

export type DailySourceState = {
  name: string;
  status: 'ok' | 'failed' | 'unknown';
  lastRunAt: string | null;
  note: string | null;
};

export type DailyPriority = {
  /** Calendar day in Asia/Jakarta (YYYY-MM-DD). */
  day: string;
  generatedAt: string;
  actions: DailyAction[];
  /** Outstanding payments stay separated per currency; no cross-rate summing. */
  currencyTotals: DailyCurrencyTotal[];
  sources: DailySourceState[];
};

export type DailyPriorityFacts = {
  payments: Array<{ id: string; projectTitle: string; amount: number; currency: string; dueDate: string | null; status: 'expected' | 'received' }>;
  deadlines: Array<{ id: string; title: string; deadline: string | null; daysToDeadline: number | null; status: 'active' | 'delivered' | 'closed' }>;
  missions: Array<{ id: string; title: string; priority: MissionPriority; dueAt: string | null; status: MissionStatus }>;
  /** Only threads whose last message came from someone else and is already stored. */
  messages: Array<{ threadId: string; projectTitle: string | null; waitingHours: number; lastMessageAt: string }>;
  followUps: Array<{ projectId: string; title: string; daysSinceBid: number; submittedAt: string }>;
};

const WIB_DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
const MAX_ACTIONS = 12;

/** Asia/Jakarta calendar day, independent of the host timezone. */
export function wibDay(date: Date): string {
  const parts = WIB_DATE.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

/** Whole days from `day` (WIB date) to an ISO timestamp, negative when the timestamp is earlier. */
export function daysFromWibDay(day: string, timestamp: string): number | null {
  const target = Date.parse(timestamp);
  if (!Number.isFinite(target)) return null;
  const shifted = target + 7 * 3_600_000;
  const targetDay = new Date(shifted).toISOString().slice(0, 10);
  const difference = (Date.parse(`${targetDay}T00:00:00.000Z`) - dayNumber(day)) / 86_400_000;
  return Number.isFinite(difference) ? Math.round(difference) : null;
}

type Scored = { action: DailyAction; points: number };

function paymentActions(facts: DailyPriorityFacts, day: string): Scored[] {
  return facts.payments.filter((payment) => payment.status === 'expected').map((payment) => {
    const days = payment.dueDate ? daysFromWibDay(day, `${payment.dueDate}T00:00:00.000Z`) : null;
    let points = 20;
    let reason = 'Tagihan belum diterima dan belum memiliki tenggat tercatat.';
    if (days !== null && days < 0) { points = 100; reason = `Tagihan sudah lewat tenggat ${Math.abs(days)} hari.`; }
    else if (days === 0) { points = 95; reason = 'Tagihan jatuh tempo hari ini.'; }
    else if (days !== null && days <= 3) { points = 70; reason = `Tagihan jatuh tempo dalam ${days} hari.`; }
    else if (days !== null && days <= 7) { points = 45; reason = `Tagihan jatuh tempo dalam ${days} hari.`; }
    else if (days !== null) { points = 25; reason = `Tagihan jatuh tempo dalam ${days} hari.`; }
    return {
      points,
      action: {
        id: `payment:${payment.id}`, kind: 'payment_due' as const,
        title: `Tagih ${payment.currency} ${payment.amount} - ${payment.projectTitle}`,
        reason, dueAt: payment.dueDate ? `${payment.dueDate}T00:00:00.000Z` : null,
        linkTo: '/work', source: 'Pembayaran',
      },
    };
  });
}

function deadlineActions(facts: DailyPriorityFacts): Scored[] {
  return facts.deadlines.filter((project) => project.status === 'active').map((project) => {
    const days = project.daysToDeadline;
    let points = 15;
    let reason: string;
    if (days === null) reason = 'Proyek aktif tanpa tenggat tercatat.';
    else if (days <= 0) { points = 90; reason = days === 0 ? 'Tenggat proyek hari ini.' : `Tenggat proyek lewat ${Math.abs(days)} hari.`; }
    else if (days <= 2) { points = 65; reason = `Tenggat proyek dalam ${days} hari.`; }
    else if (days <= 7) { points = 40; reason = `Tenggat proyek dalam ${days} hari.`; }
    else { points = 20; reason = `Tenggat proyek dalam ${days} hari.`; }
    return {
      points,
      action: {
        id: `deadline:${project.id}`, kind: 'project_deadline' as const, title: project.title,
        reason, dueAt: project.deadline ? `${project.deadline}T00:00:00.000Z` : null,
        linkTo: '/work', source: 'Proyek aktif',
      },
    };
  });
}

const MISSION_POINTS: Record<MissionPriority, number> = { urgent: 85, high: 60, normal: 25, low: 10 };

function missionActions(facts: DailyPriorityFacts, day: string): Scored[] {
  return facts.missions.filter((mission) => mission.status === 'queued' || mission.status === 'in_progress' || mission.status === 'blocked').map((mission) => {
    let points = MISSION_POINTS[mission.priority];
    const reasons: string[] = [`Mission ${mission.priority}.`];
    if (mission.status === 'blocked') { points += 10; reasons.push('Mission tertahan.'); }
    if (mission.dueAt) {
      const days = daysFromWibDay(day, mission.dueAt);
      if (days !== null && days <= 0) { points += 15; reasons.push('Tenggat tercapai.'); }
    }
    return {
      points,
      action: {
        id: `mission:${mission.id}`, kind: 'mission_due' as const, title: mission.title,
        reason: reasons.join(' '), dueAt: mission.dueAt, linkTo: '/tasks', source: 'Antrean mission',
      },
    };
  });
}

function messageActions(facts: DailyPriorityFacts): Scored[] {
  return facts.messages.map((thread) => {
    const hours = Math.max(0, thread.waitingHours);
    const points = hours >= 48 ? 75 : hours >= 24 ? 55 : hours >= 4 ? 35 : 15;
    return {
      points,
      action: {
        id: `message:${thread.threadId}`, kind: 'message_waiting' as const,
        title: thread.projectTitle ?? 'Percakapan tanpa proyek tersinkron',
        reason: `Pesan klien menunggu balasan ${hours} jam.`, dueAt: null,
        linkTo: '/inbox', source: 'Pesan klien',
      },
    };
  });
}

function followUpActions(facts: DailyPriorityFacts): Scored[] {
  return facts.followUps.map((bid) => ({
    points: bid.daysSinceBid >= 7 ? 50 : 30,
    action: {
      id: `follow-up:${bid.projectId}`, kind: 'bid_follow_up' as const, title: bid.title,
      reason: `Bid ${bid.daysSinceBid} hari tanpa percakapan klien.`, dueAt: null,
      linkTo: '/inbox', source: 'Tindak lanjut bid',
    },
  }));
}

function compare(a: Scored, b: Scored): number {
  if (a.points !== b.points) return b.points - a.points;
  const aDue = a.action.dueAt ? Date.parse(a.action.dueAt) : Number.POSITIVE_INFINITY;
  const bDue = b.action.dueAt ? Date.parse(b.action.dueAt) : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  const kind = DAILY_ACTION_KINDS.indexOf(a.action.kind) - DAILY_ACTION_KINDS.indexOf(b.action.kind);
  if (kind !== 0) return kind;
  return a.action.id.localeCompare(b.action.id);
}

function currencyTotals(payments: DailyPriorityFacts['payments']): DailyCurrencyTotal[] {
  const totals = new Map<string, DailyCurrencyTotal>();
  for (const payment of payments) {
    if (payment.status !== 'expected') continue;
    const current = totals.get(payment.currency) ?? { currency: payment.currency, amount: 0, payments: 0 };
    totals.set(payment.currency, { currency: payment.currency, amount: Math.round((current.amount + payment.amount) * 100) / 100, payments: current.payments + 1 });
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * Ranks the owner's next actions from stored facts only. Ordering rules are explicit:
 * overdue money, project deadlines, mission priority/due date, waiting messages, then bid follow-ups.
 */
export function buildDailyPriority(input: {
  facts: DailyPriorityFacts;
  day: string;
  generatedAt: string;
  sources: DailySourceState[];
  limit?: number;
}): DailyPriority {
  const { facts, day, generatedAt, sources } = input;
  const scored = [
    ...paymentActions(facts, day),
    ...deadlineActions(facts),
    ...missionActions(facts, day),
    ...messageActions(facts),
    ...followUpActions(facts),
  ].sort(compare);
  return {
    day, generatedAt, sources,
    actions: scored.slice(0, input.limit ?? MAX_ACTIONS).map((item) => item.action),
    currencyTotals: currencyTotals(facts.payments),
  };
}
