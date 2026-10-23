import { describe, expect, it } from 'vitest';
import { parsePlan, planInstructions } from './hermes-workflow.js';

describe('bounded Hermes plans', () => {
  const task = { title: 'Cari peluang', goal: 'Bandingkan peluang tersimpan', assignee: 'fvh-market-scout', parents: [] };
  it('accepts only an acyclic plan of one to six known specialists', () => {
    expect(parsePlan(JSON.stringify({ tasks: [task] }), false).tasks).toHaveLength(1);
    for (const tasks of [[], Array(7).fill(task), [{ ...task, assignee: 'default' }], [{ ...task, assignee: 'fvh-chief-of-staff' }], [{ ...task, parents: [0] }]]) {
      expect(() => parsePlan(JSON.stringify({ tasks }), false)).toThrow();
    }
    expect(planInstructions(false)).toContain('FVH_PLAN_V1');
  });
  it('rejects all code handoffs from a goal carrying app data', () => {
    const code = JSON.stringify({ tasks: [{ ...task, assignee: 'fvh-qa-engineer' }] });
    expect(() => parsePlan(code, true)).toThrow();
    expect(parsePlan(code, false).tasks[0]?.assignee).toBe('fvh-qa-engineer');
  });
});
