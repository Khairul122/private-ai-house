import { whatsappStateLabels, type WhatsAppCheck } from '../api/whatsapp-status.js';

export default function WhatsAppStatus({ check, checking, refresh }: { check: WhatsAppCheck | undefined; checking: boolean; refresh: () => void }) {
  const stale = !!check && Date.now() - Date.parse(check.checkedAt) > 15_000;
  const session = stale ? null : check?.session;
  const http = check?.httpStatus;
  return <section className="operations-wa-status" aria-label="Status integrasi WhatsApp">
    <div className="operations-status-line">
      <strong>Status WhatsApp</strong>
      <span className="operations-status-badge" data-tone={http && http >= 200 && http < 300 && !stale ? 'ok' : http ? 'error' : 'neutral'}>HTTP {http ?? '—'} · API lokal{stale ? ' (hasil lama)' : ''}</span>
      <span className="operations-status-badge" data-tone={session?.state === 'connected' ? 'ok' : session?.state === 'error' ? 'error' : 'neutral'}>WA · {session ? whatsappStateLabels[session.state] : 'Tidak diketahui'}</span>
    </div>
    <p>{stale ? 'Pemeriksaan sudah lebih dari 15 detik. Perbarui status untuk mengetahui koneksi terbaru.' : check?.error ?? session?.reason ?? 'Memeriksa API lokal dan sesi WhatsApp…'}</p>
    <div className="operations-actions"><small>{check ? `Diperiksa ${new Date(check.checkedAt).toLocaleString('id-ID')}` : 'Belum ada hasil pemeriksaan.'}</small><button className="button button-secondary" type="button" disabled={checking} onClick={refresh}>{checking ? 'Memeriksa status WA…' : 'Periksa status WA'}</button></div>
    <small>HTTP berasal dari respons endpoint status aplikasi. Sesi WhatsApp terhubung hanya bila server menerima koneksi terbuka dari WhatsApp.</small>
  </section>;
}
