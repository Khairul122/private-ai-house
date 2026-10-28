import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  invitationSpot,
  createGestureTracker,
  GESTURE_THRESHOLDS,
  safeReleasePointerCapture,
  overlayEventIsolation,
  isolateOverlayElement,
  bindCanvasGestureIsolation,
  OVERLAY_ISOLATED_EVENTS,
} from './office-interaction.js';
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

describe('CSS touch-action contracts', () => {
  it('sets touch-action: none on canvas and canvas wrapper', () => {
    const cssPath = resolve(__dirname, '../styles.css');
    const css = readFileSync(cssPath, 'utf8');

    expect(css).toMatch(/\.vo3d-canvas\s*\{[^}]*touch-action:\s*none/);
    expect(css).toMatch(/\.vo3d-canvas\s+canvas\s*\{[^}]*touch-action:\s*none/);
  });

  it('sets overscroll containment and touch-action on scrollable overlay panels', () => {
    const cssPath = resolve(__dirname, '../styles.css');
    const css = readFileSync(cssPath, 'utf8');

    expect(css).toMatch(/\.vo3d-roster\s*\{[^}]*touch-action:\s*pan-y/);
    expect(css).toMatch(/\.vo3d-roster\s*\{[^}]*overscroll-behavior:\s*contain/);

    expect(css).toMatch(/\.vo3d-panel-body\s*\{[^}]*touch-action:\s*pan-y/);
    expect(css).toMatch(/\.vo3d-panel-body\s*\{[^}]*overscroll-behavior:\s*contain/);

    expect(css).toMatch(/\.vo3d-dock\s*\{[^}]*touch-action:\s*pan-x/);
  });
});

