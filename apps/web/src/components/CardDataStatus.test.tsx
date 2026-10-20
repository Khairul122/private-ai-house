import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CardDataStatus } from './CardDataStatus.js';

function render(path: string, live: 'connecting' | 'live' | 'reconnecting'): string {
  const client = new QueryClient();
  try {
    return renderToStaticMarkup(<QueryClientProvider client={client}><CardDataStatus path={path} live={live} /></QueryClientProvider>);
  } finally {
    client.clear();
  }
}

describe('card data status', () => {
  it('names the loading state before sources exist', () => {
    const html = render('/profile', 'connecting');
    expect(html).toContain('data-state="waiting"');
    expect(html).toContain('Menunggu sumber data kartu');
    expect(html).toContain('role="status"');
  });

  it('labels realtime connection separately from data freshness', () => {
    expect(render('/profile', 'live')).toContain('Pembaruan otomatis terhubung');
    expect(render('/profile', 'reconnecting')).toContain('Realtime terputus, pembaruan berkala tetap aktif');
  });
});
