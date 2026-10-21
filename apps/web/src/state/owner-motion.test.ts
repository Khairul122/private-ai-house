import { describe, expect, it } from 'vitest';
import { LIFT, liftDoorReached, OWNER_SPOT, PODS, spotsFor, type P2, type Spot } from './office-layout.js';
import { deriveOfficeAgents } from './office-state.js';
import type { Autopilot } from '../api/api.js';
import { createOwnerMotion, ownerCanStand, ownerCanWalk, ownerVisitDestination, planOwnerPath, setOwnerDestination, stepOwnerMotion, stopOwnerMotion } from './owner-motion.js';

const idle = { up: false, down: false, left: false, right: false };
const target = (x: number, z: number): Spot => ({ x, z, y: 0, facing: 0, seated: false, via: [] });
const pilot = (cycleInProgress: boolean): Autopilot => ({ state: 'running', cycleInProgress, lastRunAt: null, nextRunAt: null, lastMessage: '', lastImported: 0, lastSubmitted: 0, specializations: [] });

describe('Owner movement', () => {
  it('starts clear of the lobby bench and cannot walk through a desk', () => {
    expect(ownerCanStand(OWNER_SPOT.x, OWNER_SPOT.z)).toBe(true);
    expect(ownerCanStand(-18.2, 9.2)).toBe(false);
    const pod = PODS[0]!;
    const state = { ...createOwnerMotion(), x: pod.x + 1.7, z: pod.z + 0.1 };
    for (let i = 0; i < 100; i++) stepOwnerMotion(state, { ...idle, left: true }, [1, 0], 1 / 60);
    expect(state.x).toBeGreaterThan(pod.x + 1.4);
    expect(ownerCanStand(state.x, state.z)).toBe(true);
    const outside = { ...createOwnerMotion(), x: pod.x + 3.25, z: pod.z };
    for (let i = 0; i < 100; i++) stepOwnerMotion(outside, { ...idle, left: true }, [1, 0], 1 / 60);
    expect(outside.x).toBeGreaterThan(pod.x + 1.6);
    expect(outside.x).toBeLessThan(pod.x + 2.5);
  });

  it('opens former glass partition aisles while keeping the library and acoustic panels solid', () => {
    const pod = PODS[0]!;
    expect(ownerCanWalk([pod.x + 3.25, pod.z + 1.5], [pod.x, pod.z + 1.5])).toBe(true);
    expect(ownerCanWalk([3, -6], [6, -6])).toBe(true);
    expect(ownerCanStand(pod.x + 0.5, pod.z - 2.34)).toBe(false);
    expect(ownerCanStand(16.8, 0.3)).toBe(false);
    expect(ownerCanWalk([15, -2], [15, 2])).toBe(true);
  });

  it('keeps diagonal speed equal to straight movement and follows camera orientation', () => {
    const start = { ...createOwnerMotion(), x: 1.5, z: 5 };
    const straight = { ...start }; const diagonal = { ...start }; const rotated = { ...start };
    stepOwnerMotion(straight, { ...idle, up: true }, [1, 0], 0.1);
    stepOwnerMotion(diagonal, { ...idle, up: true, right: true }, [1, 0], 0.1);
    stepOwnerMotion(rotated, { ...idle, up: true }, [0, 1], 0.1);
    expect(Math.hypot(diagonal.x - start.x, diagonal.z - start.z)).toBeCloseTo(Math.hypot(straight.x - start.x, straight.z - start.z));
    expect(rotated.x).toBeGreaterThan(start.x);
    expect(rotated.z).toBe(start.z);
  });

  it('bounds movement after a delayed frame, stays on the floor, and rests at a wall', () => {
    const state = { ...createOwnerMotion(), x: 1.5, z: 11 };
    stepOwnerMotion(state, { ...idle, down: true }, [1, 0], 20);
    expect(state.z - 11).toBeLessThanOrEqual(0.421);
    for (let i = 0; i < 150; i++) stepOwnerMotion(state, { ...idle, down: true }, [1, 0], 0.1);
    expect(ownerCanStand(state.x, state.z)).toBe(true);
    expect(state.z).toBeLessThan(13);
    expect(Math.abs(state.swing)).toBeLessThan(0.001);
  });

  it('animates actual travel, settles after release and honors reduced motion', () => {
    const state = { ...createOwnerMotion(), x: 1.5, z: 5 };
    for (let i = 0; i < 6; i++) stepOwnerMotion(state, { ...idle, up: true }, [1, 0], 1 / 60);
    expect(Math.abs(state.swing)).toBeGreaterThan(0.01);
    const position: P2 = [state.x, state.z];
    for (let i = 0; i < 60; i++) stepOwnerMotion(state, idle, [1, 0], 1 / 60);
    expect([state.x, state.z]).toEqual(position);
    expect(Math.abs(state.swing)).toBeLessThan(0.001);
    stepOwnerMotion(state, { ...idle, up: true }, [1, 0], 1 / 60, true);
    expect(state.swing).toBe(0); expect(state.bob).toBe(0);
  });

  it('keeps reduced motion deterministic and removes gait animation', () => {
    const normal = { ...createOwnerMotion(), x: 1.5, z: 5 };
    const reduced = { ...normal };
    stepOwnerMotion(normal, { ...idle, up: true }, [1, 0], 0.1);
    stepOwnerMotion(reduced, { ...idle, up: true }, [1, 0], 0.1, true);
    expect([reduced.x, reduced.z]).toEqual([normal.x, normal.z]);
    expect(reduced.swing).toBe(0);
    expect(reduced.bob).toBe(0);
    expect(reduced.heading).toBe(reduced.facing);
  });

  it('clamps invalid and delayed frame times without leaving the floor', () => {
    const delayed = createOwnerMotion([1.5, 5]);
    const bounded = createOwnerMotion([1.5, 5]);
    stepOwnerMotion(delayed, { ...idle, up: true }, [1, 0], 20);
    stepOwnerMotion(bounded, { ...idle, up: true }, [1, 0], 0.1);
    expect([delayed.x, delayed.z]).toEqual([bounded.x, bounded.z]);
    expect(ownerCanStand(delayed.x, delayed.z)).toBe(true);
    const nan = createOwnerMotion([1.5, 5]);
    stepOwnerMotion(nan, { ...idle, up: true }, [1, 0], Number.NaN);
    expect([nan.x, nan.z]).toEqual([1.5, 5]);
    expect(nan.moving).toBe(false);
  });

  it('routes to every placed employee around the actual furniture through doorways', () => {
    const cases = [pilot(true), pilot(false), undefined].map((data) => deriveOfficeAgents(data, []));
    for (const room of ['workspace', 'meeting', 'lounge', 'lobby'] as const) cases.push(deriveOfficeAgents(pilot(true), []).map((agent) => ({ ...agent, room })));
    for (const agents of cases) {
      for (const spot of spotsFor(agents).values()) {
        const destination = ownerVisitDestination(spot);
        expect(destination, `approach to ${spot.x},${spot.z}`).not.toBeNull();
        const path = planOwnerPath([OWNER_SPOT.x, OWNER_SPOT.z], destination!);
        expect(path.length, `path to ${spot.x},${spot.z}`).toBeGreaterThan(0);
        let from: P2 = [OWNER_SPOT.x, OWNER_SPOT.z];
        for (const point of path) { expect(ownerCanWalk(from, point)).toBe(true); from = point; }
        expect(path.at(-1)).toEqual(destination);
      }
    }
  });

  it('replans from the current position mid-route and manual movement cancels the route', () => {
    const state = createOwnerMotion();
    const first = target(7, -6.5); const second = target(11.2, 7.6);
    setOwnerDestination(state, first);
    for (let i = 0; i < 50; i++) stepOwnerMotion(state, idle, [1, 0], 1 / 60);
    setOwnerDestination(state, second);
    expect(ownerCanWalk([state.x, state.z], state.path[0]!)).toBe(true);
    stepOwnerMotion(state, { ...idle, right: true }, [1, 0], 1 / 60);
    expect(state.path).toEqual([]);
    setOwnerDestination(state, { ...second });
    expect(state.path).toEqual([]);
    const position: P2 = [state.x, state.z];
    stepOwnerMotion(state, idle, [1, 0], 0.1);
    expect([state.x, state.z]).toEqual(position);
  });

  it('stops an automatic visit without restarting on polling and opens Owner in place', () => {
    const state = createOwnerMotion(); const employee = target(7, -6.5);
    setOwnerDestination(state, employee);
    expect(state.path.length).toBeGreaterThan(0);
    stopOwnerMotion(state);
    setOwnerDestination(state, { ...employee });
    stepOwnerMotion(state, idle, [1, 0], 0.1);
    expect(state.path).toEqual([]);
    setOwnerDestination(state, employee, 1);
    expect(state.path.length).toBeGreaterThan(0);
    state.x = 1.5; state.z = 5;
    setOwnerDestination(state, null);
    stepOwnerMotion(state, idle, [1, 0], 0.1);
    expect([state.x, state.z]).toEqual([1.5, 5]);
  });

  it('cancels an automatic visit even when opposing movement keys cancel each other', () => {
    const state = createOwnerMotion();
    setOwnerDestination(state, target(7, -6.5));
    const position = [state.x, state.z];
    stepOwnerMotion(state, { ...idle, up: true, down: true }, [1, 0], 0.1);
    expect(state.path).toEqual([]);
    expect([state.x, state.z]).toEqual(position);
    expect(state.moving).toBe(false);
  });
});

