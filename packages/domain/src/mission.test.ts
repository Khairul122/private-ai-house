import { describe, expect, it } from 'vitest';
import { canTransitionMission } from './mission.js';

describe('mission transitions', () => {
  it('allows work, blocking and recovery, but keeps terminal states terminal', () => {
    expect(canTransitionMission('queued', 'in_progress')).toBe(true);
    expect(canTransitionMission('in_progress', 'blocked')).toBe(true);
    expect(canTransitionMission('blocked', 'queued')).toBe(true);
    expect(canTransitionMission('in_progress', 'completed')).toBe(true);
    expect(canTransitionMission('queued', 'completed')).toBe(false);
    expect(canTransitionMission('completed', 'queued')).toBe(false);
    expect(canTransitionMission('canceled', 'in_progress')).toBe(false);
  });
});
