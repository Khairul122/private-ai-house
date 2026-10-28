import { useEffect } from 'react';

export interface ScrollLockState {
  isLocked: boolean;
  scrollX: number;
  scrollY: number;
  activeLocksCount: number;
}

interface SavedStyles {
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyWidth: string;
  bodyPaddingRight: string;
  docOverflow: string;
}

const activeLocks = new Set<string>();
let savedStyles: SavedStyles | null = null;
let savedScroll = { x: 0, y: 0 };

/**
 * Acquires scroll lock on body/root to prevent background scrolling behind modals/drawers.
 * Saves current scroll position and restores it precisely on release.
 */
export function acquireScrollLock(
  ownerId = 'default',
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined,
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined
): void {
  if (!doc?.body || !doc?.documentElement) return;

  if (activeLocks.size === 0) {
    const scrollY = win?.scrollY ?? win?.pageYOffset ?? doc.documentElement.scrollTop ?? doc.body.scrollTop ?? 0;
    const scrollX = win?.scrollX ?? win?.pageXOffset ?? doc.documentElement.scrollLeft ?? doc.body.scrollLeft ?? 0;
    savedScroll = { x: scrollX, y: scrollY };

    savedStyles = {
      bodyOverflow: doc.body.style.overflow,
      bodyPosition: doc.body.style.position,
      bodyTop: doc.body.style.top,
      bodyLeft: doc.body.style.left,
      bodyWidth: doc.body.style.width,
      bodyPaddingRight: doc.body.style.paddingRight,
      docOverflow: doc.documentElement.style.overflow,
    };

    // Calculate scrollbar width to prevent layout shift on desktop
    const scrollbarWidth = win ? Math.max(0, win.innerWidth - doc.documentElement.clientWidth) : 0;
    const currentPadding = parseFloat(win?.getComputedStyle?.(doc.body).paddingRight || '0') || 0;

    doc.documentElement.style.overflow = 'hidden';
    doc.body.style.overflow = 'hidden';
    doc.body.style.position = 'fixed';
    doc.body.style.top = `-${scrollY}px`;
    doc.body.style.left = `-${scrollX}px`;
    doc.body.style.width = '100%';
    if (scrollbarWidth > 0) {
      doc.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
    doc.documentElement.dataset.scrollLocked = 'true';
    doc.body.dataset.scrollLocked = 'true';
  }

  activeLocks.add(ownerId);
}

/**
 * Releases scroll lock and restores previous styles and scroll position.
 */
export function releaseScrollLock(
  ownerId = 'default',
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined,
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined
): void {
  activeLocks.delete(ownerId);

  if (activeLocks.size === 0 && savedStyles && doc?.body && doc?.documentElement) {
    doc.body.style.overflow = savedStyles.bodyOverflow;
    doc.body.style.position = savedStyles.bodyPosition;
    doc.body.style.top = savedStyles.bodyTop;
    doc.body.style.left = savedStyles.bodyLeft;
    doc.body.style.width = savedStyles.bodyWidth;
    doc.body.style.paddingRight = savedStyles.bodyPaddingRight;
    doc.documentElement.style.overflow = savedStyles.docOverflow;

    delete doc.documentElement.dataset.scrollLocked;
    delete doc.body.dataset.scrollLocked;

    const { x, y } = savedScroll;
    savedStyles = null;
    savedScroll = { x: 0, y: 0 };

    if (win?.scrollTo) {
      win.scrollTo(x, y);
    } else {
      doc.documentElement.scrollTop = y;
      doc.documentElement.scrollLeft = x;
      doc.body.scrollTop = y;
      doc.body.scrollLeft = x;
    }
  }
}

/**
 * Checks whether scroll lock is currently active.
 */
export function isScrollLocked(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): boolean {
  return activeLocks.size > 0 || doc?.documentElement?.dataset?.scrollLocked === 'true';
}

/**
 * Returns diagnostic state of scroll lock.
 */
export function getScrollLockState(): ScrollLockState {
  return {
    isLocked: activeLocks.size > 0,
    scrollX: savedScroll.x,
    scrollY: savedScroll.y,
    activeLocksCount: activeLocks.size,
  };
}

/**
 * React hook to lock scroll when component mounts or enabled is true.
 */
export function useScrollLock(
  enabled: boolean,
  ownerId = 'hook-lock',
  doc?: Document,
  win?: Window
): void {
  useEffect(() => {
    if (!enabled) return;
    acquireScrollLock(ownerId, doc, win);
    return () => {
      releaseScrollLock(ownerId, doc, win);
    };
  }, [enabled, ownerId, doc, win]);
}
