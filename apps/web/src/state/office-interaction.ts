import { MEETING_SEATS, OWNER_SPOT, spotsFor, type Spot } from './office-layout.js';
import type { OfficeAgent } from './office-state.js';

export type OfficeInvitation = { id: string; place: 'owner' | 'meeting' } | null;

export function invitationSpot(agents: OfficeAgent[], invitation: OfficeInvitation): Spot | undefined {
  const employee = agents.find(agent => agent.id === invitation?.id);
  if (!employee || employee.state !== 'idle' || !invitation) return undefined;
  if (invitation.place === 'owner') return { ...OWNER_SPOT, x: OWNER_SPOT.x + 1.2, facing: -Math.PI / 2 };
  const occupied = [...spotsFor(agents.filter(agent => agent.room === 'meeting')).values()];
  return MEETING_SEATS.find(seat => !occupied.some(spot => spot.x === seat.x && spot.z === seat.z));
}
