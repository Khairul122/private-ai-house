import { describe, expect, it } from 'vitest';
import { LIVE_TOPICS } from '@fvh/domain';
import { queryKeysFor, TOPIC_QUERY_KEYS } from './live.js';

describe('live topic -> query keys', () => {
  it('maps every server topic to at least its own card', () => {
    for (const topic of LIVE_TOPICS) expect(TOPIC_QUERY_KEYS[topic].length).toBeGreaterThan(0);
    expect(queryKeysFor(['policy'])).toEqual(['policy']);
    expect(queryKeysFor(['autopilot'])).toContain('autopilot');
    expect(queryKeysFor(['projects-co-id'])).toEqual(['projects-co-id', 'projects-co-id-drafts']);
  });

  it('merges duplicates and ignores unknown or hostile input', () => {
    expect(queryKeysFor(['activity', 'pipeline'])).toEqual(['activity', 'agenda', 'insights', 'autopilot', 'pipeline', 'projects', 'draft']);
    expect(queryKeysFor(['toString', '__proto__', 'nope', 42])).toEqual([]);
    expect(queryKeysFor('policy')).toEqual([]);
    expect(queryKeysFor(undefined)).toEqual([]);
  });
});
