export type PerformanceOfferBannerProps = {
  fps: number;
  onAccept: () => void;
  onDismiss: () => void;
};

export function PerformanceOfferBanner({ fps, onAccept, onDismiss }: PerformanceOfferBannerProps) {
  return (
    <aside className="vo3d-perf-banner vo3d-float" role="status" aria-live="polite">
      <div className="vo3d-perf-banner-content">
        <span className="vo3d-perf-banner-icon" aria-hidden="true">⚡</span>
        <div>
          <strong>Performa grafis rendah (~{Math.round(fps)} FPS)</strong>
          <p>Beralih ke tampilan non-3D untuk kinerja sistem yang lebih lancar dan responsif?</p>
        </div>
      </div>
      <div className="vo3d-perf-banner-actions">
        <button
          type="button"
          className="vo3d-perf-btn-primary"
          onClick={onAccept}
        >
          Beralih ke non-3D
        </button>
        <button
          type="button"
          className="vo3d-perf-btn-secondary"
          onClick={onDismiss}
        >
          Tetap di 3D
        </button>
      </div>
    </aside>
  );
}
