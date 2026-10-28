import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PerformanceOfferBanner } from './PerformanceOfferBanner.js';

describe('PerformanceOfferBanner', () => {
  it('renders low FPS warning and action buttons', () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    const html = renderToStaticMarkup(
      <PerformanceOfferBanner
        fps={19.6}
        onAccept={onAccept}
        onDismiss={onDismiss}
      />
    );

    expect(html).toContain('Performa grafis rendah (~20 FPS)');
    expect(html).toContain('Beralih ke tampilan non-3D');
    expect(html).toContain('Beralih ke non-3D');
    expect(html).toContain('Tetap di 3D');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});
