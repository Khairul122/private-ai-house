export type OfficeLearningSession = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  participantIds: string[];
  topic: string;
  turns: Array<{ employeeId: string; message: string }>;
  state: 'running' | 'completed' | 'failed';
  error: string | null;
};
export type OfficeLearningMemory = { employeeId: string; lesson: string; sessionId: string; createdAt: string };
export type OfficeLearningStatus = {
  enabled: boolean;
  available: boolean;
  busy: boolean;
  reason: string;
  phase: 'idle' | 'learning' | 'discussing' | 'error';
  participantIds: string[];
  activeSpeakerId: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  sessionsToday: number;
  dailyLimit: number;
  intervalMinutes: number;
  sessions: OfficeLearningSession[];
  memories: OfficeLearningMemory[];
};
