import { describe, expect, it } from 'vitest';
import type { Autopilot } from '../api/api.js';
import { BOARD_SIZE, BOARDS, dayPhase, FLOOR, planPath, spotsFor, SPINE_X } from './office-layout.js';
import { deriveOfficeAgents, ROSTER } from './office-state.js';

const autopilot = (cycleInProgress: boolean): Autopilot => ({
  state: 'running', cycleInProgress, lastRunAt: null, nextRunAt: null, lastMessage: '', lastImported: 0, lastSubmitted: 0, specializations: [],
});

describe('office layout', () => {
  it('gives every placed agent its own spot and skips offline agents', () => {
    for (const data of [autopilot(true), autopilot(false), undefined]) {
      for(const floor of [1,2]) {
      const agents = deriveOfficeAgents(data, [], { kanban: null }).filter(a=>(a.floor ?? 1)===floor);
      const spots = spotsFor(agents);
      expect(spots.size).toBe(agents.filter((agent) => agent.room).length);
      expect(new Set([...spots.values()].map((spot) => `${spot.x},${spot.z}`)).size).toBe(spots.size);
      for (const agent of agents.filter((item) => !item.room)) expect(spots.has(agent.id)).toBe(false);
      }
    }
  });

  it('keeps all idle floor-one employees in separate break spots including the browser operator', () => {
    const agents=ROSTER.filter(a=>(a.floor ?? 1)===1 && a.id!=='qa-engineer').map(a=>({...a,state:'idle' as const,room:'lounge' as const,reason:'Fixture',task:null,recentActivity:[]}));
    const spots=spotsFor(agents);
    expect(new Set([...spots.values()].map(s=>s.x+','+s.z)).size).toBe(agents.length);
  });

  it('keeps shared-room seats stable when agents enter or leave room', () => {
    const make = (ids: string[]) => ROSTER.filter((entry) => ids.includes(entry.id)).map((entry) => ({
      ...entry, state: 'idle' as const, room: 'lounge' as const, reason: 'Fixture', task: null, recentActivity: [],
    }));
    const marketOnly = spotsFor(make(['market-scout'])).get('market-scout');
    const marketWithOthers = spotsFor(make(['market-scout', 'bid-strategist', 'client-relations'])).get('market-scout');
    expect(marketWithOthers).toEqual(marketOnly);
    expect(spotsFor(make(['client-relations', 'bid-strategist', 'market-scout'])).get('market-scout')).toEqual(marketOnly);
  });

  it('keeps dedicated desks separate from each other', () => {
    const agents = ROSTER.filter((entry) => (entry.floor ?? 1) === 1).map((entry) => ({
      ...entry, state: 'working' as const, room: 'workspace' as const, reason: 'Fixture', task: null, recentActivity: [],
    }));
    const spots = spotsFor(agents);
    const keys = agents.map((agent) => `${spots.get(agent.id)?.x},${spots.get(agent.id)?.z}`);
    expect(new Set(keys).size).toBe(keys.length);
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
    expect(BOARDS.find(b => b.id === 'projects-co-id')?.route).toBe('/projects-co-id');
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
