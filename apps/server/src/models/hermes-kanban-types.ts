// Shared with the web app, so this file stays free of runtime imports.
export type HermesKanbanTask = {
  id: string; title: string; assignee: string | null; status: string; createdBy: string | null;
  createdAt: string | null; startedAt: string | null; completedAt: string | null; error: string | null;
};
export type HermesKanbanStatus = { available: boolean; reason: string; board: string; checkedAt: string; team: string[]; tasks: HermesKanbanTask[] };
export type HermesKanbanDetail = {
  id: string; summary: string | null; children: string[];
  runs: Array<{ profile: string | null; outcome: string | null; summary: string | null; error: string | null; startedAt: string | null; endedAt: string | null }>;
};
