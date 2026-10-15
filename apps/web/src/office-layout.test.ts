import { describe, expect, it } from 'vitest';
import type { Autopilot } from './api.js';
import { dayPhase, planPath, spotsFor, SPINE_X } from './office-layout.js';
import { deriveOfficeAgents } from './office-state.js';

const autopilot = (cycleInProgress: boolean): Autopilot => ({
  state: 'running', cycleInProgress, lastRunAt: null, nextRunAt: null, lastMessage: '', lastImported: 0, lastSubmitted: 0, specializations: [],
});

describe('office layout', () => {
  it('gives every placed agent its own spot and skips offline agents', () => {
    for (const data of [autopilot(true), autopilot(false), undefined]) {
      const agents = deriveOfficeAgents(data, []);
      const spots = spotsFor(agents);
      expect(spots.size).toBe(agents.filter((agent) => agent.room).length);
      expect(new Set([...spots.values()].map((spot) => `${spot.x},${spot.z}`)).size).toBe(spots.size);
      expect(spots.has('qa-engineer')).toBe(false);
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
});