describe('Lift access', () => {
  it('can be reached from the corridor, is solid, and its exit is outside the doorstep', () => {
    expect(ownerCanStand(LIFT.x, LIFT.z)).toBe(false);
    expect(ownerCanStand(LIFT.exit.x, LIFT.exit.z)).toBe(true);
    expect(liftDoorReached(LIFT.exit.x, LIFT.exit.z)).toBe(false);
    const state = createOwnerMotion([LIFT.exit.x, LIFT.exit.z]);
    let reached = false;
    for (let i = 0; i < 300 && !reached; i++) { stepOwnerMotion(state, { ...idle, up: true }, [1, 0], 1 / 30); reached = liftDoorReached(state.x, state.z); }
    expect(reached).toBe(true);
  });

  it('is not triggered by walking past it or along the pod walls', () => {
    expect(liftDoorReached(-3, -9.5)).toBe(false);
    expect(liftDoorReached(3, -10.9)).toBe(false);
    expect(liftDoorReached(LIFT.x, -9.6)).toBe(false);
  });

  it('keeps every agent seat and the default start out of the lift', () => {
    expect(ownerCanStand(OWNER_SPOT.x, OWNER_SPOT.z)).toBe(true);
    for (const pod of PODS) expect(liftDoorReached(pod.x, pod.z)).toBe(false);
  });
});
