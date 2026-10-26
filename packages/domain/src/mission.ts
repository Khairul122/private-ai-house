export const MISSION_SOURCES = ['hermes_kanban', 'opportunity', 'inbox', 'client_operations', 'payment', 'deadline', 'knowledge'] as const;
export const MISSION_STATUSES = ['queued', 'in_progress', 'blocked', 'completed', 'canceled'] as const;
export const MISSION_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export type MissionSource = typeof MISSION_SOURCES[number];
export type MissionStatus = typeof MISSION_STATUSES[number];
export type MissionPriority = typeof MISSION_PRIORITIES[number];

/** Only source references belong here. Never copy message bodies, proposals, or credentials. */
export type MissionPayload = Partial<Record<'projectId' | 'threadId' | 'paymentId' | 'taskId' | 'knowledgeSourceId', string>>;

export type MissionItem = {
  id: string;
  source: MissionSource;
  sourceId: string;
  kind: string;
  title: string;
  status: MissionStatus;
  priority: MissionPriority;
  dueAt: string | null;
  assignedTo: string | null;
  payload: MissionPayload;
  blocker: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MissionLease = {
  missionId: string;
  claimant: string;
  leaseId: string;
  claimedAt: string;
  leaseUntil: string;
};

const transitions: Record<MissionStatus, readonly MissionStatus[]> = {
  queued: ['in_progress', 'blocked', 'canceled'],
  in_progress: ['blocked', 'completed', 'canceled'],
  blocked: ['queued', 'canceled'],
  completed: [],
  canceled: [],
};

export function canTransitionMission(current: MissionStatus, next: MissionStatus): boolean {
  return transitions[current].includes(next);
}
