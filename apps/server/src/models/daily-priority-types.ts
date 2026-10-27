export type PrioritySourceKey = 'messages' | 'projects' | 'tasks' | 'invoices' | 'payments' | 'kanban' | 'reports';
export type PrioritySource = { state: 'available' | 'stale' | 'failed' | 'unknown'; observedAt: string | null; reason: string | null };
export type PriorityItem = {
  id: string;
  kind: 'deadline' | 'reply' | 'blocker' | 'invoice' | 'payment' | 'task';
  title: string;
  reason: string;
  decision: string;
  href: string;
  sourceId: string;
  source: PrioritySourceKey;
  observedAt: string;
  dueAt: string | null;
  rule: string;
};
export type DailyPrioritySummary = {
  day: string;
  revision: number;
  capturedAt: string;
  state: 'complete' | 'partial';
  sources: Record<PrioritySourceKey, PrioritySource>;
  reports: Array<{ id: string; floor: 1 | 2; createdAt: string; state: string }>;
  items: PriorityItem[];
};