describe('threshold gesture (8px, 500ms, 4px)', () => {
  it('defines the required constants explicitly', () => {
    expect(GESTURE_THRESHOLDS.DRAG_THRESHOLD_PX).toBe(8);
    expect(GESTURE_THRESHOLDS.TOUCH_DRAG_THRESHOLD_PX).toBe(8);
    expect(GESTURE_THRESHOLDS.MOUSE_DRAG_THRESHOLD_PX).toBe(4);
    expect(GESTURE_THRESHOLDS.JITTER_THRESHOLD_PX).toBe(4);
    expect(GESTURE_THRESHOLDS.MAX_TAP_DURATION_MS).toBe(500);
  });

  it('accepts clean tap within jitter and slop thresholds', () => {
    const tracker = createGestureTracker();
    const t0 = 1000;

    tracker.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch', timeStamp: t0 });
    expect(tracker.activePointerCount).toBe(1);
    expect(tracker.isDragging).toBe(false);

    // Micro-jitter of 2px (within jitter threshold 4px)
    tracker.onPointerMove({ pointerId: 1, clientX: 102, clientY: 101, pointerType: 'touch', timeStamp: t0 + 50 });
    expect(tracker.hasMovedBeyondJitter).toBe(false);
    expect(tracker.isDragging).toBe(false);

    // Lift at 120ms (well under 500ms)
    tracker.onPointerUp({ pointerId: 1, clientX: 102, clientY: 101, pointerType: 'touch', timeStamp: t0 + 120 });
    expect(tracker.isTap()).toBe(true);
    expect(tracker.canSelectMesh()).toBe(true);
    expect(tracker.shouldSuppressClick()).toBe(false);
  });

  it('allows touch slop between 4px and 8px for touch input', () => {
    const tracker = createGestureTracker();
    const t0 = 1000;

    tracker.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch', timeStamp: t0 });
    // Move 6px (exceeds 4px jitter, but within 8px touch slop)
    tracker.onPointerMove({ pointerId: 1, clientX: 106, clientY: 100, pointerType: 'touch', timeStamp: t0 + 80 });
    expect(tracker.hasMovedBeyondJitter).toBe(true);
    expect(tracker.isDragging).toBe(false);

    tracker.onPointerUp({ pointerId: 1, clientX: 106, clientY: 100, pointerType: 'touch', timeStamp: t0 + 150 });
    expect(tracker.isTap()).toBe(true);
    expect(tracker.canSelectMesh()).toBe(true);
  });

  it('rejects drag exceeding 8px for touch input', () => {
    const tracker = createGestureTracker();
    const t0 = 1000;

    tracker.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch', timeStamp: t0 });
    // Move 12px (hypot(12, 0) = 12 > 8px)
    tracker.onPointerMove({ pointerId: 1, clientX: 112, clientY: 100, pointerType: 'touch', timeStamp: t0 + 60 });
    expect(tracker.isDragging).toBe(true);

    tracker.onPointerUp({ pointerId: 1, clientX: 112, clientY: 100, pointerType: 'touch', timeStamp: t0 + 140 });
    expect(tracker.isTap()).toBe(false);
    expect(tracker.canSelectMesh()).toBe(false);
    expect(tracker.shouldSuppressClick()).toBe(true);
  });

  it('enforces 4px drag threshold for mouse input', () => {
    const tracker = createGestureTracker();
    const t0 = 1000;

    // Movement of 5px (> 4px mouse threshold) is a drag
    tracker.onPointerDown({ pointerId: 1, clientX: 50, clientY: 50, pointerType: 'mouse', timeStamp: t0 });
    tracker.onPointerMove({ pointerId: 1, clientX: 55, clientY: 50, pointerType: 'mouse', timeStamp: t0 + 40 });
    expect(tracker.isDragging).toBe(true);

    tracker.onPointerUp({ pointerId: 1, clientX: 55, clientY: 50, pointerType: 'mouse', timeStamp: t0 + 100 });
    expect(tracker.isTap()).toBe(false);
    expect(tracker.shouldSuppressClick()).toBe(true);

    // Movement of 3px (<= 4px) is a clean click for mouse
    tracker.reset();
    tracker.onPointerDown({ pointerId: 1, clientX: 50, clientY: 50, pointerType: 'mouse', timeStamp: t0 });
    tracker.onPointerMove({ pointerId: 1, clientX: 53, clientY: 50, pointerType: 'mouse', timeStamp: t0 + 40 });
    expect(tracker.isDragging).toBe(false);
    tracker.onPointerUp({ pointerId: 1, clientX: 53, clientY: 50, pointerType: 'mouse', timeStamp: t0 + 100 });
    expect(tracker.isTap()).toBe(true);
    expect(tracker.shouldSuppressClick()).toBe(false);
  });

  it('rejects long-press gestures exceeding 500ms duration', () => {
    const tracker = createGestureTracker();
    const t0 = 1000;

    // Stationary hold for 550ms
    tracker.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch', timeStamp: t0 });
    tracker.onPointerUp({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch', timeStamp: t0 + 550 });

    expect(tracker.isTap()).toBe(false);
    expect(tracker.canSelectMesh()).toBe(false);
    expect(tracker.shouldSuppressClick()).toBe(true);
  });

  it('cancels tap immediately on pointercancel', () => {
    const tracker = createGestureTracker();
    tracker.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch', timeStamp: 1000 });
    tracker.onPointerCancel({ pointerId: 1, clientX: 100, clientY: 100, timeStamp: 1050 });

    expect(tracker.cancelled).toBe(true);
    expect(tracker.isTap()).toBe(false);
    expect(tracker.canSelectMesh()).toBe(false);
  });
});

describe('multi-touch cancellation', () => {
  it('detects multi-touch and cancels tap and mesh selection', () => {
    const tracker = createGestureTracker();
    const t0 = 2000;

    // First finger down
    tracker.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch', timeStamp: t0 });
    expect(tracker.isMultiTouch).toBe(false);

    // Second finger down (pinch / pan)
    tracker.onPointerDown({ pointerId: 2, clientX: 200, clientY: 200, pointerType: 'touch', timeStamp: t0 + 20 });
    expect(tracker.isMultiTouch).toBe(true);
    expect(tracker.cancelled).toBe(true);
    expect(tracker.canSelectMesh()).toBe(false);

    // Release fingers
    tracker.onPointerUp({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch', timeStamp: t0 + 100 });
    expect(tracker.canSelectMesh()).toBe(false);

    tracker.onPointerUp({ pointerId: 2, clientX: 200, clientY: 200, pointerType: 'touch', timeStamp: t0 + 120 });
    expect(tracker.isTap()).toBe(false);
    expect(tracker.canSelectMesh()).toBe(false);
    expect(tracker.shouldSuppressClick()).toBe(true);
  });
});

describe('pointer capture cleanup', () => {
  it('releases pointer capture on pointerup, pointercancel, and pointerleave', () => {
    const captured = new Set<number>();
    const mockElement = {
      hasPointerCapture: vi.fn((id: number) => captured.has(id)),
      releasePointerCapture: vi.fn((id: number) => { captured.delete(id); }),
    };

    // Simulate pointerup cleanup
    captured.add(10);
    expect(mockElement.hasPointerCapture(10)).toBe(true);
    const releasedUp = safeReleasePointerCapture(mockElement, 10);
    expect(releasedUp).toBe(true);
    expect(mockElement.releasePointerCapture).toHaveBeenCalledWith(10);
    expect(captured.has(10)).toBe(false);

    // Simulate pointercancel cleanup
    captured.add(20);
    const releasedCancel = safeReleasePointerCapture(mockElement, 20);
    expect(releasedCancel).toBe(true);
    expect(mockElement.releasePointerCapture).toHaveBeenCalledWith(20);

    // Simulate pointerleave cleanup
    captured.add(30);
    const releasedLeave = safeReleasePointerCapture(mockElement, 30);
    expect(releasedLeave).toBe(true);
    expect(mockElement.releasePointerCapture).toHaveBeenCalledWith(30);
  });

  it('safely handles elements that do not have capture or throw', () => {
    expect(safeReleasePointerCapture(null, 1)).toBe(false);
    expect(safeReleasePointerCapture({}, 1)).toBe(false);

    const throwingElement = {
      hasPointerCapture: () => true,
      releasePointerCapture: () => { throw new Error('Invalid pointer id'); },
    };
    expect(safeReleasePointerCapture(throwingElement, 99)).toBe(false);
  });

  it('triggers cleanup via gesture tracker event handlers', () => {
    const tracker = createGestureTracker();
    const captured = new Set<number>([42]);
    const mockTarget = {
      hasPointerCapture: vi.fn((id: number) => captured.has(id)),
      releasePointerCapture: vi.fn((id: number) => { captured.delete(id); }),
    };

    tracker.onPointerDown({ pointerId: 42, clientX: 10, clientY: 10 });
    tracker.onPointerLeave({ pointerId: 42, clientX: 10, clientY: 10, currentTarget: mockTarget });
    expect(mockTarget.releasePointerCapture).toHaveBeenCalledWith(42);

    captured.add(43);
    tracker.onPointerDown({ pointerId: 43, clientX: 10, clientY: 10 });
    tracker.onPointerCancel({ pointerId: 43, clientX: 10, clientY: 10, currentTarget: mockTarget });
    expect(mockTarget.releasePointerCapture).toHaveBeenCalledWith(43);
  });
});

describe('DOM event test propagation & overlay isolation', () => {
  it('calls stopPropagation on all overlay isolation event handlers', () => {
    const stopPropagation = vi.fn();
    const mockEvent = { stopPropagation } as unknown as Event;

    overlayEventIsolation.onPointerDown(mockEvent);
    overlayEventIsolation.onPointerMove(mockEvent);
    overlayEventIsolation.onPointerUp(mockEvent);
    overlayEventIsolation.onPointerCancel(mockEvent);
    overlayEventIsolation.onTouchStart(mockEvent);
    overlayEventIsolation.onTouchMove(mockEvent);
    overlayEventIsolation.onTouchEnd(mockEvent);
    overlayEventIsolation.onTouchCancel(mockEvent);
    overlayEventIsolation.onWheel(mockEvent);

    expect(stopPropagation).toHaveBeenCalledTimes(9);
  });

  it('stops native DOM events from bubbling out of isolated overlay elements', () => {
    const overlay = new EventTarget();
    const cleanup = isolateOverlayElement(overlay as unknown as HTMLElement);

    for (const name of OVERLAY_ISOLATED_EVENTS) {
      const event = new Event(name, { cancelable: true });
      const stopSpy = vi.spyOn(event, 'stopPropagation');
      overlay.dispatchEvent(event);
      expect(stopSpy).toHaveBeenCalled();
    }

    cleanup?.();
  });
});

function pointerEvent(type: string, props: Record<string, unknown> = {}) {
  const event = new Event(type, { cancelable: true });
  const { timeStamp, ...rest } = props;
  Object.assign(event, rest);
  if (timeStamp !== undefined) {
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  }
  return event;
}

describe('mesh selection after rotate and click capture', () => {
  it('suppresses synthetic click and prevents mesh selection after dragging/rotating', () => {
    const canvas = new EventTarget() as unknown as HTMLElement;
    const tracker = createGestureTracker();
    const cleanup = bindCanvasGestureIsolation(canvas, tracker);

    let meshSelected = false;
    const onSelectMesh = () => {
      if (tracker.canSelectMesh()) {
        meshSelected = true;
      }
    };

    // User puts finger down and drags 40px to rotate camera
    canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' }));
    canvas.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 140, clientY: 100, pointerType: 'touch' }));
    canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 140, clientY: 100, pointerType: 'touch' }));

    expect(tracker.isDragging).toBe(true);
    expect(tracker.canSelectMesh()).toBe(false);

    // Browser dispatches synthetic click on canvas at release point
    const clickEvent = new Event('click', { cancelable: true });
    canvas.dispatchEvent(clickEvent);

    // Click was captured and suppressed
    expect(clickEvent.defaultPrevented).toBe(true);
    onSelectMesh();
    expect(meshSelected).toBe(false);

    cleanup();
  });

  it('allows click and selects mesh on clean tap', () => {
    const canvas = new EventTarget() as unknown as HTMLElement;
    const tracker = createGestureTracker();
    const cleanup = bindCanvasGestureIsolation(canvas, tracker);

    let meshSelected = false;
    const onSelectMesh = () => {
      if (tracker.canSelectMesh()) {
        meshSelected = true;
      }
    };

    const t0 = 3000;
    canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch', timeStamp: t0 }));
    canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch', timeStamp: t0 + 100 }));

    expect(tracker.isTap()).toBe(true);
    expect(tracker.canSelectMesh()).toBe(true);

    const clickEvent = new Event('click', { cancelable: true });
    canvas.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(false);
    onSelectMesh();
    expect(meshSelected).toBe(true);

    cleanup();
  });

  it('suppresses click after multi-touch pinch/pan so mesh is not selected', () => {
    const canvas = new EventTarget() as unknown as HTMLElement;
    const tracker = createGestureTracker();
    const cleanup = bindCanvasGestureIsolation(canvas, tracker);

    let meshSelected = false;
    const onSelectMesh = () => {
      if (tracker.canSelectMesh()) {
        meshSelected = true;
      }
    };

    canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' }));
    canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 200, pointerType: 'touch' }));

    canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' }));
    canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, clientX: 200, clientY: 200, pointerType: 'touch' }));

    const clickEvent = new Event('click', { cancelable: true });
    canvas.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    onSelectMesh();
    expect(meshSelected).toBe(false);

    cleanup();
  });
});
