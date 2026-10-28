export type WebglLifecycleStatus = 'ready' | 'context-lost' | 'restoring' | 'fallback';

export type FallbackReason =
  | 'unsupported'
  | 'context_lost_timeout'
  | 'retry_limit_exceeded'
  | 'scene_error'
  | 'low_fps'
  | 'user_choice';

const FALLBACK_PRIORITY: Record<FallbackReason, number> = {
  unsupported: 6,
  scene_error: 5,
  retry_limit_exceeded: 4,
  context_lost_timeout: 3,
  low_fps: 2,
  user_choice: 1,
};

export type WebglLifecycleOptions = {
  /** Timeout in ms waiting for verified stable recovery before activating fallback. Default: 5000 ms */
  restoreTimeoutMs?: number;
  /** Maximum number of restore attempts allowed per context loss sequence. Default: 1 */
  maxRetriesPerLoss?: number;
  /** Initial performance mode on restore ('normal' | 'reduced-effects'). Default: 'normal' */
  initialRestoreMode?: 'normal' | 'reduced-effects';
  onStatusChange?: (status: WebglLifecycleStatus, reason?: FallbackReason) => void;
  onRestore?: (mode: 'normal' | 'reduced-effects') => void;
  onFallback?: (reason: FallbackReason, error?: unknown) => void;
  onLoopControl?: (active: boolean) => void;
};

export class WebglLifecycleController {
  private status: WebglLifecycleStatus = 'ready';
  private fallbackReason: FallbackReason | undefined = undefined;
  private restoreTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private recoveryVersion = 0;
  private canvasElement: HTMLCanvasElement | null = null;
  private detachCanvas: (() => void) | null = null;
  private destroyed = false;
  private currentMode: 'normal' | 'reduced-effects';

  private readonly restoreTimeoutMs: number;
  private readonly maxRetriesPerLoss: number;
  private readonly initialRestoreMode: 'normal' | 'reduced-effects';
  private readonly onStatusChange: ((status: WebglLifecycleStatus, reason?: FallbackReason) => void) | undefined;
  private readonly onRestore: ((mode: 'normal' | 'reduced-effects') => void) | undefined;
  private readonly onFallback: ((reason: FallbackReason, error?: unknown) => void) | undefined;
  private readonly onLoopControl: ((active: boolean) => void) | undefined;

  constructor(options: WebglLifecycleOptions = {}) {
    this.restoreTimeoutMs = options.restoreTimeoutMs ?? 5000;
    this.maxRetriesPerLoss = Math.min(1, Math.max(0, options.maxRetriesPerLoss ?? 1));
    this.initialRestoreMode = options.initialRestoreMode ?? 'normal';
    this.currentMode = this.initialRestoreMode;
    this.onStatusChange = options.onStatusChange;
    this.onRestore = options.onRestore;
    this.onFallback = options.onFallback;
    this.onLoopControl = options.onLoopControl;
  }

  /**
   * Called when a `webglcontextlost` event occurs.
   * Prevents default browser handling (enabling restore), pauses render loop,
   * and starts a 5-second recovery timeout.
   */
  handleContextLost(event?: { target?: EventTarget | null; preventDefault?: () => void }): void {
    if (this.destroyed || (this.canvasElement !== null && event?.target !== this.canvasElement)
      || (event?.target != null && event.target !== this.canvasElement)) return;
    if (this.status === 'fallback') return;
    if (event?.preventDefault) {
      event.preventDefault();
    }

    if (this.status === 'context-lost') return;

    this.status = 'context-lost';
    this.recoveryVersion += 1;
    this.fallbackReason = undefined;

    // Pause render loop to avoid WebGL draw errors during context loss
    this.onLoopControl?.(false);
    this.onStatusChange?.('context-lost');

    // Start 5-second timeout for webglcontextrestored
    this.startRecoveryTimer();
  }

  /**
   * Called when a `webglcontextrestored` event occurs.
   * Enforces the 1-retry limit; recovery still requires verified stable frames.
   */
  handleContextRestored(preferredMode?: 'normal' | 'reduced-effects'): void {
    // Ignore events if not currently context-lost or restoring.
    // This prevents late restored events (after timeout fallback) or duplicate restored events
    // from re-initializing resources or resetting fallback.
    if (this.destroyed || (this.status !== 'context-lost' && this.status !== 'restoring')) {
      return;
    }

    if (this.status === 'restoring') return;

    if (this.retryCount >= this.maxRetriesPerLoss) {
      this.triggerFallback('retry_limit_exceeded');
      return;
    }

    this.retryCount += 1;
    this.status = 'restoring';
    this.onStatusChange?.('restoring');

    if (preferredMode) {
      this.currentMode = preferredMode;
    }

    // Re-initialize resources exactly once for this restore event
    try {
      this.onLoopControl?.(true);
      this.onRestore?.(this.currentMode);
    } catch (error) {
      this.triggerFallback('scene_error', error);
    }
  }

