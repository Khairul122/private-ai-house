import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, jsonRequest } from '../api/api.js';
import type { BrowserBiddingStatus } from '../api/browser-bidding-api.js';

const labels: Record<BrowserBiddingStatus['state'], string> = { stopped: 'Belum tersambung', opening: 'Meminta sambungan Chrome', login_required: 'Perlu login', challenge: 'Perlu verifikasi manusia', account_mismatch: 'Akun berbeda', ready: 'Akun & kuota siap', quota_exhausted: 'Kuota akun habis', checking: 'Memeriksa', submitting: 'Mengirim bid', error: 'Perlu diperiksa' };
const date = (value: string) => new Date(value).toLocaleString('id-ID');
export default function BrowserBiddingCard() {
  const query = useQuery({ queryKey: ['browser-bidding'], queryFn: () => api<BrowserBiddingStatus | null>('/browser-bidding'), refetchInterval: 2000 });
  const cache = useQueryClient();
  const [mode, setMode] = useState<BrowserBiddingStatus['mode'] | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const data = query.isError ? undefined : query.data;
  const old = !!data?.checkedAt && Date.now() - Date.parse(data.checkedAt) > 90_000;
  const busy = pending || !!data?.busy;
  async function action(path: string, method: 'POST' | 'PUT' = 'POST', body?: unknown) {
    setPending(true); setNotice(null);
    try {
      await api(`/browser-bidding/${path}`, jsonRequest(method, body));
      await cache.invalidateQueries({ queryKey: ['browser-bidding'] });
      setNotice({ error: false, text: path === 'mode' ? 'Jalur pengiriman tersimpan. Kebijakan dan kill switch tetap berlaku.' : 'Permintaan diterima. Pantau status pemeriksaan di bawah.' });
      if (path === 'mode') setMode(null);
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : 'Kontrol browser gagal.' }); }
    finally { setPending(false); }
  }
  return <section className="form-card operations-page" aria-label="Bid melalui browser">
    <h2>Bid melalui Chrome / Playwright</h2>
    <p>Operator Browser Bid menggunakan sambungan ke Chrome berprofil Anda yang sudah login Freelancer. Worker membuat tab kerja dalam sesi yang sama. Harga, proposal dan batas bid tetap berasal dari autopilot dan kebijakan Anda.</p>
    {notice && <p className={`notice ${notice.error ? 'notice-error' : 'notice-success'}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    {query.isPending ? <p role="status">Memuat worker browser…</p> : !data ? <p role="alert">Status worker tidak tersedia. <button className="button button-secondary" onClick={() => void query.refetch()}>Muat ulang status browser</button></p> : <>
      <div className="operations-status-line">
        <span className="operations-status-badge" data-tone={data.state === 'ready' && !old ? 'ok' : 'neutral'}>{old ? 'Status pemeriksaan lama' : labels[data.state]}</span>
        <span className="operations-status-badge">HTTP halaman {data.pageStatus ?? '—'}</span>
        <span className="operations-status-badge">Bid tersisa {data.remaining ?? 'Tidak diketahui'}</span>
      </div>
      <p>{data.reason}</p><p>Akun browser: {data.username ? `@${data.username}` : 'Belum terverifikasi'} · Diperiksa: {data.checkedAt ? date(data.checkedAt) : 'Belum pernah'}</p>
      <form onSubmit={event => { event.preventDefault(); void action('mode', 'PUT', { mode: mode ?? data.mode }); }}><fieldset disabled={busy}>
        <label className="form-field"><span>Jalur pengiriman bid otomatis</span><select value={mode ?? data.mode} onChange={e => setMode(e.target.value as BrowserBiddingStatus['mode'])}>
          <option value="api">API saja</option><option value="api-fallback">API utama, browser untuk penolakan akses / batas request API</option><option value="browser">Browser sebagai pengirim</option>
        </select></label><button className="button button-primary" type="submit">Simpan jalur pengiriman</button>
      </fieldset></form>
      <div className="operations-actions"><button className="button button-secondary" disabled={busy} onClick={() => void action('open')}>Hubungkan Chrome saya</button><button className="button button-secondary" disabled={busy || data.state === 'stopped'} onClick={() => void action('check')}>Periksa akun & kuota</button><button className="button button-secondary" disabled={pending || data.state === 'stopped'} onClick={() => void action('close')}>Lepas sambungan worker</button></div>
      <details><summary>Persiapan Chrome berprofil Anda</summary><ol><li>Buka Chrome yang sudah login sebagai akun Freelancer Anda.</li><li>Buka <code>chrome://inspect/#remote-debugging</code>, lalu aktifkan <span lang="en">Allow remote debugging for this browser instance</span>.</li><li>Klik <strong>Hubungkan Chrome saya</strong>, lalu setujui dialog izin Chrome jika Anda mengizinkan aplikasi mengontrol browser.</li></ol><p>Izin debugging memberi aplikasi akses kontrol pada sesi Chrome Anda. Implementasi worker memakai tab kerjanya sendiri di Freelancer. Chrome meminta izin setiap sambungan baru. Melepas sambungan menutup tab worker dan membiarkan jendela serta tab Anda tetap terbuka.</p></details>
      <p>Login, OTP, CAPTCHA dan perjanjian perlu Anda selesaikan sendiri. Kuota akun habis, timeout API atau hasil submit yang belum pasti tidak dicoba ulang melalui browser. Tidak ada upgrade bid berbayar yang dipilih worker.</p>
      {data.lastResult && <div className="operations-row"><strong>Hasil browser terakhir · Proyek {data.lastResult.projectId}</strong><p>{({ submitted: 'Bid terkonfirmasi', blocked: 'Pengiriman dihentikan', uncertain: 'Hasil belum pasti — perlu rekonsiliasi di Freelancer' })[data.lastResult.outcome]}</p><p>HTTP submit {data.lastResult.statusCode ?? 'Tidak diketahui'} · ID bid {data.lastResult.bidId ?? 'Belum terkonfirmasi'}</p><small>{date(data.lastResult.at)}</small></div>}
    </>}
  </section>;
}
