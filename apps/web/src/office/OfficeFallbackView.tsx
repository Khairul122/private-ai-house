import { BOARDS, type BoardId } from '../state/office-layout.js';
import type { FallbackReason } from './webgl-lifecycle.js';
import type { BoardContent } from './VisualOffice.js';

export type OfficeFallbackViewProps = {
  reason?: FallbackReason | undefined;
  error?: unknown;
  boards?: BoardContent[] | undefined;
  onOpenBoard: (id: BoardId) => void;
  onRetry?: (() => void) | undefined;
};

const REASON_MESSAGES: Record<FallbackReason, { title: string; desc: string }> = {
  unsupported: {
    title: 'WebGL Tidak Didukung',
    desc: 'Browser atau akselerasi perangkat keras Anda tidak mendukung WebGL. Seluruh fungsi bisnis tetap dapat diakses melalui antarmuka 2D di bawah ini.',
  },
  context_lost_timeout: {
    title: 'Koneksi Grafis Terputus',
    desc: 'Koneksi WebGL terputus (GPU crash atau sleep) dan tidak pulih dalam batas waktu 5 detik. Mode non-3D diaktifkan untuk menjaga kelangsungan kerja.',
  },
  retry_limit_exceeded: {
    title: 'Batas Pemulihan Grafis Terlampaui',
    desc: 'Koneksi grafis berulang kali terputus melebihi batas 1 kali percobaan pemulihan. Mode non-3D diaktifkan agar aplikasi tetap stabil.',
  },
  scene_error: {
    title: 'Kesalahan Tampilan 3D',
    desc: 'Terjadi kendala teknis saat merender ruang visual kantor. Navigasi alternatif disediakan agar alur kerja tidak terganggu.',
  },
  low_fps: {
    title: 'Mode Performa Ringan Aktif',
    desc: 'Performa tampilan 3D berada di bawah ambang batas minimum. Mode alternatif diaktifkan untuk pengalaman yang lebih responsif.',
  },
  user_choice: {
    title: 'Tampilan Non-3D Pilihan Anda',
    desc: 'Anda memilih untuk beralih ke mode 2D ringan. Anda dapat kembali ke ruang 3D kapan saja.',
  },
};

export function OfficeFallbackView({ reason = 'unsupported', error, boards = [], onOpenBoard, onRetry }: OfficeFallbackViewProps) {
  const info = REASON_MESSAGES[reason] ?? REASON_MESSAGES.unsupported;

  return (
    <div className="vo3d-fallback-view" role="region" aria-label="Navigasi alternatif kantor">
      <div className="vo3d-fallback-card">
        <div className="vo3d-fallback-header">
          <span className="vo3d-fallback-icon" aria-hidden="true">🖥️</span>
          <div>
            <h2>{info.title}</h2>
            <p>{info.desc}</p>
            {error instanceof Error && (
              <details className="vo3d-fallback-details">
                <summary>Rincian teknis</summary>
                <code>{error.message}</code>
              </details>
            )}
          </div>
        </div>

        {onRetry && reason !== 'unsupported' && (
          <div className="vo3d-fallback-actions">
            <button
              type="button"
              className="vo3d-btn-secondary"
              onClick={onRetry}
            >
              Coba muat ulang tampilan 3D
            </button>
          </div>
        )}

        <div className="vo3d-fallback-section">
          <h3>Navigasi Alternatif Papan & Modul</h3>
          <p className="vo3d-fallback-sub">
            Pilih papan di bawah ini untuk membuka kartu kontrol secara langsung tanpa tampilan 3D:
          </p>

          <div className="vo3d-fallback-grid">
            {BOARDS.map((slot) => {
              const content = boards.find((b) => b.id === slot.id);
              const preview = content?.lines?.[0];
              return (
                <button
                  key={slot.id}
                  type="button"
                  className="vo3d-fallback-board-btn"
                  onClick={() => onOpenBoard(slot.id)}
                >
                  <div className="vo3d-fallback-board-name">
                    <strong>{slot.label}</strong>
                    {slot.floor === 2 && <span className="vo3d-badge">Lt 2</span>}
                  </div>
                  {preview && (
                    <span className="vo3d-fallback-preview">{preview}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
