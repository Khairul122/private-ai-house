import { describe, expect, it } from 'vitest';
import { acquireScrollLock, getScrollLockState, isScrollLocked, releaseScrollLock } from './scroll-lock.js';

interface MockWindow {
  scrollX: number;
  scrollY: number;
  pageXOffset: number;
  pageYOffset: number;
  innerWidth: number;
  getComputedStyle: () => { paddingRight: string };
  scrollTo: (x: number, y: number) => void;
}

function createMockEnvironment(initialScroll = { x: 0, y: 120 }) {
  let scrollX = initialScroll.x;
  let scrollY = initialScroll.y;

  const bodyStyle: Record<string, string> = {
    overflow: 'auto',
    position: 'static',
    top: '',
    left: '',
    width: 'auto',
    paddingRight: '0px',
  };

  const docElStyle: Record<string, string> = {
    overflow: 'visible',
  };

  const dataset: Record<string, string> = {};

  const doc = {
    body: {
      style: bodyStyle,
      dataset: { ...dataset },
      scrollTop: scrollY,
      scrollLeft: scrollX,
    },
    documentElement: {
      style: docElStyle,
      dataset: { ...dataset },
      scrollTop: scrollY,
      scrollLeft: scrollX,
      clientWidth: 1000,
    },
  } as unknown as Document;

  const winObj: MockWindow = {
    scrollX,
    scrollY,
    pageXOffset: scrollX,
    pageYOffset: scrollY,
    innerWidth: 1016, // 16px scrollbar
    getComputedStyle: () => ({ paddingRight: '0px' }),
    scrollTo: (x: number, y: number) => {
      scrollX = x;
      scrollY = y;
      winObj.scrollX = x;
      winObj.scrollY = y;
      winObj.pageXOffset = x;
      winObj.pageYOffset = y;
    },
  };

  return { doc, win: winObj as unknown as Window, getScroll: () => ({ x: scrollX, y: scrollY }) };
}

describe('scroll-lock utility', () => {
  it('locks body/root and captures previous scroll position', () => {
    const { doc, win, getScroll } = createMockEnvironment({ x: 0, y: 250 });

    expect(isScrollLocked(doc)).toBe(false);

    acquireScrollLock('test-modal', doc, win);

    expect(isScrollLocked(doc)).toBe(true);
    expect(doc.body.style.overflow).toBe('hidden');
    expect(doc.body.style.position).toBe('fixed');
    expect(doc.body.style.top).toBe('-250px');
    expect(doc.body.style.left).toBe('-0px');
    expect(doc.body.style.width).toBe('100%');
    expect(doc.documentElement.style.overflow).toBe('hidden');
    expect(doc.documentElement.dataset.scrollLocked).toBe('true');

    const state = getScrollLockState();
    expect(state.isLocked).toBe(true);
    expect(state.scrollY).toBe(250);

    // Releasing the lock restores original styles and scroll position
    releaseScrollLock('test-modal', doc, win);

    expect(isScrollLocked(doc)).toBe(false);
    expect(doc.body.style.overflow).toBe('auto');
    expect(doc.body.style.position).toBe('static');
    expect(doc.body.style.top).toBe('');
    expect(doc.documentElement.style.overflow).toBe('visible');
    expect(doc.documentElement.dataset.scrollLocked).toBeUndefined();
    expect(getScroll().y).toBe(250);
  });

  it('supports nested locks and only unlocks when all owners release', () => {
    const { doc, win, getScroll } = createMockEnvironment({ x: 10, y: 50 });

    acquireScrollLock('modal-1', doc, win);
    acquireScrollLock('modal-2', doc, win);

    expect(getScrollLockState().activeLocksCount).toBe(2);
    expect(isScrollLocked(doc)).toBe(true);

    // Release first lock - should still be locked
    releaseScrollLock('modal-1', doc, win);
    expect(getScrollLockState().activeLocksCount).toBe(1);
    expect(isScrollLocked(doc)).toBe(true);
    expect(doc.body.style.overflow).toBe('hidden');

    // Release second lock - now unlocked
    releaseScrollLock('modal-2', doc, win);
    expect(getScrollLockState().activeLocksCount).toBe(0);
    expect(isScrollLocked(doc)).toBe(false);
    expect(doc.body.style.overflow).toBe('auto');
    expect(getScroll().y).toBe(50);
  });
});
