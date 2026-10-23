import { describe, expect, it } from 'vitest';
import { kanbanStage, kanbanSubmission } from './kanban-state.js';

describe('kanban goals and submissions', () => {
  it('never displays decomposition completion as completion of the goal', () => {
    expect(kanbanStage({ status: 'done', goalStatus: 'running' })).toBe('running');
    expect(kanbanStage({ status: 'done', goalStatus: 'blocked' })).toBe('blocked');
    expect(kanbanStage({ status: 'done', goalStatus: 'done' })).toBe('done');
    expect(kanbanStage({ status: 'ready', goalStatus: 'planning' })).toBe('ready');
    expect(kanbanStage({ status: 'running', goalStatus: 'planning' })).toBe('running');
  });
  it('keeps the same identity for a retry, but gives a new submission a new identity', () => {
    const first = kanbanSubmission(null, { title: 'Prioritas hari ini' }, () => 'one');
    expect(kanbanSubmission(first, { title: 'Prioritas hari ini' }, () => 'two')).toBe(first);
    expect(kanbanSubmission(first, { title: 'Prioritas besok' }, () => 'two').id).toBe('two');
    expect(kanbanSubmission(null, { title: 'Prioritas hari ini' }, () => 'three').id).toBe('three');
  });
});
