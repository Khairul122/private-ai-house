import { describe, expect, it } from 'vitest';
import type { Autopilot } from './api.js';
import { BOARD_SIZE, BOARDS, dayPhase, FLOOR, planPath, spotsFor, SPINE_X } from './office-layout.js';
import { deriveOfficeAgents } from './office-state.js';

const autopilot = (cycleInProgress: boolean): Autopilot => ({
  state: 'running', cycleInProgress, lastRunAt: null, nextRunAt: null, lastMessage: '', lastImported: 0, lastSubmitted: 0, specializations: [],
});

describe('office layout', () => {
  it('gives every placed agent its own spot and skips offline agents', () => {
    for (const data of [autopilot(true), autopilot(false), undefined]) {
      for(const floor of [1,2]) {
      const agents = deriveOfficeAgents(data, []).filter(a=>(a.floor ?? 1)===floor);
      const spots = spotsFor(agents);
      expect(spots.size).toBe(agents.filter((agent) => agent.room).length);
      expect(new Set([...spots.values()].map((spot) => `${spot.x},${spot.z}`)).size).toBe(spots.size);
      expect(spots.has('qa-engineer')).toBe(false);
      }
    }
  });

  it('routes between rooms through the corridor spine', () => {
    const working = spotsFor(deriveOfficeAgents(autopilot(true), [])).get('market-scout')!;
    const idle = spotsFor(deriveOfficeAgents(autopilot(false), [])).get('market-scout')!;
    const path = planPath(working, idle);
    expect(path.at(-1)).toEqual([idle.x, idle.z]);
    expect(path.filter(([x]) => x === SPINE_X).length).toBeGreaterThanOrEqual(2);
    expect(planPath(null, idle)).toEqual([[idle.x, idle.z]]);
  });

  it('labels the time of day from the clock', () => {
    expect(dayPhase(12).label).toBe('Siang');
    expect(dayPhase(22).night).toBe(true);
  });

  it('mounts every board inside its wall without overlap and with a unique route', () => {
    expect(new Set(BOARDS.map((board) => board.route)).size).toBe(BOARDS.length);
    for (const floor of [1,2]) for (const wall of [0, Math.PI / 2]) {
      const along = BOARDS.filter((board) => board.rotY === wall && (board.floor ?? 1)===floor).map((board) => (wall === 0 ? board.x : board.z)).sort((a, b) => a - b);
      if(!along.length) continue;
      along.forEach((value, index) => { if (index) expect(value - along[index - 1]!).toBeGreaterThan(BOARD_SIZE.w); });
      const [min, max] = wall === 0 ? [FLOOR.minX, FLOOR.maxX] : [FLOOR.minZ, FLOOR.maxZ];
      expect(along[0]! - BOARD_SIZE.w / 2).toBeGreaterThan(min);
      expect(along.at(-1)! + BOARD_SIZE.w / 2).toBeLessThan(max);
    }
  });
});