  /**
   * Called when the 5s recovery deadline expires without verified stable frames.
   */
  private handleRestoreTimeout(): void {
    this.clearTimeoutTimer();
    this.triggerFallback('context_lost_timeout');
  }

  /**
   * Immediately transitions to fallback non-3D mode.
   */
  triggerFallback(reason: FallbackReason, error?: unknown): void {
    if (this.destroyed) return;
    if (this.status === 'fallback' && this.fallbackReason
      && FALLBACK_PRIORITY[reason] <= FALLBACK_PRIORITY[this.fallbackReason]) return;
    this.clearTimeoutTimer();
    this.detachCanvas?.();
    this.status = 'fallback';
    this.fallbackReason = reason;
    this.onLoopControl?.(false);
    this.onStatusChange?.('fallback', reason);
    this.onFallback?.(reason, error);
  }

  /**
   * Marks that the 3D scene has rendered stably, resetting the loss retry count.
   */
  markStable(): void {
    if (this.destroyed || (this.status !== 'ready' && this.status !== 'restoring')) return;
    this.clearTimeoutTimer();
    this.retryCount = 0;
    if (this.status === 'restoring') {
      this.status = 'ready';
      this.onStatusChange?.('ready');
    }
  }

  /**
   * User or system attempts to retry 3D rendering from fallback state.
   */
  retry(): void {
    if (this.destroyed || this.status !== 'fallback') return;
    this.clearTimeoutTimer();
    // An explicit user retry grants a fresh canvas, never an automatic restore loop.
    this.retryCount = Math.max(1, this.retryCount);
    this.recoveryVersion += 1;
    this.fallbackReason = undefined;
    this.status = 'restoring';
    this.startRecoveryTimer();
    this.onStatusChange?.('restoring');
    try {
      this.onLoopControl?.(true);
      this.onRestore?.(this.currentMode);
    } catch (error) {
      this.triggerFallback('scene_error', error);
    }
  }

  /**
   * Attaches event listeners to the WebGL canvas element.
   * Returns an unbind function.
   */
  attachToCanvas(canvas: HTMLCanvasElement): () => void {
    this.detachCanvas?.();
    this.destroyed = false;
    this.canvasElement = canvas;
    const onLost = (e: Event) => this.handleContextLost(e);
    const onRestored = (e: Event) => {
      if (e.target === this.canvasElement) this.handleContextRestored();
    };

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    const detach = () => {
      if (this.detachCanvas !== detach) return;
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      this.canvasElement = null;
      this.detachCanvas = null;
      this.clearTimeoutTimer();
    };
    this.detachCanvas = detach;
    if (this.status === 'context-lost' || this.status === 'restoring') this.startRecoveryTimer();
    return detach;
  }

  isCurrentCanvas(canvas: HTMLCanvasElement): boolean {
    return !this.destroyed && this.canvasElement === canvas;
  }

  getRecoveryVersion(): number {
    return this.recoveryVersion;
  }

  private startRecoveryTimer(): void {
    // Duplicate loss/restore events must not extend the recovery deadline.
    if (this.restoreTimeoutTimer !== null) return;
    this.restoreTimeoutTimer = setTimeout(() => this.handleRestoreTimeout(), this.restoreTimeoutMs);
  }

  private clearTimeoutTimer(): void {
    if (this.restoreTimeoutTimer !== null) {
      clearTimeout(this.restoreTimeoutTimer);
      this.restoreTimeoutTimer = null;
    }
  }

  getStatus(): WebglLifecycleStatus {
    return this.status;
  }

  getFallbackReason(): FallbackReason | undefined {
    return this.fallbackReason;
  }

  getRetryCount(): number {
    return this.retryCount;
  }

  getCurrentMode(): 'normal' | 'reduced-effects' {
    return this.currentMode;
  }

  destroy(): void {
    this.detachCanvas?.();
    this.clearTimeoutTimer();
    this.destroyed = true;
  }
}
