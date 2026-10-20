import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type AuditEvent, type Autopilot, type ClientProject, type Inbox, type Opportunity, type Policy, type Work } from '../api/api.js';
import { StateLabel, EmptyState, ErrorNotice, LoadingPanel, PageIntro, Metric, ActivityRows, OperationStatus } from '../components/ui.js';
import { deadlineLabel, formatDate, formatMoney } from '../components/format.js';

const WORK_SOURCE: Record<ClientProject['source'], string> = { freelancer: 'Freelancer', direct: 'Klien langsung', linkedin: 'LinkedIn', projects_co_id: 'projects.co.id', other: 'Lainnya' };

export default function OverviewPage() {
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => api<{
    counts: { openProjects: number; drafts: number; submittedBids: number; knowledgeSources: number };
    policy: { state: Policy['state']; version: number; simulationOnly: boolean }; profileComplete: boolean;
    activity: AuditEvent[]; externalWrites: boolean;
  }>('/dashboard'), refetchInterval: 10_000 });
  const projects = useQuery({ queryKey: ['projects', 'overview'], queryFn: () => api<Opportunity[]>('/projects'), refetchInterval: 10_000 });
  const operation = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 10_000 });
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => api<Inbox>('/inbox'), refetchInterval: 10_000 });
  const work = useQuery({ queryKey: ['work'], queryFn: () => api<Work>('/work'), refetchInterval: 10_000 });
  const data = query.isError ? undefined : query.data;
  const opportunities = projects.isError ? undefined : projects.data;
  const inboxData = inbox.isError ? undefined : inbox.data;
  const workData = work.isError ? undefined : work.data;
  const messagesKnown = Boolean(inboxData?.sync?.ok === true && inboxData.sync.lastRunAt);
  const dueProjects = workData?.projects.filter((project) => project.status === 'active' && project.daysToDeadline !== null && project.daysToDeadline <= 2) ?? [];
  const needsReply = messagesKnown ? inboxData?.needsReply ?? [] : [];
  const followUps = messagesKnown ? inboxData?.followUps ?? [] : [];
  const attentionEmpty = messagesKnown && workData && !needsReply.length && !followUps.length && !dueProjects.length;

  return <>
    <PageIntro eyebrow="Ringkasan bisnis" title="Hari ini di kantor" description="Mulai dari pesan masuk dan tenggat proyek. Status operasi, peluang, dan jejak keputusan ada di bawah." action={<Link to="/opportunities" className="button button-primary">Tinjau peluang</Link>} />
    <section className="activity-preview card-section" aria-labelledby="overview-attention-title">
      <div className="section-heading"><div><p className="eyebrow">Tindakan pemilik</p><h2 id="overview-attention-title">Perlu Anda cek</h2></div></div>
      {inbox.isPending && <LoadingPanel label="Membaca pesan dan tindak lanjut bid..." />}
      {inbox.isError && <ErrorNotice message="Pesan dan tindak lanjut bid tidak tersedia. Buka kotak masuk untuk mencoba lagi." onRetry={() => inbox.refetch()} />}
      {inboxData && !messagesKnown && <div className="notice notice-warning" role="status">Status pesan tidak diketahui. {inboxData.sync?.ok === false ? 'Sinkronisasi terakhir gagal.' : 'Sinkronisasi berhasil belum tercatat.'} <Link to="/inbox">Periksa kotak masuk</Link>.</div>}
      {messagesKnown && <p className="form-help">Pesan Freelancer terakhir disinkronkan {formatDate(inboxData?.sync?.lastRunAt ?? '')}.</p>}
      {needsReply.length > 0 && <div><h3>Pesan masuk menunggu balasan ({needsReply.length})</h3><ul className="deadlines-list">{needsReply.slice(0, 3).map((thread) => <li className="deadline-item" key={thread.threadId}><div><strong>{thread.projectTitle ?? 'Percakapan tanpa proyek tersinkron'}</strong><div className="item-sub">Freelancer · {thread.preview}</div></div><div className="item-aside"><span className="item-sub">{formatDate(thread.lastMessageAt)}</span></div></li>)}</ul><Link className="text-link" to="/inbox">Lihat semua pesan</Link></div>}
      {work.isPending && <LoadingPanel label="Membaca tenggat proyek klien..." />}
      {work.isError && <ErrorNotice message="Tenggat proyek tidak tersedia. Buka proyek dan pendapatan untuk mencoba lagi." onRetry={() => work.refetch()} />}
      {dueProjects.length > 0 && <div><h3>Tenggat lewat atau dalam 2 hari ({dueProjects.length})</h3><ul className="deadlines-list">{dueProjects.slice(0, 3).map((project) => <li className="deadline-item" key={project.id}><div><strong>{project.title}</strong><div className="item-sub">{project.client} · {WORK_SOURCE[project.source]}</div></div><div className="item-aside"><strong className="is-late">{deadlineLabel(project.daysToDeadline)}</strong><span className="item-sub">{project.deadline ?? 'Tanggal tidak tersedia'}</span></div></li>)}</ul><Link className="text-link" to="/work">Lihat semua proyek</Link></div>}
      {followUps.length > 0 && <div><h3>Bid tanpa percakapan selama 3 hari atau lebih ({followUps.length})</h3><ul className="deadlines-list">{followUps.slice(0, 3).map((bid) => <li className="deadline-item" key={bid.projectId}><div><Link className="item-link" to={`/opportunities?project=${encodeURIComponent(bid.projectId)}`}>{bid.title}</Link><div className="item-sub">Freelancer · bid dikirim {formatDate(bid.submittedAt)}</div></div><div className="item-aside"><strong>{bid.daysSinceBid} hari</strong></div></li>)}</ul><Link className="text-link" to="/inbox">Lihat semua tindak lanjut</Link></div>}
      {attentionEmpty && <EmptyState title="Belum ada tindakan dari pesan, bid, atau tenggat" description="Sinkronisasi pesan berhasil. Tidak ada balasan, tindak lanjut bid, atau tenggat proyek tercatat yang perlu dicek saat ini." />}
    </section>
    {operation.isError
      ? <ErrorNotice message="Status operasi tidak tersedia. Data lama tidak ditampilkan sebagai status live." onRetry={() => operation.refetch()} />
      : <OperationStatus data={operation.data} />}
    <section className="queue-section" aria-labelledby="queue-title">
      <div className="section-heading" style={{ flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}><h2 id="queue-title">Peluang untuk ditinjau</h2><p className="form-help">Tiga peluang pertama dari daftar tersimpan, bukan rekomendasi prioritas.</p></div>
        <Link to="/opportunities" className="button button-secondary">Semua peluang</Link>
      </div>
      {projects.isPending && <LoadingPanel label="Memuat peluang..." />}
      {projects.isError && <ErrorNotice message="Peluang belum dapat dimuat." onRetry={() => projects.refetch()} />}
      {opportunities?.length === 0 && <EmptyState title="Belum ada peluang tersimpan" description="Daftar terisi setelah pemindaian berhasil. Periksa status operasi dan sumber pencarian." action={<Link to="/capabilities" className="button button-secondary">Periksa integrasi</Link>} />}
      <div className="queue-list">
        {opportunities?.slice(0, 3).map((project, index) => <article className="queue-item" key={project.id}>
          <span className="queue-index" aria-hidden="true">0{index + 1}</span>
          <div className="queue-main">
            <h3 style={{ margin: 0 }}><Link to={`/opportunities?project=${encodeURIComponent(project.id)}`} className="queue-title">{project.title}</Link></h3>
            <p>{project.clientName} / {project.skills.slice(0, 2).join(', ')}</p>
          </div>
          <div className="queue-score"><strong>{project.score}</strong><small>skor kecocokan</small></div>
          <span className="queue-budget">{formatMoney(project.budgetMin, project.currency)} - {formatMoney(project.budgetMax, project.currency)}</span>
        </article>)}
      </div>
    </section>
    {query.isPending && <LoadingPanel label="Memuat ringkasan ruang kerja..." />}
    {query.isError && <ErrorNotice message="Ringkasan, kebijakan, dan aktivitas belum dapat dimuat. Peluang dan operasi tetap tersedia dari sumber masing-masing." onRetry={() => query.refetch()} />}
    {data && <>
      <section className="card-summary-grid" aria-label="Angka pendukung ruang kerja" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 12rem), 1fr))' }}>
        <Metric label="Peluang terbuka" value={data.counts.openProjects} note="Proyek terbuka yang tersimpan" to="/opportunities" />
        <Metric label="Draf tersimpan" value={data.counts.drafts} note="Proposal lokal, bukan bukti pengiriman" to="/pipeline" />
        <Metric label="Tahap terkirim" value={data.counts.submittedBids} note="Freelancer, belum berpindah ke tahap lain" to="/pipeline" />
      </section>
      <section className="policy-card" aria-labelledby="policy-overview-title">
        <div className="section-heading" style={{ flexWrap: 'wrap' }}><h2 id="policy-overview-title">Batas operasi</h2><StateLabel state={data.policy.state} /></div>
        <p>{data.policy.state === 'active' && !data.policy.simulationOnly ? 'Bid yang lolos pemeriksaan diizinkan kebijakan. Hambatan proses ditampilkan pada status operasi.' : data.policy.state === 'paused' ? 'Automasi dijeda. Tinjau kebijakan bila ingin mengubah batas operasi.' : 'Pengiriman bid belum diizinkan. Tinjau kebijakan sebelum mengaktifkannya.'}</p>
        <p className="form-help">Versi {data.policy.version}. Profil {data.profileComplete ? 'terisi' : 'belum lengkap'}. Akses tulis eksternal {data.externalWrites ? 'diizinkan server' : 'tidak diizinkan server'}.</p>
        <Link className="button button-secondary" to="/policy">Tinjau kebijakan</Link>
      </section>
      <section className="activity-preview" aria-labelledby="activity-overview-title">
        <div className="section-heading" style={{ flexWrap: 'wrap' }}><h2 id="activity-overview-title">Keputusan terbaru</h2><Link to="/activity" className="button button-secondary">Buka log lengkap</Link></div>
        {data.activity.length ? <ActivityRows events={data.activity.slice(0, 3)} /> : <EmptyState title="Belum ada keputusan tercatat" description="Log terisi saat aplikasi memproses peluang atau perubahan ruang kerja. Periksa status operasi untuk langkah berikutnya." action={<Link to="/capabilities" className="button button-secondary">Periksa integrasi</Link>} />}
      </section>
    </>}
  </>;
}
