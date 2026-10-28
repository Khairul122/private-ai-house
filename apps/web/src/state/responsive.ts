import { useState, useEffect } from 'react';

/**
 * Responsive breakpoint, viewport, touch target, and stacking contract.
 * Standardized for FVH Mission Control.
 */

// Viewport width breakpoints (px)
export const BREAKPOINTS = {
  DESKTOP_MIN: 1101,
  TABLET_MAX: 1100,
  TABLET_MIN: 761,
  MOBILE_MAX: 760,
  MOBILE_MIN: 421,
  COMPACT_MOBILE_MAX: 420,
  COMPACT_MOBILE_MIN: 361,
  ULTRA_COMPACT_MAX: 360,
} as const;

// Viewport height breakpoints (px)
export const HEIGHT_BREAKPOINTS = {
  TALL_MIN: 721,
  SHORT_MAX: 720,
  SHORT_MIN: 601,
  COMPACT_MAX: 600,
  LANDSCAPE_COMPACT_MAX: 450,
} as const;

// Interaction & Touch Target Tokens
export const TOUCH_TARGET_TOKENS = {
  MIN_PX: 44,
  GAP_PX: 8,
  MIN_CSS: '44px',
  GAP_CSS: '8px',
} as const;

// Viewport Unit Tokens
export const VIEWPORT_UNIT_TOKENS = {
  APP_HEIGHT: '100dvh',
} as const;

// Safe Area Inset Tokens
export const SAFE_AREA_TOKENS = {
  TOP: 'env(safe-area-inset-top, 0px)',
  RIGHT: 'env(safe-area-inset-right, 0px)',
  BOTTOM: 'env(safe-area-inset-bottom, 0px)',
  LEFT: 'env(safe-area-inset-left, 0px)',
} as const;

// Stacking Z-Index Order Tokens
export const STACKING_TOKENS = {
  canvas: 0,
  underlay: 1,
  hud: 10,
  dock: 20,
  controls: 30,
  backdrop: 40,
  sheet: 50,
  modal: 60,
  killSwitch: 70,
  toast: 80,
  popover: 80,
  tooltip: 90,
} as const;

// Standard CSS Media Query Strings
export const MEDIA_QUERIES = {
  desktop: '(min-width: 1101px)',
  tablet: '(max-width: 1100px)',
  tabletExclusive: '(min-width: 761px) and (max-width: 1100px)',
  mobile: '(max-width: 760px)',
  mobileExclusive: '(min-width: 421px) and (max-width: 760px)',
  compactMobile: '(max-width: 420px)',
  compactMobileExclusive: '(min-width: 361px) and (max-width: 420px)',
  ultraCompact: '(max-width: 360px)',
  tallHeight: '(min-height: 721px)',
  shortHeight: '(max-height: 720px)',
  compactHeight: '(max-height: 600px)',
  compactLandscape: '(orientation: landscape) and (max-height: 450px)',
  reducedMotion: '(prefers-reduced-motion: reduce)',
  touchDevice: '(pointer: coarse)',
} as const;

export type ViewportWidthMode =
  | 'desktop'
  | 'tablet'
  | 'mobile'
  | 'compact-mobile'
  | 'ultra-compact';

export type ViewportHeightMode =
  | 'tall'
  | 'short'
  | 'compact-height';

export type ViewportOrientation = 'portrait' | 'landscape';

export interface ResolvedViewport {
  width: number;
  height: number;
  widthMode: ViewportWidthMode;
  heightMode: ViewportHeightMode;
  orientation: ViewportOrientation;
  isCompactLandscape: boolean;
  isTouchFirst: boolean;
  isMobileOrNarrow: boolean; // width <= 760
  isCompactOrNarrow: boolean; // width <= 420
  isUltraCompact: boolean; // width <= 360
  isShortHeight: boolean; // height <= 720
  isCompactHeight: boolean; // height <= 600
}

export function resolveViewportWidthMode(width: number): ViewportWidthMode {
  if (width <= BREAKPOINTS.ULTRA_COMPACT_MAX) return 'ultra-compact';
  if (width <= BREAKPOINTS.COMPACT_MOBILE_MAX) return 'compact-mobile';
  if (width <= BREAKPOINTS.MOBILE_MAX) return 'mobile';
  if (width <= BREAKPOINTS.TABLET_MAX) return 'tablet';
  return 'desktop';
}

export function resolveViewportHeightMode(height: number): ViewportHeightMode {
  if (height <= HEIGHT_BREAKPOINTS.COMPACT_MAX) return 'compact-height';
  if (height <= HEIGHT_BREAKPOINTS.SHORT_MAX) return 'short';
  return 'tall';
}

export function resolveViewportOrientation(
  width: number,
  height: number,
  override?: ViewportOrientation
): ViewportOrientation {
  if (override) return override;
  return width >= height ? 'landscape' : 'portrait';
}

export function resolveViewport(
  width: number,
  height: number,
  orientationOverride?: ViewportOrientation
): ResolvedViewport {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  const orientation = resolveViewportOrientation(safeWidth, safeHeight, orientationOverride);
  const widthMode = resolveViewportWidthMode(safeWidth);
  const heightMode = resolveViewportHeightMode(safeHeight);

  const isCompactLandscape =
    orientation === 'landscape' && safeHeight <= HEIGHT_BREAKPOINTS.LANDSCAPE_COMPACT_MAX;

  return {
    width: safeWidth,
    height: safeHeight,
    widthMode,
    heightMode,
    orientation,
    isCompactLandscape,
    isTouchFirst: safeWidth <= BREAKPOINTS.MOBILE_MAX || isCompactLandscape,
    isMobileOrNarrow: safeWidth <= BREAKPOINTS.MOBILE_MAX,
    isCompactOrNarrow: safeWidth <= BREAKPOINTS.COMPACT_MOBILE_MAX,
    isUltraCompact: safeWidth <= BREAKPOINTS.ULTRA_COMPACT_MAX,
    isShortHeight: safeHeight <= HEIGHT_BREAKPOINTS.SHORT_MAX,
    isCompactHeight: safeHeight <= HEIGHT_BREAKPOINTS.COMPACT_MAX,
  };
}

export function useResolvedViewport(): ResolvedViewport {
  const [viewport, setViewport] = useState<ResolvedViewport>(() => {
    if (typeof window === 'undefined') {
      return resolveViewport(1280, 800, 'landscape');
    }
    return resolveViewport(window.innerWidth, window.innerHeight);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function handleResize() {
      setViewport(resolveViewport(window.innerWidth, window.innerHeight));
    }

    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return viewport;
}
