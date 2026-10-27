import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, jsonRequest, type Inbox, type MessageAnalysis, type MessageSnapshotView } from '../api/api.js';
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

const CLASSIFICATION_LABEL: Record<NonNullable<MessageAnalysis['classification']>, string> = {
  feature: 'Permintaan fitur',
  bug: 'Laporan masalah',
  question: 'Pertanyaan',
  scope_change: 'Perubahan lingkup',
  unknown: 'Belum dapat diklasifikasi',
};

/** Server treats a `running` row older than this as abandoned, so the UI may offer a retry then. */
const STALE_RUN_MS = 10 * 60_000;

/**
 * Why the server would refuse to analyse this message. Mirrors the server rules so the
 * UI never offers a button that can only produce a blocked row.
 */
function snapshotProblem(snapshot: MessageSnapshotView, available: boolean): string | null {
  if (!available) return 'Hermes belum aktif, jadi analisis pesan tidak tersedia.';
  if (snapshot.completeness !== 'complete') {
    return snapshot.completenessReason ?? 'Kelengkapan teks pesan tidak dapat dipastikan, jadi analisis tidak dijalankan.';
  }
  if (snapshot.linkStatus === 'ambiguous') return 'Pesan cocok dengan lebih dari satu proyek aktif, jadi analisis dihentikan agar tidak salah konteks.';
  if (snapshot.linkStatus === 'unlinked') return 'Pesan belum tertaut ke satu proyek aktif, jadi analisis tidak dijalankan.';
  return null;
}

function staleRun(analysis: MessageAnalysis) {
  return analysis.status === 'running' && Date.now() - Date.parse(analysis.startedAt) >= STALE_RUN_MS;
}

type MessageIntelProps = {
  snapshot: MessageSnapshotView | null;
  available: boolean;
  busy: boolean;
  busyVersion: string | null;
  onAnalyze: (sourceVersion: string) => void;
};

function MessageIntel({ snapshot, available, busy, busyVersion, onAnalyze }: MessageIntelProps) {
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle');
  if (!snapshot) {
    return <div className="message-intel">
      <p className="message-intel-note">Belum ada salinan lengkap pesan ini. Analisis hanya memakai teks lengkap dari sinkronisasi setelah fitur ini aktif, bukan cuplikan 200 karakter. Tunggu pemeriksaan pesan berikutnya (±1 menit) lalu perbarui.</p>
    </div>;
  }
  const problem = snapshotProblem(snapshot, available);
  const analysis = snapshot.analysis;
  const running = analysis?.status === 'running' || analysis?.status === 'queued';
  const pending = busy && busyVersion === snapshot.sourceVersion;
  const canAnalyze = problem === null && (!analysis || analysis.status === 'blocked' || staleRun(analysis));

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('ok');
    } catch {
      setCopyState('error');
    }
  };

  return <div className="message-intel">
    <div className="message-intel-head">
      <strong className="message-intel-status" data-tone={analysis?.status === 'succeeded' ? 'ok' : analysis?.status === 'blocked' ? 'warn' : undefined}>
        {analysis ? ({ queued: 'Menunggu antrean analisis', running: 'Sedang dianalisis', succeeded: 'Analisis selesai', blocked: 'Analisis diblokir' })[analysis.status] : 'Belum dianalisis'}
      </strong>
      {snapshot.completeness !== 'complete' && <span className="state-label">Teks tidak lengkap</span>}
      {snapshot.linkStatus !== 'linked' && <span className="state-label">{snapshot.linkStatus === 'ambiguous' ? 'Proyek ambigu' : 'Belum tertaut proyek'}</span>}
      {snapshot.linkStatus === 'linked' && <span className="item-sub">Tertaut ke proyek aktif</span>}
    </div>

    {running && <p className="message-intel-note" role="status">Analisis berjalan sejak {formatDate(analysis.startedAt)}; biasanya 40–95 detik. Halaman ini akan memperbarui sendiri.</p>}

    {analysis?.status === 'succeeded' ? <>
      <p className="message-intel-note"><strong>{analysis.classification ? CLASSIFICATION_LABEL[analysis.classification] : 'Tanpa klasifikasi'}</strong>{analysis.summary ? ` — ${analysis.summary}` : ''}</p>
      {analysis.requirements.length > 0 && <div>
        <p className="message-intel-note">Kebutuhan yang disebut klien:</p>
        <ul className="message-intel-list">
          {analysis.requirements.map((requirement) => <li key={requirement.id}>
            {requirement.text}
            <q className="message-intel-quote">{requirement.quote}</q>
          </li>)}
        </ul>
      </div>}
      {analysis.questions.length > 0 && <div>
        <p className="message-intel-note">Pertanyaan yang perlu dijawab:</p>
        <ul className="message-intel-list">{analysis.questions.map((question) => <li key={question}>{question}</li>)}</ul>
      </div>}
      {analysis.replyDraft && <div>
        <p className="message-intel-note"><strong>Draf balasan — belum dikirim dan belum disetujui.</strong> Periksa isinya sebelum mengirim lewat Freelancer.</p>
        <pre className="message-intel-draft">{analysis.replyDraft}</pre>
        <div className="message-intel-actions">
          <button type="button" className="button button-secondary" onClick={() => void copy(analysis.replyDraft ?? '')}>Salin draf</button>
          {copyState === 'ok' && <span className="message-intel-note" role="status">Draf disalin.</span>}
          {copyState === 'error' && <span className="message-intel-note" role="status">Tidak dapat menyalin otomatis; pilih teks draf secara manual.</span>}
        </div>
      </div>}
    </> : <>
      {analysis?.status === 'blocked' && <p className="message-intel-note">{analysis.error ?? 'Analisis diblokir tanpa alasan tersimpan.'}</p>}
      {problem && analysis?.status !== 'blocked' && <p className="message-intel-note">{problem}</p>}
      {canAnalyze && <>
        <p className="message-intel-note">Hermes menulis ringkasan dan draf balasan dari teks pesan ini. Tidak ada balasan yang dikirim otomatis; biaya dan waktu model dipakai hanya saat Anda menekan tombol.</p>
        <div className="message-intel-actions">
          <button type="button" className="button button-secondary" disabled={busy || running} onClick={() => onAnalyze(snapshot.sourceVersion)}>
            {pending ? 'Menganalisis… (±40–95 detik)' : analysis?.status === 'blocked' ? 'Coba analisis ulang' : 'Analisis pesan'}
          </button>
          {analysis && staleRun(analysis) && <span className="message-intel-note">Analisis sebelumnya tampak berhenti; jalankan ulang bila perlu.</span>}
        </div>
      </>}
      {!canAnalyze && !problem && running && <p className="message-intel-note">Tunggu hingga analisis selesai sebelum menjalankannya lagi.</p>}
    </>}
  </div>;
}

