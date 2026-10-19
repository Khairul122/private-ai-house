import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, jsonRequest, type AuditEvent, type Autopilot, type Capabilities } from '../api/api.js';
import BrowserBiddingCard from '../components/BrowserBiddingCard.js';
import { StateLabel, ErrorNotice, LoadingPanel, PageIntro, OperationStatus } from '../components/ui.js';
import { formatDate } from '../components/format.js';

type IntegrationCheck = { id: string; label: string; ok: boolean; status: number | null; detail: string; latencyMs: number; checkedAt: string };
const operationLabels: Record<string, string> = { read_profile: 'Baca profil', search_projects: 'Cari proyek', read_projects: 'Baca proyek', read_portfolio: 'Baca portofolio', read_messages: 'Baca pesan', submit_bid: 'Kirim bid', edit_profile: 'Ubah profil', send_message: 'Kirim pesan' };

function HealthCard() {
  const checkAll = useMutation({ mutationFn: () => api<IntegrationCheck[]>('/integrations/check', jsonRequest('POST')) });
  const bids = useQuery({ queryKey: ['activity', 'bids'], queryFn: () => api<AuditEvent[]>('/activity?limit=20&type=marketplace.production.submit_bid'), refetchInterval: 30_000 });
  const recentBids = (bids.isError ? [] : bids.data ?? []).filter((event) => event.type === 'marketplace.production.submit_bid' && event.status !== 'allowed').slice(0, 6);
  const failed = recentBids.filter((event) => event.status === 'failed').length;
  return <section className="form-card health-card" aria-labelledby="health-title">
    <div className="section-heading">
      <div><p className="eyebrow">Kesehatan integrasi</p><h2 id="health-title">Periksa koneksi layanan</h2></div>
      <button type="button" className="button button-primary" disabled={checkAll.isPending} onClick={() => checkAll.mutate()}>{checkAll.isPending ? 'Memeriksa...' : 'Periksa semua integrasi'}</button>
    </div>
    {checkAll.isError && <ErrorNotice message={checkAll.error instanceof Error ? checkAll.error.message : 'Pemeriksaan gagal.'} onRetry={() => checkAll.mutate()} />}
    {!checkAll.isError && checkAll.data
      ? <ul className="health-list">{checkAll.data.map((item) => <li className="health-row" key={item.id}>
        <span className={'health-pill ' + (item.ok ? 'is-ok' : 'is-bad')}>{item.ok ? 'Berhasil' : 'Bermasalah'}</span>
        <div className="health-main"><strong>{item.label}</strong><p>{item.detail}</p></div>
        <div className="health-meta"><b>{item.status === null ? 'Tanpa HTTP' : 'HTTP ' + item.status}</b><small>{item.latencyMs} ms · {formatDate(item.checkedAt)}</small></div>
      </li>)}</ul>
      : <p className="form-help">Tekan tombol untuk memeriksa Supabase, Freelancer, GitHub, LinkedIn, Hermes, dan autopilot. Hanya permintaan baca; tidak ada bid atau pesan yang dikirim.</p>}
    <details className="card-disclosure"><summary>Riwayat pengiriman bid terakhir</summary>
    <h3 className="health-subtitle">Hasil pengiriman bid terakhir{recentBids.length ? ' (' + failed + ' gagal dari ' + recentBids.length + ')' : ''}</h3>
    {bids.isPending ? <p role="status">Memuat riwayat bid…</p> : bids.isError ? <p className="form-help">Riwayat bid belum dapat dimuat.</p>
      : recentBids.length === 0 ? <p className="form-help">Belum ada percobaan kirim bid yang tercatat.</p>
        : <ul className="health-list">{recentBids.map((event) => {
          const code = event.reason.match(/HTTP (\d{3})/)?.[1];
          return <li className="health-row" key={event.id}>
            <span className={'health-pill ' + (event.status === 'recorded' ? 'is-ok' : 'is-bad')}>{event.status === 'recorded' ? 'Terkirim' : 'Gagal'}</span>
            <div className="health-main"><strong>{event.resourceId}</strong><p>{event.reason.replace(/ Isi proposal tidak disimpan.*$/, '')}</p></div>
            <div className="health-meta"><b>{code ? 'HTTP ' + code : 'Tanpa HTTP'}</b><small>{formatDate(event.createdAt)}</small></div>
          </li>;
        })}</ul>}
    </details>
  </section>;
}

