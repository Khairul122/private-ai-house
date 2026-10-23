import type { HermesKanbanTask } from '../../../server/src/models/hermes-kanban-types.js';

export function kanbanStage(task: Pick<HermesKanbanTask, 'status' | 'goalStatus'>): string {
  if (task.goalStatus) return task.goalStatus === 'planning' ? 'ready' : task.goalStatus;
  return task.status;
}

export function kanbanSubmission(previous: { signature: string; id: string } | null, payload: unknown, uuid: () => string) {
  const signature = JSON.stringify(payload);
  return previous?.signature === signature ? previous : { signature, id: uuid() };
}
