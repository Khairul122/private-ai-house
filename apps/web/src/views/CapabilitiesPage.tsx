import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, jsonRequest, type AuditEvent, type Autopilot, type Capabilities } from '../api/api.js';
import BrowserBiddingCard from '../components/BrowserBiddingCard.js';
import { EmptyState, StateLabel, ErrorNotice, LoadingPanel, PageIntro, OperationStatus } from '../components/ui.js';
import { formatDate } from '../components/format.js';

type IntegrationCheck = { id: string; label: string; ok: boolean; status: number | null; detail: string; latencyMs: number; checkedAt: string };
const operationLabels: Record<string, string> = { read_profile: 'Baca profil', search_projects: 'Cari proyek', read_projects: 'Baca proyek', read_portfolio: 'Baca portofolio', read_messages: 'Baca pesan', submit_bid: 'Kirim bid', edit_profile: 'Ubah profil', send_message: 'Kirim pesan' };
const operationName = (operation: string) => operationLabels[operation] ?? operation.replaceAll('_', ' ');
const storedLabel = 'Tersimpan, belum diuji';

function HealthCard() {
  const checkAll = useMutation({ mutationFn: () => api<IntegrationCheck[]>('/integrations/check', jsonRequest('POST')) });
  const bids = useQuery({ queryKey: ['activity', 'bids'], queryFn: () => api<AuditEvent[]>('/activity?limit=20&type=marketplace.production.submit_bid'), refetchInterval: 30_000 });
  const recentBids = (bids.isError ? [] : bids.data ?? []).filter((event) => event.type === 'marketplace.production.submit_bid' && event.status !== 'allowed').slice(0, 6);
  const failed = recentBids.filter((event) => event.status === 'failed').length;
  const results = checkAll.data ?? [];
  const problems = results.filter((item) => !item.ok);
  const healthy = results.filter((item) => item.ok);
  return <section className="form-card health-card" aria-labelledby="health-title">
    <div className="section-heading">
      <div><p className="eyebrow">Hasil pemeriksaan</p><h2 id="health-title">Apa yang perlu diperbaiki</h2></div>
      <button type="button" className="button button-primary" disabled={checkAll.isPending} onClick={() => checkAll.mutate()}>{checkAll.isPending ? 'Memeriksa...' : results.length ? 'Periksa ulang' : 'Periksa semua integrasi'}</button>
    </div>
    <p className="form-help">Pemeriksaan ini hanya mengirim permintaan baca. Tidak ada bid atau pesan yang dikirim. Status di bawah adalah hasil tes terakhir, bukan klaim koneksi.</p>
    {checkAll.isError && <ErrorNotice message={checkAll.error instanceof Error ? checkAll.error.message : 'Pemeriksaan gagal.'} onRetry={() => checkAll.mutate()} />}
    {!checkAll.isError && (checkAll.isPending && !results.length
      ? <p role="status">Memeriksa Supabase, Freelancer, GitHub, LinkedIn, Hermes, dan autopilot...</p>
      : !results.length
        ? <EmptyState title="Belum ada hasil pemeriksaan" description="Status integrasi di bawah berasal dari konfigurasi tersimpan. Tekan periksa untuk menguji permintaan baca yang sebenarnya." action={<button type="button" className="button button-secondary" onClick={() => checkAll.mutate()}>Jalankan pemeriksaan</button>} />
        : <>
          <p role="status" aria-live="polite"><strong>{problems.length}</strong> bermasalah, <strong>{healthy.length}</strong> berhasil. Diperiksa {formatDate(results[0]?.checkedAt ?? '')}.</p>
          {problems.length > 0 && <ul className="health-list">{problems.map((item) => <li className="health-row" key={item.id}>
            <span className="health-pill is-bad">Bermasalah</span>
            <div className="health-main"><strong>{item.label}</strong><p>{item.detail}</p></div>
            <div className="health-meta"><b>{item.status === null ? 'Tanpa HTTP' : 'HTTP ' + item.status}</b><small>{item.latencyMs} ms · {formatDate(item.checkedAt)}</small></div>
          </li>)}</ul>}
          {healthy.length > 0 && <details className="card-disclosure"><summary>Pemeriksaan yang berhasil ({healthy.length})</summary>
            <ul className="health-list">{healthy.map((item) => <li className="health-row" key={item.id}>
              <span className="health-pill is-ok">Berhasil</span>
              <div className="health-main"><strong>{item.label}</strong><p>{item.detail}</p></div>
              <div className="health-meta"><b>{item.status === null ? 'Tanpa HTTP' : 'HTTP ' + item.status}</b><small>{item.latencyMs} ms · {formatDate(item.checkedAt)}</small></div>
            </li>)}</ul>
          </details>}
        </>)}
    <details className="card-disclosure"><summary>Riwayat pengiriman bid terakhir</summary>
    <h3 className="health-subtitle">Hasil pengiriman bid terakhir{recentBids.length ? ' (' + failed + ' gagal dari ' + recentBids.length + ')' : ''}</h3>
    {bids.isPending ? <p role="status">Memuat riwayat bid...</p> : bids.isError ? <ErrorNotice message="Riwayat bid belum dapat dimuat." onRetry={() => void bids.refetch()} />
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
  const data = query.data;
  const reads = [['profil', data.freelancerCredentials.readProfile], ['proyek', data.freelancerCredentials.readProjects], ['portofolio', data.freelancerCredentials.readPortfolio], ['pesan', data.freelancerCredentials.readMessages]] as const;
  return <>
    <PageIntro eyebrow="Integrasi" title="Koneksi dan operasi" description="Fokus utama: temukan sumber yang bermasalah. Hasil tes API, status browser, dan konfigurasi Hermes dibedakan di bawah." />
    {notice && <div className={'notice ' + (noticeError ? 'notice-error' : 'notice-success')} role={noticeError ? 'alert' : 'status'}>{notice}</div>}
    <OperationStatus data={status} unavailable={autopilot.isError} />
    <HealthCard />
    <BrowserBiddingCard />
    <div className="capability-grid">
      <section className="form-card" aria-labelledby="freelancer-api-title">
        <div className="section-heading"><div><p className="eyebrow">API Freelancer.com</p><h2 id="freelancer-api-title">Akses API Freelancer</h2></div><StateLabel state={data.freelancerCredentials.verificationStatus} /></div>
        <p className="form-help">Status di kanan adalah hasil verifikasi baca terakhir. Rincian operasi di bawah adalah kemampuan yang tercatat, bukan tes baru.</p>
        <dl className="card-facts">{reads.map(([label, ok]) => <div key={label}><dt>{label[0]!.toUpperCase() + label.slice(1)}</dt><dd>{ok ? 'Terbaca pada verifikasi terakhir' : 'Belum terverifikasi'}</dd></div>)}</dl>
        <details className="card-disclosure"><summary>Rincian kemampuan API dan bukti pemeriksaan</summary>
        {data.marketplace.map((item) => <div className="capability-row" key={item.operation}><div><strong>{operationName(item.operation)}</strong><p>{item.evidence}</p></div><div className="capability-status">{item.sandboxVerification ? <span title={'Diperiksa ' + formatDate(item.sandboxVerification.checkedAt)} className={'sandbox-http-status ' + (item.sandboxVerification.statusCode === 200 ? 'sandbox-http-ok' : '')}>{item.sandboxVerification.statusCode === null ? 'Hasil tidak diketahui · Sandbox' : 'HTTP ' + item.sandboxVerification.statusCode + ' · Sandbox'}</span> : <StateLabel state={item.status} />}</div></div>)}
        <h3 className="health-subtitle">Hasil production terakhir</h3>
        <div className="production-capability-status">
          {data.marketplace.filter((item) => ['submit_bid', 'edit_profile', 'send_message'].includes(item.operation)).map((item) => <div key={item.operation}><strong>{operationName(item.operation)}</strong><StateLabel state={item.status} /><span>{item.productionVerification ? item.productionVerification.statusCode === null ? 'Hasil tidak diketahui · Production' : 'HTTP ' + item.productionVerification.statusCode + ' · Production' : 'Belum ada hasil live production'}</span></div>)}
        </div>
        </details>
        <p className="provider-limit">Token Freelancer {data.freelancerCredentials.accessTokenConfigured ? 'tersimpan pada server lokal dan tidak dikirim ke browser' : 'belum diatur'}. Pemeriksaan ini hanya membaca profil, proyek, portofolio, dan pesan.</p>
        {verifyFreelancer.isError && <ErrorNotice message={verifyFreelancer.error.message} onRetry={() => verifyFreelancer.mutate()} />}
        <button type="button" className="button button-secondary" disabled={!data.freelancerCredentials.accessTokenConfigured || verifyFreelancer.isPending} onClick={() => verifyFreelancer.mutate()}>{verifyFreelancer.isPending ? 'Memeriksa koneksi...' : 'Periksa akses baca'}</button>
      </section>
      <section className="form-card" aria-labelledby="other-sources-title">
        <div className="section-heading"><div><p className="eyebrow">Sumber lain</p><h2 id="other-sources-title">Pengetahuan dan penulisan draf</h2></div></div>
        <p className="form-help">Status di sini berasal dari konfigurasi dan data tersimpan. Hanya pemeriksaan di kartu atas yang benar-benar menguji permintaan.</p>
        <div className="capability-row"><div><strong>GitHub</strong><p>{data.github.scope}; mode read-only. Repositori publik dapat dibaca tanpa token, privat memerlukan token server. Token {data.github.tokenConfigured ? 'terdaftar' : 'belum terdaftar'}.</p></div><span className="state-label">{data.github.verificationStatus === 'supported' ? 'Pernah disinkronkan' : 'Belum pernah disinkronkan'}</span></div>
        <div className="capability-row"><div><strong>LinkedIn</strong><p>{data.linkedin.reason} Kredensial aplikasi {data.linkedin.clientConfigured ? 'sudah diatur untuk server ini' : 'belum diatur'}; {data.linkedin.authorized ? 'token tersimpan dan belum kedaluwarsa, tetapi belum diuji langsung ke LinkedIn' : data.linkedin.verificationStatus === 'expired' ? 'token sudah kedaluwarsa' : 'consent anggota belum terverifikasi'}{data.linkedin.authorized && data.linkedin.accessTokenExpiresAt ? '; token berlaku hingga ' + formatDate(data.linkedin.accessTokenExpiresAt) : ''}.</p>{data.linkedin.redirectUri && <p>URL callback yang harus terdaftar di LinkedIn Developer Portal: <code>{data.linkedin.redirectUri}</code></p>}</div><span className="state-label">{data.linkedin.authorized ? storedLabel : data.linkedin.verificationStatus === 'expired' ? 'Kedaluwarsa' : 'Belum terhubung'}</span></div>
        {data.linkedin.authorized
          ? <button type="button" className="button button-secondary" disabled={disconnectLinkedIn.isPending} onClick={() => { if (window.confirm('Hapus token LinkedIn lokal? Anda perlu menghubungkan ulang untuk menggunakan integrasi.')) disconnectLinkedIn.mutate(); }}>{disconnectLinkedIn.isPending ? 'Menghapus...' : 'Hapus token LinkedIn lokal'}</button>
          : <button type="button" className="button button-secondary" disabled={!data.linkedin.clientConfigured || connectLinkedIn.isPending} onClick={() => connectLinkedIn.mutate()}>{connectLinkedIn.isPending ? 'Menyiapkan OAuth...' : 'Hubungkan LinkedIn'}</button>}
        <div className="capability-row"><div><strong>Hermes Agent</strong><p>{data.hermes.reason} Status ini menunjukkan konfigurasi penulisan draf, bukan hasil tes koneksi model.</p></div><span className="state-label">{data.hermes.active ? 'Aktif (konfigurasi)' : 'Belum aktif'}</span></div>
      </section>
    </div>
  </>;
}
