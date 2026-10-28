export type PerformanceStatus = 'normal' | 'reduced-effects' | 'fallback-offer';

/** Fixed-size rolling window for stable FPS decisions without unbounded memory. */
export class RollingFpsWindow {
  private readonly samples: number[] = [];

  constructor(private readonly size = 60) {}

  add(fps: number): number {
    this.samples.push(fps);
    if (this.samples.length > this.size) this.samples.shift();
    return this.average;
  }

  get average(): number {
    return this.samples.length === 0 ? 60 : this.samples.reduce((sum, sample) => sum + sample, 0) / this.samples.length;
  }

  get isFull(): boolean {
    return this.samples.length >= this.size;
  }

  clear(): void {
    this.samples.length = 0;
  }
}

export type PerformanceControllerOptions = {
  /** FPS threshold below which duration begins accumulating for reduced effects. Default: 30 */
  reducedFpsThreshold?: number;
  /** Duration in ms below reducedFpsThreshold before transitioning to reduced-effects. Default: 2000 ms */
  reducedDurationMs?: number;
  /** FPS threshold below which duration begins accumulating for fallback offer. Default: 24 */
  fallbackFpsThreshold?: number;
  /** Duration in ms below fallbackFpsThreshold before transitioning to fallback-offer. Default: 5000 ms */
  fallbackDurationMs?: number;
  /** Hysteresis recovery FPS threshold to transition back to a higher tier. Default: 35 */
  recoveryFpsThreshold?: number;
  /** Sustained duration in ms above recovery threshold required to recover. Default: 3000 ms */
  recoveryDurationMs?: number;
};

export type PerformanceMetrics = {
  lastFps: number;
  status: PerformanceStatus;
  belowReducedMs: number;
  belowFallbackMs: number;
  recoveryMs: number;
  fallbackDismissed: boolean;
};

export class PerformanceController {
  private status: PerformanceStatus = 'normal';
  private lastFps = 60;
  private readonly fpsWindow: RollingFpsWindow;
  private hidden = false;
  private belowReducedMs = 0;
  private belowFallbackMs = 0;
  private recoveryMs = 0;
  private fallbackDismissed = false;

  private readonly reducedFpsThreshold: number;
  private readonly reducedDurationMs: number;
  private readonly fallbackFpsThreshold: number;
  private readonly fallbackDurationMs: number;
  private readonly recoveryFpsThreshold: number;
  private readonly recoveryDurationMs: number;

  constructor(options: PerformanceControllerOptions = {}) {
    this.reducedFpsThreshold = options.reducedFpsThreshold ?? 30;
    this.reducedDurationMs = options.reducedDurationMs ?? 2000;
    this.fallbackFpsThreshold = options.fallbackFpsThreshold ?? 24;
    this.fallbackDurationMs = options.fallbackDurationMs ?? 5000;
    this.recoveryFpsThreshold = options.recoveryFpsThreshold ?? 35;
    this.recoveryDurationMs = options.recoveryDurationMs ?? 3000;
    this.fpsWindow = new RollingFpsWindow(60);
    if (typeof document !== 'undefined') {
      this.hidden = document.hidden;
      document.addEventListener('visibilitychange', this.handleVisibility);
    }
  }

  private readonly handleVisibility = () => {
    this.hidden = document.hidden;
    if (this.hidden) {
      this.fpsWindow.clear();
      this.belowReducedMs = 0;
      this.belowFallbackMs = 0;
      this.recoveryMs = 0;
    }
  };

  /**
   * Updates controller with one frame sample. Long gaps and hidden tabs do not count.
   */
  update(fps: number, deltaMs: number): PerformanceStatus {
    if (deltaMs > 250 || this.hidden) return this.status;
    this.fpsWindow.add(fps);
    const averageFps = this.fpsWindow.isFull ? this.fpsWindow.average : fps;
    return this.updateAverage(averageFps, deltaMs);
  }

  /**
   * Applies state transitions to rolling-average FPS.
   */
  private updateAverage(fps: number, deltaMs: number): PerformanceStatus {
    this.lastFps = fps;

    if (this.status === 'normal') {
      if (fps < this.reducedFpsThreshold) {
        this.belowReducedMs += deltaMs;
        this.recoveryMs = 0;
        if (this.belowReducedMs >= this.reducedDurationMs) {
          this.status = 'reduced-effects';
          this.recoveryMs = 0;
        }
      } else {
        this.belowReducedMs = 0;
        this.recoveryMs = 0;
      }

      if (fps < this.fallbackFpsThreshold) {
        this.belowFallbackMs += deltaMs;
        if (this.belowFallbackMs >= this.fallbackDurationMs && !this.fallbackDismissed) {
          this.status = 'fallback-offer';
        }
      } else {
        this.belowFallbackMs = 0;
      }
    } else if (this.status === 'reduced-effects') {
      // Check if degraded further to fallback offer (< 24 FPS for 5s)
      if (fps < this.fallbackFpsThreshold) {
        this.belowFallbackMs += deltaMs;
        this.recoveryMs = 0;
        if (this.belowFallbackMs >= this.fallbackDurationMs && !this.fallbackDismissed) {
          this.status = 'fallback-offer';
          this.recoveryMs = 0;
        }
      } else {
        this.belowFallbackMs = 0;

        // Check recovery hysteresis (sustained FPS >= recoveryFpsThreshold for recoveryDurationMs)
        if (fps >= this.recoveryFpsThreshold) {
          this.recoveryMs += deltaMs;
          if (this.recoveryMs >= this.recoveryDurationMs) {
            this.status = 'normal';
            this.belowReducedMs = 0;
            this.belowFallbackMs = 0;
            this.recoveryMs = 0;
          }
        } else {
          this.recoveryMs = 0;
        }
      }
    } else if (this.status === 'fallback-offer') {
      // If in fallback-offer and FPS improves sustained above recovery threshold
      if (fps >= this.recoveryFpsThreshold) {
        this.recoveryMs += deltaMs;
        if (this.recoveryMs >= this.recoveryDurationMs) {
          this.status = 'reduced-effects';
          this.belowFallbackMs = 0;
          this.recoveryMs = 0;
        }
      } else {
        this.recoveryMs = 0;
      }
    }

    return this.status;
  }

  /**
   * User dismisses the fallback offer; keeps reduced-effects mode and stops re-prompting
   * until reset.
   */
  dismissFallbackOffer(): void {
    if (this.status === 'fallback-offer') {
      this.status = 'reduced-effects';
    }
    this.fallbackDismissed = true;
    this.belowFallbackMs = 0;
    this.recoveryMs = 0;
  }

  /**
   * Resets all internal timers and restores status to 'normal'.
   */
  reset(): void {
    this.status = 'normal';
    this.lastFps = 60;
    this.belowReducedMs = 0;
    this.belowFallbackMs = 0;
    this.recoveryMs = 0;
    this.fallbackDismissed = false;
    this.fpsWindow.clear();
  }

  dispose(): void {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  getStatus(): PerformanceStatus {
    return this.status;
  }

  getMetrics(): PerformanceMetrics {
    return {
      lastFps: this.lastFps,
      status: this.status,
      belowReducedMs: this.belowReducedMs,
      belowFallbackMs: this.belowFallbackMs,
      recoveryMs: this.recoveryMs,
      fallbackDismissed: this.fallbackDismissed,
    };
  }
}
