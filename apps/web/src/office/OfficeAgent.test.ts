import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { nearbyIdlePeer } from './OfficeAgent.js';
import type { OfficeAgent } from '../state/office-state.js';

const agents = [
  { id: 'a', state: 'idle' },
  { id: 'b', state: 'idle' },
  { id: 'c', state: 'working' },
] as OfficeAgent[];

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
});
