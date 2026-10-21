import { api } from './api.js';
import type { HermesKanbanStatus } from '../../../server/src/models/hermes-kanban-types.js';
import type { OfficeLearningStatus } from '../../../server/src/models/office-learning-types.js';

export const kanbanQuery = { queryKey: ['hermes-kanban'], queryFn: () => api<HermesKanbanStatus | null>('/hermes-kanban'), refetchInterval: 30_000 };
export const officeLearningQuery = { queryKey: ['office-learning'], queryFn: () => api<OfficeLearningStatus | null>('/office-learning'), refetchInterval: 5_000 };