export default function CapabilitiesPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState(() => {
    const oauthResult = new URLSearchParams(window.location.search).get('linkedin');
    return oauthResult === 'connected'
      ? 'LinkedIn terhubung. Profil ringan berhasil diverifikasi.'
      : oauthResult === 'error' ? 'LinkedIn belum terhubung. Periksa konfigurasi aplikasi dan coba lagi.' : '';
  });
  const [noticeError, setNoticeError] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('linkedin')) {
      url.searchParams.delete('linkedin');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }, []);
  const query = useQuery({ queryKey: ['capabilities'], queryFn: () => api<Capabilities>('/capabilities'), refetchInterval: 30_000 });
  const autopilot = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 10_000 });
  const verifyFreelancer = useMutation({
    mutationFn: () => api<{ message: string }>('/freelancer/verify', jsonRequest('POST')),
    onSuccess: async (result) => { setNoticeError(false); setNotice(result.message); await queryClient.invalidateQueries({ queryKey: ['capabilities'] }); },
    onError: (error: Error) => { setNoticeError(true); setNotice(error.message); },
  });
  const connectLinkedIn = useMutation({
    mutationFn: () => api<{ authorizationUrl: string }>('/linkedin/connect', jsonRequest('POST')),
    onSuccess: (result) => {
      const destination = new URL(result.authorizationUrl);
      if (destination.origin !== 'https://www.linkedin.com') {
        setNoticeError(true);
        setNotice('Alamat otorisasi LinkedIn ditolak karena bukan domain resmi.');
        return;
      }
      window.location.assign(destination.toString());
    },
    onError: (error: Error) => { setNoticeError(true); setNotice(error.message); },
  });
  const disconnectLinkedIn = useMutation({
    mutationFn: () => api<{ disconnected: boolean }>('/linkedin/disconnect', jsonRequest('POST')),
    onSuccess: async () => { setNoticeError(false); setNotice('Token LinkedIn dihapus dari perangkat ini. Cabut izin aplikasi dari pengaturan LinkedIn bila akses juga perlu dicabut di sana.'); await queryClient.invalidateQueries({ queryKey: ['capabilities'] }); },
    onError: (error: Error) => { setNoticeError(true); setNotice(error.message); },
  });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError) return <ErrorNotice message="Status integrasi belum dapat dimuat." onRetry={() => query.refetch()} />;
  const status = autopilot.isError ? undefined : autopilot.data;
  return <>
    <PageIntro eyebrow="Integrasi" title="Koneksi dan operasi" description="Lihat aktivitas autopilot, hambatan pengiriman, dan akses setiap layanan." />
    {notice && <div className={'notice ' + (noticeError ? 'notice-error' : 'notice-success')} role={noticeError ? 'alert' : 'status'}>{notice}</div>}
    <OperationStatus data={status} unavailable={autopilot.isError} />
    <HealthCard />
    <BrowserBiddingCard />
    <div className="capability-grid">
      <section className="form-card">
        <div className="section-heading"><div><p className="eyebrow">Freelancer.com</p><h2>Akses Freelancer</h2></div><StateLabel state={query.data.freelancerCredentials.verificationStatus} /></div>
        <details className="card-disclosure"><summary>Rincian kemampuan API dan bukti pemeriksaan</summary>
        {query.data.marketplace.map((item) => <div className="capability-row" key={item.operation}><div><strong>{operationLabels[item.operation] ?? item.operation.replaceAll('_', ' ')}</strong><p>{item.evidence}</p></div><div className="capability-status">{item.sandboxVerification ? <span title={'Diperiksa ' + formatDate(item.sandboxVerification.checkedAt)} className={'sandbox-http-status ' + (item.sandboxVerification.statusCode === 200 ? 'sandbox-http-ok' : '')}>{item.sandboxVerification.statusCode === null ? 'Hasil tidak diketahui · Sandbox' : 'HTTP ' + item.sandboxVerification.statusCode + ' · Sandbox'}</span> : <StateLabel state={item.status} />}</div></div>)}
        <div className="production-capability-status">
          {query.data.marketplace.filter((item) => ['submit_bid', 'edit_profile', 'send_message'].includes(item.operation)).map((item) => <div key={item.operation}><strong>{operationLabels[item.operation] ?? item.operation.replaceAll('_', ' ')}</strong><StateLabel state={item.status} /><span>{item.productionVerification ? item.productionVerification.statusCode === null ? 'Hasil tidak diketahui · Production' : 'HTTP ' + item.productionVerification.statusCode + ' · Production' : 'Belum ada hasil live production'}</span></div>)}
        </div>
        </details>
        <p className="provider-limit">Token Freelancer {query.data.freelancerCredentials.accessTokenConfigured ? 'tersimpan pada server lokal dan tidak dikirim ke browser' : 'belum diatur'}. Pemeriksaan ini hanya membaca profil, proyek, portofolio, dan pesan.</p>
        <button type="button" className="button button-secondary" disabled={!query.data.freelancerCredentials.accessTokenConfigured || verifyFreelancer.isPending} onClick={() => verifyFreelancer.mutate()}>{verifyFreelancer.isPending ? 'Memeriksa koneksi...' : 'Periksa akses baca'}</button>
      </section>
      <section className="form-card">
        <div className="section-heading"><div><p className="eyebrow">Sumber lain</p><h2>Pengetahuan dan penulisan draf</h2></div></div>
        <div className="capability-row"><div><strong>GitHub</strong><p>{query.data.github.scope}; mode read-only. Repositori publik dapat dibaca tanpa token, privat memerlukan token server.</p></div><StateLabel state={query.data.github.verificationStatus} /></div>
        <div className="capability-row"><div><strong>LinkedIn</strong><p>{query.data.linkedin.reason} Kredensial aplikasi {query.data.linkedin.clientConfigured ? 'sudah diatur untuk server ini' : 'belum diatur'}; {query.data.linkedin.authorized ? 'izin anggota tersimpan' : query.data.linkedin.verificationStatus === 'expired' ? 'token sudah kedaluwarsa' : 'consent anggota belum terverifikasi'}{query.data.linkedin.authorized && query.data.linkedin.accessTokenExpiresAt ? '; token berlaku hingga ' + formatDate(query.data.linkedin.accessTokenExpiresAt) : ''}.</p>{query.data.linkedin.redirectUri && <p>URL callback yang harus terdaftar di LinkedIn Developer Portal: <code>{query.data.linkedin.redirectUri}</code></p>}</div><StateLabel state={query.data.linkedin.verificationStatus} /></div>
        {query.data.linkedin.authorized
          ? <button type="button" className="button button-secondary" disabled={disconnectLinkedIn.isPending} onClick={() => disconnectLinkedIn.mutate()}>{disconnectLinkedIn.isPending ? 'Menghapus...' : 'Hapus token LinkedIn lokal'}</button>
          : <button type="button" className="button button-secondary" disabled={!query.data.linkedin.clientConfigured || connectLinkedIn.isPending} onClick={() => connectLinkedIn.mutate()}>{connectLinkedIn.isPending ? 'Menyiapkan OAuth...' : 'Hubungkan LinkedIn'}</button>}
        <div className="capability-row"><div><strong>Hermes Agent</strong><p>{query.data.hermes.reason}</p></div><StateLabel state={query.data.hermes.active ? 'active' : 'draft'} /></div>
      </section>
    </div>
  </>;
}
