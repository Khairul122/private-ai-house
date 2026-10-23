import { describe, expect, it } from 'vitest';
import { invitationSpot } from './office-interaction.js';
import { ROSTER, type OfficeAgent } from './office-state.js';
import { IDLE_SPOTS, planOfficeRoute } from './office-life.js';
import { ownerCanStand } from './owner-motion.js';
import { spotsFor } from './office-layout.js';

const team: OfficeAgent[] = ROSTER.filter(agent => (agent.floor ?? 1) === 1).map(agent => ({ ...agent, state: 'idle', room: 'lounge', task: null, reason: 'Ready', recentActivity: [] }));

describe('owner invitations', () => {
  it('uses reachable destinations without changing real status', () => {
    const before = structuredClone(team);
    for (const place of ['owner', 'meeting'] as const) {
      const spot = invitationSpot(team, { id: team[0]!.id, place })!;
      expect(spot).toBeDefined();
      if (place === 'owner') expect(ownerCanStand(spot.x, spot.z)).toBe(true);
      const start = IDLE_SPOTS[0]!;
      expect(planOfficeRoute([start.x, start.z], start, spot).at(-1)).toEqual([spot.x, spot.z]);
    }
    expect(team).toEqual(before);
  });
  it('gives real work and unavailable states priority over invitations', () => {
    for (const state of ['working', 'reviewing', 'collaborating', 'offline', 'unknown'] as const) {
      expect(invitationSpot([{ ...team[0]!, state }], { id: team[0]!.id, place: 'owner' })).toBeUndefined();
    }
    expect(invitationSpot(team, null)).toBeUndefined();
    expect(invitationSpot(team, { id: 'missing', place: 'meeting' })).toBeUndefined();
  });
  it('reserves an unoccupied meeting seat and rejects a full room', () => {
    const occupied = team.map((agent, index): OfficeAgent => index > 0 && index < 8 ? { ...agent, state: 'collaborating', room: 'meeting' } : agent);
    const spot = invitationSpot(occupied, { id: team[0]!.id, place: 'meeting' })!;
    const seats = spotsFor(occupied.filter(agent => agent.room === 'meeting'));
    expect([...seats.values()].some(seat => seat.x === spot.x && seat.z === spot.z)).toBe(false);
    const full = team.map((agent, index): OfficeAgent => index > 0 && index <= 8 ? { ...agent, room: 'meeting' } : agent);
    expect(invitationSpot(full, { id: team[0]!.id, place: 'meeting' })).toBeUndefined();
  });
});
