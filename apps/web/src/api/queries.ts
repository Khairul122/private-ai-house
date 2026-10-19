import { api } from './api.js';
import type { HermesKanbanStatus } from '../../../server/src/models/hermes-kanban-types.js';

export const kanbanQuery = { queryKey: ['hermes-kanban'], queryFn: () => api<HermesKanbanStatus | null>('/hermes-kanban'), refetchInterval: 30_000 };