export default function InboxPage() {
  const queryClient = useQueryClient();
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => api<Inbox>('/inbox'), refetchInterval: 10_000 });
  const analyze = useMutation({
    mutationFn: (body: { sourceVersion?: string; limit?: number }) => api<{ analyses: MessageAnalysis[]; counts: Inbox['messageIntel']['counts'] }>('/inbox/analyze', jsonRequest('POST', body)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['activity'] }),
      ]);
    },
  });

  if (inbox.isPending) return <LoadingPanel label="Memuat kotak masuk..." />;
  if (inbox.isError) return <ErrorNotice message="Kotak masuk belum dapat dimuat." onRetry={() => inbox.refetch()} />;
  const { sync, needsReply, followUps, messageIntel } = inbox.data;
  const state = syncState(sync);
  const synced = state === 'synced';
  const syncMessage = syncLine(state, sync);
  const empty = emptyReply(state);
  const busy = analyze.isPending;
  const busyVersion = busy ? analyze.variables?.sourceVersion ?? null : null;
  const analyzeError = analyze.isError ? (analyze.error instanceof Error ? analyze.error.message : 'Analisis pesan gagal.') : null;
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

    <div className="card-toolbar message-intel-summary">
      <p className="form-help">
        {messageIntel.available
          ? `Analisis pesan: ${messageIntel.counts.snapshots} pesan klien tersimpan · ${messageIntel.counts.analyzable} siap dianalisis · ${messageIntel.counts.succeeded} selesai · ${messageIntel.counts.blocked} diblokir.`
          : `Analisis pesan tidak tersedia: ${messageIntel.reason ?? 'Hermes belum aktif'}. Pesan tetap disimpan tanpa dianalisis.`}
      </p>
      {messageIntel.available && messageIntel.counts.analyzable > 0 && <button type="button" className="button button-secondary" disabled={busy} onClick={() => analyze.mutate({ limit: 1 })}>{busy && busyVersion === null ? 'Menganalisis… (±40–95 detik)' : `Analisis pesan tertunda (${messageIntel.counts.analyzable})`}</button>}
    </div>
    {analyzeError && <ErrorNotice message={analyzeError} onRetry={() => analyze.mutate(analyze.variables ?? { limit: 1 })} />}

    <section className="activity-preview card-section" aria-labelledby="needs-reply-title">
      <div className="section-heading">
        <div><p className="eyebrow">Pesan terakhir dari akun lain</p><h2 id="needs-reply-title">Menunggu balasan ({synced ? needsReply.length : 'Tidak diketahui'})</h2></div>
        <a className="text-link" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }} href="https://www.freelancer.com/messages" target="_blank" rel="noreferrer">Buka Freelancer</a>
      </div>
      {needsReply.length ? <ul className="deadlines-list">{needsReply.map((thread) => <li className="deadline-item" key={thread.threadId}>
        <div><strong>{thread.projectTitle ?? 'Percakapan tanpa proyek tersinkron'}</strong><div className="item-sub">{thread.preview}</div></div>
        <div className="item-aside"><strong className={thread.waitingHours >= 24 ? 'is-late' : ''}>{waitingLabel(thread.waitingHours)}</strong><div className="item-sub">{formatDate(thread.lastMessageAt)}</div></div>
        <MessageIntel snapshot={thread.snapshot} available={messageIntel.available} busy={busy} busyVersion={busyVersion} onAnalyze={(sourceVersion) => analyze.mutate({ sourceVersion })} />
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
