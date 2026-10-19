import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import WhatsAppStatus from './WhatsAppStatus.js';
import { checkWhatsAppStatus } from './whatsapp-status.js';

afterEach(() => vi.unstubAllGlobals());
describe('WhatsApp status evidence', () => {
  it('keeps HTTP 200 separate from a disconnected WhatsApp session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ state: 'disconnected', reason: 'Pindai QR.', qr: null }), { status: 200 })));
    const check = await checkWhatsAppStatus();
    expect(check.httpStatus).toBe(200);
    const html = renderToStaticMarkup(<WhatsAppStatus check={check} checking={false} refresh={() => undefined}/>);
    expect(html).toContain('HTTP 200'); expect(html).toContain('WA · Terputus'); expect(html).not.toContain('WA · Terhubung');
  });
  it('shows the actual HTTP error and discards session fields from unsuccessful responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ state: 'connected', qr: null, reason: 'Must not display' }), { status: 503 })));
    const check = await checkWhatsAppStatus();
    expect(check).toMatchObject({ httpStatus: 503, session: null });
  });
  it('does not invent an HTTP status when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await checkWhatsAppStatus()).toMatchObject({ httpStatus: null, session: null });
  });
  it('rejects malformed success bodies while retaining the observed HTTP code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    expect(await checkWhatsAppStatus()).toMatchObject({ httpStatus: 200, session: null, error: expect.stringContaining('tidak valid') });
  });
  it('does not show an old connected observation as current', () => {
    const html = renderToStaticMarkup(<WhatsAppStatus check={{ httpStatus: 200, checkedAt: new Date(Date.now() - 60_000).toISOString(), session: { state: 'connected', reason: 'Terhubung sebelumnya.', qr: null }, error: null }} checking={false} refresh={() => undefined}/>);
    expect(html).toContain('WA · Tidak diketahui'); expect(html).not.toContain('WA · Terhubung');
  });
});
