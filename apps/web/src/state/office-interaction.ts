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

/** Standard interaction thresholds for pointer/touch gestures and isolation. */
export const GESTURE_THRESHOLDS = {
  DRAG_THRESHOLD_PX: 8,
  TOUCH_DRAG_THRESHOLD_PX: 8,
  MOUSE_DRAG_THRESHOLD_PX: 4,
  JITTER_THRESHOLD_PX: 4,
  MAX_TAP_DURATION_MS: 500,
} as const;

export type GesturePointerEvent = {
  pointerId: number;
  clientX: number;
  clientY: number;
  pointerType?: string | undefined;
  timeStamp?: number | undefined;
  currentTarget?: unknown;
};

export interface PointerInfo {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startTime: number;
  pointerType: string;
}

export interface GestureTrackerOptions {
  dragThreshold?: number | undefined;
  mouseDragThreshold?: number | undefined;
  jitterThreshold?: number | undefined;
  maxTapDurationMs?: number | undefined;
}

/** Safely releases pointer capture on pointerup, pointercancel, and pointerleave. */
export function safeReleasePointerCapture(element: unknown, pointerId: number): boolean {
  if (element && typeof (element as Element).hasPointerCapture === 'function') {
    const el = element as Element;
    if (el.hasPointerCapture(pointerId)) {
      try {
        el.releasePointerCapture(pointerId);
        return true;
      } catch {
        return false;
      }
    }
  }
  return false;
}

/**
 * Tracks active pointers, distinguishes taps from drags/rotations using 8px, 500ms, and 4px thresholds,
 * and performs multi-touch cancellation so multi-finger gestures do not select meshes.
 */
export function createGestureTracker(options?: GestureTrackerOptions) {
  const dragThreshold = options?.dragThreshold ?? GESTURE_THRESHOLDS.DRAG_THRESHOLD_PX;
  const mouseDragThreshold = options?.mouseDragThreshold ?? GESTURE_THRESHOLDS.MOUSE_DRAG_THRESHOLD_PX;
  const jitterThreshold = options?.jitterThreshold ?? GESTURE_THRESHOLDS.JITTER_THRESHOLD_PX;
  const maxTapDurationMs = options?.maxTapDurationMs ?? GESTURE_THRESHOLDS.MAX_TAP_DURATION_MS;

  const activePointers = new Map<number, PointerInfo>();
  let isMultiTouch = false;
  let isDragging = false;
  let hasMovedBeyondJitter = false;
  let maxDistance = 0;
  let startTime: number | null = null;
  let endTime: number | null = null;
  let cancelled = false;
  let lastPointerType = 'touch';

  return {
    get activePointerCount() { return activePointers.size; },
    get isMultiTouch() { return isMultiTouch; },
    get isDragging() { return isDragging; },
    get hasMovedBeyondJitter() { return hasMovedBeyondJitter; },
    get maxDistance() { return maxDistance; },
    get cancelled() { return cancelled; },
    get startTime() { return startTime; },
    get endTime() { return endTime; },
    get lastPointerType() { return lastPointerType; },

    onPointerDown(event: GesturePointerEvent) {
      const now = typeof event.timeStamp === 'number' && event.timeStamp > 0 ? event.timeStamp : Date.now();
      const pointerType = event.pointerType || 'touch';
      lastPointerType = pointerType;

      activePointers.set(event.pointerId, {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        startTime: now,
        pointerType,
      });

      if (activePointers.size === 1) {
        startTime = now;
        endTime = null;
        isDragging = false;
        hasMovedBeyondJitter = false;
        maxDistance = 0;
        isMultiTouch = false;
        cancelled = false;
      } else if (activePointers.size > 1) {
        isMultiTouch = true;
        cancelled = true;
      }
    },

    onPointerMove(event: GesturePointerEvent) {
      const pointer = activePointers.get(event.pointerId);
      if (!pointer) return;

      pointer.currentX = event.clientX;
      pointer.currentY = event.clientY;

      const dx = event.clientX - pointer.startX;
      const dy = event.clientY - pointer.startY;
      const dist = Math.hypot(dx, dy);

      if (dist > maxDistance) {
        maxDistance = dist;
      }

      if (dist > jitterThreshold) {
        hasMovedBeyondJitter = true;
      }

      const threshold = pointer.pointerType === 'mouse' ? mouseDragThreshold : dragThreshold;
      if (dist > threshold) {
        isDragging = true;
      }
    },

    onPointerUp(event: GesturePointerEvent) {
      const now = typeof event.timeStamp === 'number' && event.timeStamp > 0 ? event.timeStamp : Date.now();
      const pointer = activePointers.get(event.pointerId);

      if (pointer) {
        pointer.currentX = event.clientX;
        pointer.currentY = event.clientY;
        const dx = event.clientX - pointer.startX;
        const dy = event.clientY - pointer.startY;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDistance) {
          maxDistance = dist;
        }
        const threshold = pointer.pointerType === 'mouse' ? mouseDragThreshold : dragThreshold;
        if (dist > threshold) {
          isDragging = true;
        }

        const duration = startTime !== null ? now - startTime : 0;
        if (duration > maxTapDurationMs) {
          isDragging = true;
        }
      }

      safeReleasePointerCapture(event.currentTarget, event.pointerId);
      activePointers.delete(event.pointerId);

      if (activePointers.size === 0) {
        endTime = now;
      }
    },

    onPointerCancel(event: GesturePointerEvent) {
      cancelled = true;
      safeReleasePointerCapture(event.currentTarget, event.pointerId);
      activePointers.delete(event.pointerId);
      if (activePointers.size === 0) {
        endTime = typeof event.timeStamp === 'number' && event.timeStamp > 0 ? event.timeStamp : Date.now();
      }
    },

    onPointerLeave(event: GesturePointerEvent) {
      safeReleasePointerCapture(event.currentTarget, event.pointerId);
    },

    isTap(): boolean {
      if (cancelled || isMultiTouch || isDragging || startTime === null) {
        return false;
      }
      const duration = (endTime ?? Date.now()) - startTime;
      if (duration > maxTapDurationMs) {
        return false;
      }
      const threshold = lastPointerType === 'mouse' ? mouseDragThreshold : dragThreshold;
      if (maxDistance > threshold) {
        return false;
      }
      return true;
    },

    canSelectMesh(): boolean {
      return this.isTap();
    },

    shouldSuppressClick(): boolean {
      return !this.isTap();
    },

    reset() {
      activePointers.clear();
      isMultiTouch = false;
      isDragging = false;
      hasMovedBeyondJitter = false;
      maxDistance = 0;
      startTime = null;
      endTime = null;
      cancelled = false;
      lastPointerType = 'touch';
    },
  };
}

