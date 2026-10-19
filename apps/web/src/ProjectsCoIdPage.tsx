import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, jsonRequest } from './api.js';
import type { ProjectsCoIdEntry, ProjectsCoIdStatus } from './projects-co-id-api.js';

const rupiah = (amount: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
const date = (value: string | null) => value ? new Date(value).toLocaleString('id-ID') : 'Belum pernah';
const modeLabels = { off: 'Nonaktif', 'scan-only': 'Pindai saja', drafts: 'Pindai & buat draf' };

export default function ProjectsCoIdPage() {
  const client = useQueryClient();
  const status = useQuery({ queryKey: ['projects-co-id'], queryFn: () => api<ProjectsCoIdStatus | null>('/projects-co-id'), refetchInterval: 3000 });
  const entries = useQuery({ queryKey: ['projects-co-id-drafts'], queryFn: () => api<ProjectsCoIdEntry[]>('/projects-co-id/drafts'), refetchInterval: 5000 });
  const [notice, setNotice] = useState('');
  const refresh = async () => { await Promise.all(['projects-co-id', 'projects-co-id-drafts', 'pipeline', 'projects', 'activity', 'policy'].map(key => client.invalidateQueries({ queryKey: [key] }))); };
  const control = useMutation({
    mutationFn: ({ action, mode }: { action: 'open' | 'check' | 'scan' | 'close' | 'mode'; mode?: ProjectsCoIdStatus['mode'] }) => api(`/projects-co-id/${action}`, jsonRequest(action === 'mode' ? 'PUT' : 'POST', action === 'mode' ? { mode } : undefined)),
    onSuccess: async () => { setNotice('Permintaan diterima. Status diperbarui dari worker.'); await refresh(); },
  });
  const worker = status.isError ? undefined : status.data;
  const projects = entries.isError ? undefined : entries.data;
  const busy = !!worker?.busy || control.isPending;
  const ready = projects?.filter(p => p.latestDraft && !['submitted', 'skipped'].includes(p.pipelineStatus));
  const scanned = projects?.filter(p => !p.latestDraft && !['submitted', 'skipped'].includes(p.pipelineStatus));
  const history = projects?.filter(p => ['submitted', 'skipped'].includes(p.pipelineStatus));
  return <div className="projects-co-id-page">
    <div className="page-intro"><h1>projects.co.id</h1><p>Scout membaca proyek dan menyiapkan draf Bahasa Indonesia. Anda meninjau dan mengirim penawaran sendiri di situs.</p></div>
    {notice && <p className="notice notice-success" role="status">{notice}</p>}
    {control.isError && <p className="notice notice-error" role="alert">{control.error.message}</p>}
    <section className="form-card" aria-labelledby="projects-worker-title">
      <div className="section-heading"><h2 id="projects-worker-title">Worker projects.co.id</h2></div>
      {status.isPending ? <p role="status">Memuat status worker...</p> : !worker ? <p role="alert">Status worker tidak tersedia. <button className="button button-text" onClick={() => status.refetch()}>Coba lagi</button></p> : <>
        <p role="status">{worker.reason}</p>
        <dl className="projects-worker-facts">
          <div><dt>Akun teramati</dt><dd>{worker.username ?? 'Tidak diketahui'}</dd></div>
          <div><dt>Pemeriksaan akun</dt><dd>{date(worker.checkedAt)}</dd></div>
          <div><dt>Scan terakhir</dt><dd>{date(worker.lastScanAt)}</dd></div>
          <div><dt>Draf otomatis terpakai</dt><dd>{worker.draftUsage.today}/{worker.draftUsage.dailyLimit} hari ini; {worker.draftUsage.week}/{worker.draftUsage.weeklyLimit} minggu ini</dd></div>
        </dl>
        <label className="form-field"><span>Mode worker</span><select value={worker.mode} disabled={busy} onChange={e => control.mutate({ action: 'mode', mode: e.target.value as ProjectsCoIdStatus['mode'] })}>{Object.entries(modeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <div className="form-actions">
          <button className="button button-primary" disabled={busy || worker.mode === 'off' || worker.state === 'paused'} onClick={() => control.mutate({ action: 'open' })}>Hubungkan Chrome saya</button>
          <button className="button button-secondary" disabled={busy || ['stopped', 'paused'].includes(worker.state) || worker.mode === 'off'} onClick={() => control.mutate({ action: 'check' })}>Periksa akun</button>
          <button className="button button-secondary" disabled={busy || worker.state !== 'ready'} onClick={() => control.mutate({ action: 'scan' })}>Pindai sekarang</button>
          <button className="button button-text" disabled={control.isPending} onClick={() => control.mutate({ action: 'close' })}>Lepas sambungan</button>
        </div>
        <p className="form-help">Login sebagai KhairulHuda06 di tab Chrome biasa pada profil yang sama, lalu Periksa akun. Tab worker memblokir semua request tulis. Pemindaian maksimal tiga halaman setiap 30 menit; Jeda automasi juga menghentikan Scout.</p>
        <p className="form-help">Harga IDR dan batas draf diatur di <Link to="/policy">Kebijakan</Link>. Kuota Freelancer dihitung terpisah. Draf manual tidak mengurangi kuota otomatis.</p>
      </>}
    </section>
    {entries.isPending && <p role="status">Memuat proyek dan draf...</p>}
    {entries.isError && <p className="notice notice-error" role="alert">Proyek dan draf tidak tersedia. <button className="button button-text" onClick={() => entries.refetch()}>Muat ulang</button></p>}
    {projects && <>
      <section aria-labelledby="projects-ready-title"><h2 id="projects-ready-title">Draf siap dikirim ({ready?.length})</h2>
        {!ready?.length && <p className="form-help">Belum ada draf siap. Pilih mode draf atau buat draf dari proyek terpindai.</p>}
        {ready?.map(project => <ProjectDraft key={project.latestDraft!.id} project={project} refresh={refresh} busy={busy} />)}
      </section>
      <section aria-labelledby="projects-scanned-title"><h2 id="projects-scanned-title">Proyek terpindai tanpa draf ({scanned?.length})</h2>
        {!scanned?.length && <p className="form-help">Belum ada proyek tanpa draf. Hasil pemindaian berikutnya akan tampil di sini.</p>}
        {scanned?.map(project => <ProjectDraft key={project.id} project={project} refresh={refresh} busy={busy || !worker || worker.mode === 'off' || worker.state !== 'ready'} />)}
      </section>
      <section aria-labelledby="projects-history-title"><h2 id="projects-history-title">Riwayat</h2>
        {!history?.length && <p className="form-help">Belum ada proyek yang ditandai terkirim atau dilewati.</p>}
        {history?.map(project => <article className="projects-draft-row" key={project.id}><h3>{project.title}</h3><p>{project.pipelineStatus === 'submitted' ? 'Ditandai terkirim oleh Anda' : 'Dilewati oleh Anda'} · {date(project.ownerActionAt)}</p><a href={project.url} target="_blank" rel="noopener noreferrer">Buka di projects.co.id</a></article>)}
      </section>
    </>}
  </div>;
}

function ProjectDraft({ project, refresh, busy }: { project: ProjectsCoIdEntry; refresh: () => Promise<void>; busy: boolean }) {
  const draft = project.latestDraft;
  const [proposal, setProposal] = useState(draft?.proposal ?? '');
  const [notice, setNotice] = useState('');
  const [copiedError, setCopiedError] = useState(false);
  const action = useMutation({
    mutationFn: (name: 'save' | 'draft' | 'mark-sent' | 'skip') => name === 'save'
      ? api(`/drafts/${draft!.id}`, jsonRequest('PUT', { proposal, proposedPrice: draft!.proposedPrice }))
      : api(`/projects-co-id/projects/${encodeURIComponent(project.id)}/${name}`, jsonRequest('POST', name === 'draft' ? {} : { confirm: true })),
    onSuccess: async () => { setNotice('Perubahan tersimpan.'); await refresh(); },
  });
  async function copy() {
    try { await navigator.clipboard.writeText(proposal); setCopiedError(false); setNotice('Proposal disalin.'); }
    catch { setCopiedError(true); setNotice('Clipboard tidak tersedia. Pilih dan salin teks proposal secara manual.'); }
  }
  const pending = action.isPending || busy;
  return <article className="projects-draft-row">
    <h3>{project.title}</h3>
    <p>{project.clientName} · {rupiah(project.budgetMin)} – {rupiah(project.budgetMax)} · Skor {project.score}/100</p>
    {draft && <>
      <p><strong>{rupiah(draft.proposedPrice)} · {draft.durationDays} hari</strong> <span className="form-help">Ditetapkan kebijakan saat draf dibuat.</span></p>
      <label className="form-field"><span>Proposal untuk {project.title}</span><textarea rows={8} maxLength={1200} value={proposal} onChange={e => setProposal(e.target.value)} /></label>
      <p className="form-help">{proposal.length}/1.200 karakter{proposal !== draft.proposal ? ' · Perubahan belum disimpan.' : ''}</p>
    </>}
    {action.isPending && <p role="status">{draft ? 'Menyimpan perubahan...' : 'Hermes sedang menulis draf; biasanya 40–95 detik.'}</p>}
    {action.isError && <p role="alert">{action.error.message}</p>}
    {notice && <p role={copiedError ? 'alert' : 'status'}>{notice}</p>}
    <div className="form-actions">
      {draft ? <>
        <button className="button button-secondary" disabled={pending || proposal === draft.proposal} onClick={() => action.mutate('save')}>Simpan proposal</button>
        <button className="button button-secondary" onClick={() => void copy()}>Salin proposal</button>
      </> : <button className="button button-primary" disabled={pending} onClick={() => action.mutate('draft')}>Buat draf</button>}
      <a className="button button-secondary" href={project.url} target="_blank" rel="noopener noreferrer">Buka di projects.co.id</a>
      {draft && <button className="button button-primary" disabled={pending || proposal !== draft.proposal} onClick={() => { if (window.confirm('Anda sudah mengirim penawaran sendiri di projects.co.id? Aplikasi tidak memverifikasi pengiriman.')) action.mutate('mark-sent'); }}>Sudah saya kirim</button>}
      <button className="button button-text" disabled={pending} onClick={() => { if (window.confirm('Lewati proyek ini? Scout tidak akan membuat draf otomatis untuk proyek ini.')) action.mutate('skip'); }}>Lewati</button>
    </div>
  </article>;
}
