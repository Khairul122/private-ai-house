import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type Inbox } from '../api/api.js';
import { formatDate } from '../components/format.js';
import { EmptyState, ErrorNotice, LoadingPanel, PageIntro, Metric } from '../components/ui.js';

function waitingLabel(hours: number) {
  return hours >= 48 ? `menunggu ${Math.floor(hours / 24)} hari` : `menunggu ${hours} jam`;
}

type SyncState = 'missing' | 'never' | 'failed' | 'synced';

function syncState(sync: Inbox['sync']): SyncState {
  if (!sync) return 'missing';
  if (sync.ok === false) return 'failed';
  return sync.lastRunAt ? 'synced' : 'never';
}

function syncLine(state: SyncState, sync: Inbox['sync']) {
  if (state === 'missing') return 'Sinkronisasi pesan tidak tersedia di server ini.';
  if (state === 'failed') return `Sinkronisasi pesan gagal: ${sync?.error ?? 'alasan tidak diketahui'}. Menampilkan data terakhir yang tersimpan.`;
  if (state === 'never') return 'Pesan belum pernah disinkronkan, jadi kotak masuk kosong belum tentu berarti tidak ada pesan.';
  return `Terakhir disinkronkan ${formatDate(sync?.lastRunAt ?? '')}.`;
}

function emptyReply(state: SyncState) {
  if (state === 'missing') return { title: 'Sinkronisasi pesan tidak berjalan', description: 'Server ini tidak menyediakan pembacaan pesan. Balas langsung di Freelancer.' };
  if (state === 'failed') return { title: 'Tidak ada pesan tersimpan', description: 'Sinkronisasi terakhir gagal, jadi kotak masuk belum tentu kosong. Periksa integrasi lalu muat ulang.' };
  if (state === 'never') return { title: 'Pesan belum pernah disinkronkan', description: 'Kotak masuk kosong karena belum ada pembacaan yang berhasil. Periksa token Freelancer lalu muat ulang.' };
  return { title: 'Tidak ada pesan yang menunggu balasan', description: 'Semua pesan terakhir sudah dibalas atau tidak ada pesan baru sejak sinkronisasi terakhir.' };
}

export default function InboxPage() {
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => api<Inbox>('/inbox'), refetchInterval: 10_000 });
  if (inbox.isPending) return <LoadingPanel label="Memuat kotak masuk..." />;
  if (inbox.isError) return <ErrorNotice message="Kotak masuk belum dapat dimuat." onRetry={() => inbox.refetch()} />;
  const { sync, needsReply, followUps } = inbox.data;
  const state = syncState(sync);
  const synced = state === 'synced';
  const syncMessage = syncLine(state, sync);
  const empty = emptyReply(state);
  return <>
    <PageIntro eyebrow="Freelancer" title="Kotak masuk Freelancer" description="Fokus utama: pesan yang perlu dibalas. Server memeriksa pesan setiap menit selama aktif." action={<a className="button button-primary" href="https://www.freelancer.com/messages" target="_blank" rel="noreferrer">Buka pesan Freelancer</a>} />
    <section className="card-summary-grid" aria-label="Ringkasan kotak masuk">
      <Metric label="Menunggu balasan" value={synced ? needsReply.length : 'Tidak diketahui'} note={synced ? 'Pesan terakhir berasal dari akun lain' : 'Bergantung pada sinkronisasi pesan'} tone="primary" />
      <Metric label="Bid perlu ditinjau" value={followUps.length} note="Minimal 3 hari tanpa percakapan" />
    </section>
    <div className="card-toolbar">
      <p className="form-help" role="status" aria-live="polite">Data layar diperbarui {formatDate(new Date(inbox.dataUpdatedAt).toISOString())}{inbox.isFetching ? '. Memperbarui...' : '.'}</p>
      <button type="button" className="button button-secondary" disabled={inbox.isFetching} onClick={() => void inbox.refetch()}>{inbox.isFetching ? 'Memperbarui...' : 'Perbarui pesan'}</button>
    </div>
    {state === 'failed' ? <ErrorNotice message={syncMessage} onRetry={() => void inbox.refetch()} /> : <p className="form-help">{syncMessage}</p>}

    <section className="activity-preview card-section" aria-labelledby="needs-reply-title">
      <div className="section-heading">
        <div><p className="eyebrow">Pesan terakhir dari akun lain</p><h2 id="needs-reply-title">Menunggu balasan ({synced ? needsReply.length : 'Tidak diketahui'})</h2></div>
        <a className="text-link" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }} href="https://www.freelancer.com/messages" target="_blank" rel="noreferrer">Buka Freelancer</a>
      </div>
      {needsReply.length ? <ul className="deadlines-list">{needsReply.map((thread) => <li className="deadline-item" key={thread.threadId}>
        <div><strong>{thread.projectTitle ?? 'Percakapan tanpa proyek tersinkron'}</strong><div className="item-sub">{thread.preview}</div></div>
        <div className="item-aside"><strong className={thread.waitingHours >= 24 ? 'is-late' : ''}>{waitingLabel(thread.waitingHours)}</strong><div className="item-sub">{formatDate(thread.lastMessageAt)}</div></div>
      </li>)}</ul>
        : <EmptyState title={empty.title} description={empty.description} action={<>
          <a className="button button-secondary" href="https://www.freelancer.com/messages" target="_blank" rel="noreferrer">Buka pesan Freelancer</a>
          {!synced && <><button type="button" className="button button-secondary" onClick={() => void inbox.refetch()}>Muat ulang</button><Link className="button button-secondary" to="/capabilities">Periksa integrasi</Link></>}
        </>} />}
    </section>

    <section className="activity-preview card-section" aria-labelledby="follow-up-title">
      <div className="section-heading"><div><p className="eyebrow">Bid tanpa percakapan klien ≥ 3 hari</p><h2 id="follow-up-title">Tinjau tindak lanjut ({followUps.length})</h2></div></div>
      {followUps.length ? <ul className="deadlines-list">{followUps.map((bid) => <li className="deadline-item" key={bid.projectId}>
        <div><Link to={`/opportunities?project=${encodeURIComponent(bid.projectId)}`} className="item-link">{bid.title}</Link><div className="item-sub">Bid dikirim {formatDate(bid.submittedAt)}</div></div>
        <div className="item-aside"><strong>{bid.daysSinceBid} hari</strong><div className="item-sub">sejak bid</div></div>
      </li>)}</ul>
        : <EmptyState title="Belum ada bid untuk ditindaklanjuti" description="Daftar terisi bila bid berjalan minimal 3 hari dan klien belum memulai percakapan." action={<Link className="button button-secondary" to="/pipeline">Buka pipeline</Link>} />}
    </section>
  </>;
}
