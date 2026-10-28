export type WebglLifecycleStatus = 'ready' | 'context-lost' | 'restoring' | 'fallback';

export type FallbackReason =
  | 'unsupported'
  | 'context_lost_timeout'
  | 'retry_limit_exceeded'
  | 'scene_error'
  | 'low_fps'
  | 'user_choice';

export type WebglLifecycleOptions = {
  /** Timeout in ms waiting for webglcontextrestored before giving up and activating fallback. Default: 5000 ms */
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
    this.maxRetriesPerLoss = options.maxRetriesPerLoss ?? 1;
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
  handleContextLost(event?: { preventDefault?: () => void }): void {
    if (event?.preventDefault) {
      event.preventDefault();
    }

    this.clearTimeoutTimer();

    // If the controller was previously in ready/stable state, this initiates a new context loss sequence.
    if (this.status === 'ready') {
      this.retryCount = 0;
    }

    this.status = 'context-lost';
    this.fallbackReason = undefined;

    // Pause render loop to avoid WebGL draw errors during context loss
    this.onLoopControl?.(false);
    this.onStatusChange?.('context-lost');

    // Start 5-second timeout for webglcontextrestored
    this.restoreTimeoutTimer = setTimeout(() => {
      this.handleRestoreTimeout();
    }, this.restoreTimeoutMs);
  }

  /**
   * Called when a `webglcontextrestored` event occurs.
   * Cancels timeout and enforces the 1-retry limit.
   */
  handleContextRestored(preferredMode?: 'normal' | 'reduced-effects'): void {
    // Ignore events if not currently context-lost or restoring.
    // This prevents late restored events (after timeout fallback) or duplicate restored events
    // from re-initializing resources or resetting fallback.
    if (this.status !== 'context-lost' && this.status !== 'restoring') {
      return;
    }

    this.clearTimeoutTimer();

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
    this.onLoopControl?.(true);
    this.onRestore?.(this.currentMode);

    if (this.status === 'restoring') {
      this.status = 'ready';
      this.onStatusChange?.('ready');
    }
  }

  /**
   * Called when the 5s restore timeout expires without a restore event.
   */
  private handleRestoreTimeout(): void {
    this.clearTimeoutTimer();
    this.triggerFallback('context_lost_timeout');
  }

  /**
   * Immediately transitions to fallback non-3D mode.
   */
  triggerFallback(reason: FallbackReason, error?: unknown): void {
    this.clearTimeoutTimer();
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
    this.retryCount = 0;
  }

  /**
   * User or system attempts to retry 3D rendering from fallback state.
   */
  retry(): void {
    this.clearTimeoutTimer();
    this.retryCount = 0;
    this.fallbackReason = undefined;
    this.status = 'ready';
    this.onLoopControl?.(true);
    this.onRestore?.(this.currentMode);
    this.onStatusChange?.('ready');
  }

  /**
   * Attaches event listeners to the WebGL canvas element.
   * Returns an unbind function.
   */
  attachToCanvas(canvas: HTMLCanvasElement): () => void {
    const onLost = (e: Event) => this.handleContextLost(e as WebGLContextEvent);
    const onRestored = () => this.handleContextRestored();

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      this.clearTimeoutTimer();
    };
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
    this.clearTimeoutTimer();
  }
}
