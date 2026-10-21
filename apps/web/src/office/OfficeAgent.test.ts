import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { nearbyIdlePeer, spokenOfficeTurn } from './OfficeAgent.js';
import type { OfficeAgent } from '../state/office-state.js';

const agents = [
  { id: 'a', state: 'idle' },
  { id: 'b', state: 'idle' },
  { id: 'c', state: 'working' },
] as OfficeAgent[];

describe('spokenOfficeTurn', () => {
  const status = { available: true, busy: true, activeSpeakerId: 'a', sessions: [{ state: 'running', turns: [{ employeeId: 'a', message: 'Pesan Hermes nyata.' }] }] };
  it('only shows persisted turn from active speaker, never invents a line', () => {
    expect(spokenOfficeTurn(status, 'a')).toBe('Pesan Hermes nyata.');
    expect(spokenOfficeTurn(status, 'b')).toBeUndefined();
    expect(spokenOfficeTurn({ ...status, activeSpeakerId: 'b' }, 'a')).toBe('Pesan Hermes nyata.');
    expect(spokenOfficeTurn({ ...status, busy: false }, 'a')).toBeUndefined();
    expect(spokenOfficeTurn({ ...status, sessions: [{ state: 'running', turns: [] }] }, 'a')).toBeUndefined();
    expect(spokenOfficeTurn({ ...status, sessions: [{ state: 'completed', turns: status.sessions[0]!.turns }] }, 'a')).toBeUndefined();
  });
});

describe('nearbyIdlePeer', () => {
  it('only pairs idle agents within conversational distance', () => {
    const positions = new Map([
      ['a', new THREE.Vector3(0, 0, 0)],
      ['b', new THREE.Vector3(1.6, 0, 0)],
      ['c', new THREE.Vector3(0.5, 0, 0)],
    ]);
    expect(nearbyIdlePeer('a', agents, positions, 0, 0)).toBe(positions.get('b'));
    expect(nearbyIdlePeer('b', agents, positions, 8, 0)).toBeNull();
    expect(nearbyIdlePeer('c', agents, positions, 0.5, 0)).toBeNull();
  });

  it('does not socialize across floors even when plan coordinates overlap', () => {
    const positions = new Map([['b', new THREE.Vector3(1, 0, 0)]]);
    const upstairs: OfficeAgent[] = agents.map((agent) => agent.id === 'b' ? { ...agent, floor: 2 } : agent);
    expect(nearbyIdlePeer('a', upstairs, positions, 0, 0)).toBeNull();
  });
});
