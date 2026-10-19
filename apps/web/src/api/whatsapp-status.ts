export type WhatsAppSession = {
  state: 'disconnected' | 'connecting' | 'qr' | 'connected' | 'error' | 'unavailable';
  reason: string;
  qr: string | null;
};
export type WhatsAppCheck = { httpStatus: number | null; checkedAt: string; session: WhatsAppSession | null; error: string | null };
const states = ['disconnected', 'connecting', 'qr', 'connected', 'error', 'unavailable'];

export async function checkWhatsAppStatus(): Promise<WhatsAppCheck> {
  let httpStatus: number | null = null;
  try {
    const response = await fetch('/api/operations/whatsapp', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    httpStatus = response.status || null;
    if (!response.ok) throw new Error('Status sesi tidak tersedia. Periksa server lalu coba lagi.');
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('state' in body) || typeof body.state !== 'string' || !states.includes(body.state) || !('reason' in body) || typeof body.reason !== 'string' || !('qr' in body) || (body.qr !== null && typeof body.qr !== 'string')) {
      throw new Error('Respons status WhatsApp tidak valid. Periksa server.');
    }
    const session = body as WhatsAppSession;
    return { httpStatus, checkedAt: new Date().toISOString(), session, error: null };
  } catch (error) {
    return { httpStatus, checkedAt: new Date().toISOString(), session: null, error: httpStatus === null ? 'Server tidak dapat dijangkau. Periksa koneksi aplikasi.' : error instanceof Error ? error.message : 'Status WhatsApp tidak tersedia.' };
  }
}

export const whatsappStateLabels: Record<WhatsAppSession['state'], string> = {
  connected: 'Terhubung', connecting: 'Menghubungkan', qr: 'Menunggu pindai QR', disconnected: 'Terputus', error: 'Koneksi gagal', unavailable: 'Tidak tersedia',
};
