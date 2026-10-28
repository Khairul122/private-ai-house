import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  BREAKPOINTS,
  HEIGHT_BREAKPOINTS,
  TOUCH_TARGET_TOKENS,
  VIEWPORT_UNIT_TOKENS,
  SAFE_AREA_TOKENS,
  STACKING_TOKENS,
  MEDIA_QUERIES,
  resolveViewportWidthMode,
  resolveViewportHeightMode,
  resolveViewportOrientation,
  resolveViewport,
} from './responsive.js';

describe('Responsive Breakpoint Resolver Contract', () => {
  describe('Width Mode Determination', () => {
    it('classifies ultra-compact viewports (<= 360px)', () => {
      expect(resolveViewportWidthMode(320)).toBe('ultra-compact');
      expect(resolveViewportWidthMode(360)).toBe('ultra-compact');
    });

    it('classifies compact-mobile viewports (361px - 420px)', () => {
      expect(resolveViewportWidthMode(361)).toBe('compact-mobile');
      expect(resolveViewportWidthMode(375)).toBe('compact-mobile');
      expect(resolveViewportWidthMode(390)).toBe('compact-mobile');
      expect(resolveViewportWidthMode(420)).toBe('compact-mobile');
    });

    it('classifies mobile viewports (421px - 760px)', () => {
      expect(resolveViewportWidthMode(421)).toBe('mobile');
      expect(resolveViewportWidthMode(540)).toBe('mobile');
      expect(resolveViewportWidthMode(760)).toBe('mobile');
    });

    it('classifies tablet viewports (761px - 1100px)', () => {
      expect(resolveViewportWidthMode(761)).toBe('tablet');
      expect(resolveViewportWidthMode(960)).toBe('tablet');
      expect(resolveViewportWidthMode(1100)).toBe('tablet');
    });

    it('classifies desktop viewports (> 1100px)', () => {
      expect(resolveViewportWidthMode(1101)).toBe('desktop');
      expect(resolveViewportWidthMode(1440)).toBe('desktop');
      expect(resolveViewportWidthMode(1920)).toBe('desktop');
    });
  });

  describe('Height Mode Determination', () => {
    it('classifies compact-height viewports (<= 600px)', () => {
      expect(resolveViewportHeightMode(360)).toBe('compact-height');
      expect(resolveViewportHeightMode(450)).toBe('compact-height');
      expect(resolveViewportHeightMode(600)).toBe('compact-height');
    });

    it('classifies short viewports (601px - 720px)', () => {
      expect(resolveViewportHeightMode(601)).toBe('short');
      expect(resolveViewportHeightMode(680)).toBe('short');
      expect(resolveViewportHeightMode(720)).toBe('short');
    });

    it('classifies tall viewports (> 720px)', () => {
      expect(resolveViewportHeightMode(721)).toBe('tall');
      expect(resolveViewportHeightMode(900)).toBe('tall');
      expect(resolveViewportHeightMode(1200)).toBe('tall');
    });
  });

  describe('Orientation Determination', () => {
    it('determines landscape when width >= height', () => {
      expect(resolveViewportOrientation(1280, 800)).toBe('landscape');
      expect(resolveViewportOrientation(800, 800)).toBe('landscape');
    });

    it('determines portrait when width < height', () => {
      expect(resolveViewportOrientation(390, 844)).toBe('portrait');
    });

    it('respects orientation override when provided', () => {
      expect(resolveViewportOrientation(1280, 800, 'portrait')).toBe('portrait');
      expect(resolveViewportOrientation(390, 844, 'landscape')).toBe('landscape');
    });
  });

  describe('Comprehensive Viewport Resolution', () => {
    it('resolves desktop standard display', () => {
      const res = resolveViewport(1440, 900);
      expect(res.widthMode).toBe('desktop');
      expect(res.heightMode).toBe('tall');
      expect(res.orientation).toBe('landscape');
      expect(res.isCompactLandscape).toBe(false);
      expect(res.isTouchFirst).toBe(false);
      expect(res.isMobileOrNarrow).toBe(false);
    });

    it('resolves tablet standard display', () => {
      const res = resolveViewport(834, 1112);
      expect(res.widthMode).toBe('tablet');
      expect(res.heightMode).toBe('tall');
      expect(res.orientation).toBe('portrait');
      expect(res.isCompactLandscape).toBe(false);
      expect(res.isTouchFirst).toBe(false);
      expect(res.isMobileOrNarrow).toBe(false);
    });

    it('resolves mobile standard display', () => {
      const res = resolveViewport(390, 844);
      expect(res.widthMode).toBe('compact-mobile');
      expect(res.heightMode).toBe('tall');
      expect(res.orientation).toBe('portrait');
      expect(res.isCompactLandscape).toBe(false);
      expect(res.isTouchFirst).toBe(true);
      expect(res.isMobileOrNarrow).toBe(true);
      expect(res.isCompactOrNarrow).toBe(true);
      expect(res.isUltraCompact).toBe(false);
    });

    it('resolves compact landscape mode (landscape with height <= 450px)', () => {
      const res = resolveViewport(844, 390);
      expect(res.widthMode).toBe('tablet');
      expect(res.heightMode).toBe('compact-height');
      expect(res.orientation).toBe('landscape');
      expect(res.isCompactLandscape).toBe(true);
      expect(res.isTouchFirst).toBe(true);
    });

    it('does not flag compact landscape when height > 450px', () => {
      const res = resolveViewport(800, 451);
      expect(res.isCompactLandscape).toBe(false);
    });

    it('handles negative or zero dimensions safely without throwing', () => {
      const res = resolveViewport(-50, 0);
      expect(res.width).toBe(0);
      expect(res.height).toBe(0);
      expect(res.widthMode).toBe('ultra-compact');
      expect(res.heightMode).toBe('compact-height');
    });
  });

  describe('Tokens and Stacking Constants Integrity', () => {
    it('declares standard breakpoint constants', () => {
      expect(BREAKPOINTS.DESKTOP_MIN).toBe(1101);
      expect(BREAKPOINTS.TABLET_MAX).toBe(1100);
      expect(BREAKPOINTS.TABLET_MIN).toBe(761);
      expect(BREAKPOINTS.MOBILE_MAX).toBe(760);
      expect(BREAKPOINTS.MOBILE_MIN).toBe(421);
      expect(BREAKPOINTS.COMPACT_MOBILE_MAX).toBe(420);
      expect(BREAKPOINTS.COMPACT_MOBILE_MIN).toBe(361);
      expect(BREAKPOINTS.ULTRA_COMPACT_MAX).toBe(360);

      expect(HEIGHT_BREAKPOINTS.TALL_MIN).toBe(721);
      expect(HEIGHT_BREAKPOINTS.SHORT_MAX).toBe(720);
      expect(HEIGHT_BREAKPOINTS.SHORT_MIN).toBe(601);
      expect(HEIGHT_BREAKPOINTS.COMPACT_MAX).toBe(600);
      expect(HEIGHT_BREAKPOINTS.LANDSCAPE_COMPACT_MAX).toBe(450);
    });

    it('declares valid numeric touch targets and gaps', () => {
      expect(TOUCH_TARGET_TOKENS.MIN_PX).toBe(44);
      expect(TOUCH_TARGET_TOKENS.GAP_PX).toBe(8);
      expect(TOUCH_TARGET_TOKENS.MIN_CSS).toBe('44px');
      expect(TOUCH_TARGET_TOKENS.GAP_CSS).toBe('8px');
    });

    it('declares 100dvh viewport unit', () => {
      expect(VIEWPORT_UNIT_TOKENS.APP_HEIGHT).toBe('100dvh');
    });

    it('declares safe area inset environment variables', () => {
      expect(SAFE_AREA_TOKENS.TOP).toContain('safe-area-inset-top');
      expect(SAFE_AREA_TOKENS.BOTTOM).toContain('safe-area-inset-bottom');
      expect(SAFE_AREA_TOKENS.LEFT).toContain('safe-area-inset-left');
      expect(SAFE_AREA_TOKENS.RIGHT).toContain('safe-area-inset-right');
    });

    it('declares monotonic z-index stacking layers', () => {
      expect(STACKING_TOKENS.canvas).toBeLessThan(STACKING_TOKENS.underlay);
      expect(STACKING_TOKENS.underlay).toBeLessThan(STACKING_TOKENS.hud);
      expect(STACKING_TOKENS.hud).toBeLessThan(STACKING_TOKENS.dock);
      expect(STACKING_TOKENS.dock).toBeLessThan(STACKING_TOKENS.controls);
      expect(STACKING_TOKENS.controls).toBeLessThan(STACKING_TOKENS.backdrop);
      expect(STACKING_TOKENS.backdrop).toBeLessThan(STACKING_TOKENS.sheet);
      expect(STACKING_TOKENS.sheet).toBeLessThan(STACKING_TOKENS.modal);
      expect(STACKING_TOKENS.modal).toBeLessThan(STACKING_TOKENS.killSwitch);
      expect(STACKING_TOKENS.killSwitch).toBeLessThanOrEqual(STACKING_TOKENS.toast);
    });

    it('declares standard CSS media query strings', () => {
      expect(MEDIA_QUERIES.desktop).toBe('(min-width: 1101px)');
      expect(MEDIA_QUERIES.tablet).toBe('(max-width: 1100px)');
      expect(MEDIA_QUERIES.mobile).toBe('(max-width: 760px)');
      expect(MEDIA_QUERIES.compactMobile).toBe('(max-width: 420px)');
      expect(MEDIA_QUERIES.ultraCompact).toBe('(max-width: 360px)');
      expect(MEDIA_QUERIES.shortHeight).toBe('(max-height: 720px)');
      expect(MEDIA_QUERIES.compactHeight).toBe('(max-height: 600px)');
      expect(MEDIA_QUERIES.compactLandscape).toBe('(orientation: landscape) and (max-height: 450px)');
    });
  });

  describe('CSS Stylesheet Contract Verification', () => {
    const cssPath = path.resolve(__dirname, '../styles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    it('contains all required breakpoint tokens in :root', () => {
      expect(cssContent).toContain('--bp-desktop: 1101px;');
      expect(cssContent).toContain('--bp-tablet: 1100px;');
      expect(cssContent).toContain('--bp-mobile: 760px;');
      expect(cssContent).toContain('--bp-compact: 420px;');
      expect(cssContent).toContain('--bp-ultra-compact: 360px;');
      expect(cssContent).toContain('--bp-height-short: 720px;');
      expect(cssContent).toContain('--bp-height-compact: 600px;');
      expect(cssContent).toContain('--bp-landscape-height: 450px;');
    });

    it('contains safe-area and 100dvh viewport units in :root', () => {
      expect(cssContent).toContain('--app-height: 100dvh;');
      expect(cssContent).toContain('--safe-area-top: env(safe-area-inset-top, 0px);');
      expect(cssContent).toContain('--safe-area-right: env(safe-area-inset-right, 0px);');
      expect(cssContent).toContain('--safe-area-bottom: env(safe-area-inset-bottom, 0px);');
      expect(cssContent).toContain('--safe-area-left: env(safe-area-inset-left, 0px);');
    });

    it('contains touch target 44px and gap 8px tokens in :root', () => {
      expect(cssContent).toContain('--touch-target-min: 44px;');
      expect(cssContent).toContain('--touch-target-gap: 8px;');
    });

    it('contains all stacking z-index tokens in :root', () => {
      expect(cssContent).toContain('--z-canvas: 0;');
      expect(cssContent).toContain('--z-underlay: 1;');
      expect(cssContent).toContain('--z-hud: 10;');
      expect(cssContent).toContain('--z-dock: 20;');
      expect(cssContent).toContain('--z-controls: 30;');
      expect(cssContent).toContain('--z-backdrop: 40;');
      expect(cssContent).toContain('--z-sheet: 50;');
      expect(cssContent).toContain('--z-modal: 60;');
      expect(cssContent).toContain('--z-kill-switch: 70;');
      expect(cssContent).toContain('--z-toast: 80;');
      expect(cssContent).toContain('--z-popover: 80;');
      expect(cssContent).toContain('--z-tooltip: 90;');
    });

    it('contains all required media query breakpoints in CSS', () => {
      expect(cssContent).toContain('@media (max-width: 1100px)');
      expect(cssContent).toContain('@media (max-width: 760px)');
      expect(cssContent).toContain('@media (max-width: 420px)');
      expect(cssContent).toContain('@media (max-width: 360px)');
      expect(cssContent).toContain('@media (max-height: 720px)');
      expect(cssContent).toContain('@media (max-height: 600px)');
      expect(cssContent).toContain('@media (orientation: landscape) and (max-height: 450px)');
    });

    it('uses z-index CSS variables for overlays and controls', () => {
      expect(cssContent).toContain('z-index: var(--z-canvas');
      expect(cssContent).toContain('z-index: var(--z-hud');
      expect(cssContent).toContain('z-index: var(--z-dock');
      expect(cssContent).toContain('z-index: var(--z-controls');
      expect(cssContent).toContain('z-index: var(--z-backdrop');
      expect(cssContent).toContain('z-index: var(--z-sheet');
      expect(cssContent).toContain('z-index: var(--z-kill-switch');
      expect(cssContent).toContain('z-index: var(--z-toast');
      expect(cssContent).toContain('z-index: var(--z-popover');
    });
  });
});
