import { describe, expect, it } from 'vitest';
import { createOfficeLife, IDLE_SPOTS, planOfficeRoute, updateOfficeLife } from './office-life.js';
import { ownerCanStand, ownerCanWalk } from './owner-motion.js';
import { ROSTER, type OfficeAgent } from './office-state.js';
import { spotsFor, type P2 } from './office-layout.js';

const team: OfficeAgent[] = ROSTER.map((agent) => ({ ...agent, state: 'idle', room: 'lounge', task: null, reason: 'Ready', recentActivity: [] }));

describe('ambient office routines', () => {
  it('plans at most one new ambient journey per tick after a long pause', () => {
    const life = createOfficeLife();
    updateOfficeLife(life, team, 0, false);
    updateOfficeLife(life, team, 600, false);
    expect([...life.routines.values()].reduce((sum, routine) => sum + routine.visits, 0)).toBe(1);
  });
  it('reserves distinct floor slots, walks between activities, and preserves real status', () => {
    const life = createOfficeLife();
    const original = JSON.stringify(team);
    updateOfficeLife(life, team, 0, false);
    const initial = new Map([...life.routines].map(([id, routine]) => [id, routine.slot]));
    for (let now = 1; now <= 180; now++) {
      updateOfficeLife(life, team, now, false);
      const assigned = [...life.routines.values()];
      expect(new Set(assigned.map((routine) => `${routine.floor}:${routine.slot}`)).size).toBe(team.length);
    }
    expect([...life.routines].some(([id, routine]) => routine.slot !== initial.get(id))).toBe(true);
    expect([...life.routines.values()].every((routine) => routine.visits > 0)).toBe(true);
    expect(JSON.stringify(team)).toBe(original);
  });

  it('preempts ambient activity immediately when real work or unavailable data arrives', () => {
    const life = createOfficeLife();
    updateOfficeLife(life, team, 0, false);
    for (const state of ['working', 'reviewing', 'collaborating', 'offline', 'unknown'] as const) {
      const changed = team.map((agent, index) => index === 0 ? { ...agent, state } : agent);
      updateOfficeLife(life, changed, 0, false);
      expect(life.routines.has(team[0]!.id)).toBe(false);
      updateOfficeLife(life, team, 0, false);
      expect(life.routines.has(team[0]!.id)).toBe(true);
    }
  });

  it('keeps ambient routines data-only and never invents tasks or mutates agent state', () => {
    const life = createOfficeLife();
    const before = structuredClone(team);
    updateOfficeLife(life, team, 100, false);
    updateOfficeLife(life, team, 200, false);
    expect(team).toEqual(before);
    for (const routine of life.routines.values()) {
      expect(routine.activity).toBeDefined();
      expect(routine).not.toHaveProperty('task');
      expect(routine).not.toHaveProperty('reason');
    }
  });

  it('keeps existing assignments when input order changes and freezes roaming with reduced motion', () => {
    const life = createOfficeLife();
    updateOfficeLife(life, team, 0, false);
    const slots = () => [...life.routines].map(([id, routine]) => [id, routine.slot]);
    const initial = slots();
    updateOfficeLife(life, [...team].reverse(), 1, false);
    expect(slots()).toEqual(initial);
    for (let now = 2; now <= 200; now++) updateOfficeLife(life, team, now, true);
    expect(slots()).toEqual(initial);
    updateOfficeLife(life, team, 201, false);
    expect(slots()).toEqual(initial);
    updateOfficeLife(life, team, 220, false);
    expect(slots()).not.toEqual(initial);
  });

  it('keeps every idle destination and every route outside solid furniture', () => {
    for (const source of IDLE_SPOTS) {
      expect(ownerCanStand(source.x, source.z), `blocked destination ${source.x},${source.z}`).toBe(true);
      for (const target of IDLE_SPOTS) {
        let previous: P2 = [source.x, source.z];
        const path = planOfficeRoute(previous, source, target);
        expect(path.length).toBeGreaterThan(0);
        for (const point of path) {
          expect(ownerCanWalk(previous, point), `blocked route ${previous} to ${point}`).toBe(true);
          previous = point;
        }
        expect(previous).toEqual([target.x, target.z]);
      }
    }
  });

  it('routes work transitions from actual position and allows leaving or entering a chair', () => {
    const work = team.map((agent): OfficeAgent => ({ ...agent, state: 'working', room: 'workspace' }));
    const desks = spotsFor(work);
    const idle = IDLE_SPOTS[0]!;
    for (const desk of desks.values()) {
      expect(planOfficeRoute([desk.x, desk.z], desk, idle).at(-1)).toEqual([idle.x, idle.z]);
      const returning = planOfficeRoute([idle.x, idle.z], idle, desk);
      expect(returning.at(-1)).toEqual([desk.x, desk.z]);
      const interrupted: P2 = [10.1, 0.8];
      const resumed = planOfficeRoute(interrupted, idle, desk);
      expect(ownerCanWalk(interrupted, resumed[0]!)).toBe(true);
      expect(resumed.at(-1)).toEqual([desk.x, desk.z]);
    }
  });
});
