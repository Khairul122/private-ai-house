import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type Inbox } from '../api/api.js';
import { formatDate } from '../components/format.js';
import { ErrorNotice, LoadingPanel, PageIntro, Metric } from '../components/ui.js';

function waitingLabel(hours: number) {
  return hours >= 48 ? `menunggu ${Math.floor(hours / 24)} hari` : `menunggu ${hours} jam`;
}

function syncLine(sync: Inbox['sync'], label: string) {
  if (!sync) return `Sinkronisasi ${label} tidak tersedia di server ini.`;
  if (sync.ok === false) return `Sinkronisasi ${label} gagal: ${sync.error ?? 'tidak diketahui'}.`;
  return sync.lastRunAt ? `Terakhir disinkronkan ${formatDate(sync.lastRunAt)}.` : `${label[0]!.toUpperCase()}${label.slice(1)} belum pernah disinkronkan.`;
}

export default function InboxPage() {
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => api<Inbox>('/inbox'), refetchInterval: 10_000 });
  if (inbox.isPending) return <LoadingPanel label="Memuat kotak masuk..." />;
  if (inbox.isError) return <ErrorNotice message="Kotak masuk belum dapat dimuat." onRetry={() => inbox.refetch()} />;
  const { sync, needsReply, followUps } = inbox.data;
  return <>
    <PageIntro eyebrow="Klien" title="Kotak masuk klien" description="Balas pesan dan tindak lanjuti bid langsung di Freelancer. Pesan diperiksa server setiap menit." action={<a className="button button-primary" href="https://www.freelancer.com/messages" target="_blank" rel="noreferrer">Buka pesan Freelancer</a>} />
    <section className="card-summary-grid" aria-label="Ringkasan kotak masuk">
      <Metric label="Menunggu balasan" value={sync?.lastRunAt ? needsReply.length : 'Tidak diketahui'} note="Pesan terakhir berasal dari klien" />
      <Metric label="Bid perlu ditinjau" value={followUps.length} note="Minimal 3 hari tanpa percakapan" />
    </section>
    <div className="card-toolbar"><p className="form-help">Data layar diperbarui {formatDate(new Date(inbox.dataUpdatedAt).toISOString())}</p><button className="button button-secondary" type="button" disabled={inbox.isFetching} onClick={() => void inbox.refetch()}>{inbox.isFetching ? 'Memperbarui...' : 'Perbarui pesan'}</button></div>
    {sync?.ok === false ? <ErrorNotice message={syncLine(sync, 'pesan')} /> : <p className="form-help">{syncLine(sync, 'pesan')}</p>}
    <section className="activity-preview card-section" aria-labelledby="needs-reply-title">
      <div className="section-heading"><div><p className="eyebrow">Pesan terakhir dari klien</p><h2 id="needs-reply-title">Menunggu balasan ({needsReply.length})</h2></div><a className="text-link" href="https://www.freelancer.com/messages" target="_blank" rel="noreferrer">Buka Freelancer</a></div>
      {needsReply.length ? <ul className="deadlines-list">{needsReply.map((thread) => <li className="deadline-item" key={thread.threadId}>
        <div><strong>{thread.projectTitle ?? 'Percakapan tanpa proyek tersinkron'}</strong><div className="item-sub">{thread.preview}</div></div>
        <div className="item-aside"><strong className={thread.waitingHours >= 24 ? 'is-late' : ''}>{waitingLabel(thread.waitingHours)}</strong><div className="item-sub">{formatDate(thread.lastMessageAt)}</div></div>
      </li>)}</ul> : <p className="form-help">{sync?.lastRunAt ? 'Tidak ada pesan yang menunggu balasan.' : 'Belum ada data pesan.'}</p>}
    </section>
    <section className="activity-preview card-section" aria-labelledby="follow-up-title">
      <div className="section-heading"><div><p className="eyebrow">Bid tanpa percakapan klien ≥ 3 hari</p><h2 id="follow-up-title">Tinjau tindak lanjut ({followUps.length})</h2></div></div>
      {followUps.length ? <ul className="deadlines-list">{followUps.map((bid) => <li className="deadline-item" key={bid.projectId}>
        <div><Link to={`/opportunities?project=${encodeURIComponent(bid.projectId)}`} className="item-link">{bid.title}</Link><div className="item-sub">Bid dikirim {formatDate(bid.submittedAt)}</div></div>
        <div className="item-aside"><strong>{bid.daysSinceBid} hari</strong><div className="item-sub">sejak bid</div></div>
      </li>)}</ul> : <p className="form-help">Belum ada bid yang memenuhi kriteria tindak lanjut.</p>}
    </section>
  </>;
}
