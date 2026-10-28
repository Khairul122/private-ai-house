import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OfficeFallbackView } from './OfficeFallbackView.js';
import type { BoardContent } from './VisualOffice.js';

describe('OfficeFallbackView', () => {
  const dummyBoards: BoardContent[] = [
    { id: 'opportunities', title: 'Peluang', lines: ['3 proyek cocok'], accent: '#2f9e5b' },
    { id: 'tasks', title: 'Papan Tugas', lines: ['1 kartu aktif'], accent: '#e8a317' },
  ];

  it('renders informative message for WebGL unsupported reason without retry button', () => {
    const onOpenBoard = vi.fn();
    const onRetry = vi.fn();
    const html = renderToStaticMarkup(
      <OfficeFallbackView
        reason="unsupported"
        onOpenBoard={onOpenBoard}
        onRetry={onRetry}
      />
    );

    expect(html).toContain('WebGL Tidak Didukung');
    expect(html).toContain('tidak mendukung WebGL');
    // For unsupported WebGL, retrying 3D is impossible, so retry button should not appear
    expect(html).not.toContain('Coba muat ulang tampilan 3D');
  });

  it('renders context lost timeout message with retry action button', () => {
    const onOpenBoard = vi.fn();
    const onRetry = vi.fn();
    const html = renderToStaticMarkup(
      <OfficeFallbackView
        reason="context_lost_timeout"
        onOpenBoard={onOpenBoard}
        onRetry={onRetry}
      />
    );

    expect(html).toContain('Koneksi Grafis Terputus');
    expect(html).toContain('5 detik');
    expect(html).toContain('Coba muat ulang tampilan 3D');
  });

  it('renders retry limit exceeded message', () => {
    const onOpenBoard = vi.fn();
    const html = renderToStaticMarkup(
      <OfficeFallbackView
        reason="retry_limit_exceeded"
        onOpenBoard={onOpenBoard}
      />
    );

    expect(html).toContain('Batas Pemulihan Grafis Terlampaui');
    expect(html).toContain('1 kali percobaan');
  });

  it('renders scene error with technical message details', () => {
    const onOpenBoard = vi.fn();
    const error = new Error('Shader compilation failed: uniform missing');
    const html = renderToStaticMarkup(
      <OfficeFallbackView
        reason="scene_error"
        error={error}
        onOpenBoard={onOpenBoard}
      />
    );

    expect(html).toContain('Kesalahan Tampilan 3D');
    expect(html).toContain('Shader compilation failed: uniform missing');
  });

  it('renders alternative navigation for all office boards with live line previews', () => {
    const onOpenBoard = vi.fn();
    const html = renderToStaticMarkup(
      <OfficeFallbackView
        reason="low_fps"
        boards={dummyBoards}
        onOpenBoard={onOpenBoard}
      />
    );

    expect(html).toContain('Mode Performa Ringan Aktif');
    expect(html).toContain('Navigasi Alternatif Papan &amp; Modul');
    expect(html).toContain('Peluang');
    expect(html).toContain('3 proyek cocok');
    expect(html).toContain('Papan Tugas');
    expect(html).toContain('1 kartu aktif');
    expect(html).toContain('Kotak Masuk');
    expect(html).toContain('projects.co.id');
    expect(html).toContain('Operasional Klien');
  });
});