export type GestureTracker = ReturnType<typeof createGestureTracker>;

/** Event isolation handlers for stopping propagation on overlays, drawer, dock, rail, map, and controls. */
export function stopOverlayPropagation(event: Event | { stopPropagation: () => void }) {
  event.stopPropagation();
}

export const overlayEventIsolation = {
  onPointerDown: stopOverlayPropagation,
  onPointerMove: stopOverlayPropagation,
  onPointerUp: stopOverlayPropagation,
  onPointerCancel: stopOverlayPropagation,
  onTouchStart: stopOverlayPropagation,
  onTouchMove: stopOverlayPropagation,
  onTouchEnd: stopOverlayPropagation,
  onTouchCancel: stopOverlayPropagation,
  onWheel: stopOverlayPropagation,
} as const;

export const OVERLAY_ISOLATED_EVENTS = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel',
  'wheel',
] as const;

export function isolateOverlayElement(element: HTMLElement | null | undefined): (() => void) | void {
  if (!element) return;
  const stop = (event: Event) => event.stopPropagation();
  for (const name of OVERLAY_ISOLATED_EVENTS) {
    element.addEventListener(name, stop);
  }
  return () => {
    for (const name of OVERLAY_ISOLATED_EVENTS) {
      element.removeEventListener(name, stop);
    }
  };
}

/** Binds gesture tracking, click capture suppression, and pointer cleanup to canvas DOM element. */
export function bindCanvasGestureIsolation(domElement: HTMLElement, tracker: GestureTracker): () => void {
  const onPointerDown = (event: PointerEvent) => {
    tracker.onPointerDown(event);
  };
  const onPointerMove = (event: PointerEvent) => {
    tracker.onPointerMove(event);
  };
  const onPointerUp = (event: PointerEvent) => {
    tracker.onPointerUp(event);
  };
  const onPointerCancel = (event: PointerEvent) => {
    tracker.onPointerCancel(event);
  };
  const onPointerLeave = (event: PointerEvent) => {
    tracker.onPointerLeave(event);
  };
  const onClickCapture = (event: MouseEvent) => {
    if (tracker.shouldSuppressClick()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  };

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove, { passive: true });
  domElement.addEventListener('pointerup', onPointerUp, { passive: true });
  domElement.addEventListener('pointercancel', onPointerCancel, { passive: true });
  domElement.addEventListener('pointerleave', onPointerLeave);
  domElement.addEventListener('click', onClickCapture, true);

  const win = domElement.ownerDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null);
  if (win) {
    win.addEventListener('pointerup', onPointerUp, { passive: true });
    win.addEventListener('pointercancel', onPointerCancel, { passive: true });
  }

  return () => {
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerup', onPointerUp);
    domElement.removeEventListener('pointercancel', onPointerCancel);
    domElement.removeEventListener('pointerleave', onPointerLeave);
    domElement.removeEventListener('click', onClickCapture, true);
    if (win) {
      win.removeEventListener('pointerup', onPointerUp);
      win.removeEventListener('pointercancel', onPointerCancel);
    }
    tracker.reset();
  };
}
