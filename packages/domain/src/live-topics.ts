/** Data areas the server announces on GET /api/events; the web maps each to the react-query keys it refetches. */
export const LIVE_TOPICS = ['activity', 'autopilot', 'business-sync', 'pipeline', 'dashboard', 'inbox', 'work', 'policy', 'profile', 'knowledge', 'capabilities', 'projects-co-id', 'browser-bidding', 'operations', 'hermes-kanban'] as const;
export type LiveTopic = typeof LIVE_TOPICS[number];
