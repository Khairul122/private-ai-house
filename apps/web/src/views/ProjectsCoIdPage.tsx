import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { PROJECTS_CO_ID_FIELDS, projectsCoIdFieldsOf, projectsCoIdSettings } from '@fvh/domain';
import { api, jsonRequest, type Policy } from '../api/api.js';
import type { ProjectsCoIdEntry, ProjectsCoIdStatus } from '../api/projects-co-id-api.js';

const rupiah = (amount: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belum pernah';
const daysUntil = (value: string) => Math.ceil((Date.parse(value) - Date.now()) / 86_400_000);
const modeLabels: Record<ProjectsCoIdStatus['mode'], string> = { off: 'Nonaktif', 'scan-only': 'Pindai saja', drafts: 'Pindai & buat draf' };
const stateLabels: Record<ProjectsCoIdStatus['state'], string> = { stopped: 'Belum tersambung', opening: 'Menyambung ke Chrome', checking: 'Memeriksa akun', scanning: 'Memindai', drafting: 'Hermes menulis draf', ready: 'Siap', paused: 'Dijeda kill switch', login_required: 'Perlu login', account_mismatch: 'Akun berbeda', challenge: 'Verifikasi Cloudflare', error: 'Perlu diperiksa' };
const fieldLabel = new Map<string, string>(PROJECTS_CO_ID_FIELDS.map(field => [field.id, field.label]));

type Stage = 'ready' | 'scanned' | 'sent' | 'won' | 'skipped';
const STAGES: Array<[Stage, string]> = [['ready', 'Draf siap dikirim'], ['scanned', 'Tanpa draf'], ['sent', 'Ditandai terkirim'], ['won', 'Menang'], ['skipped', 'Dilewati']];
const stageOf = (project: ProjectsCoIdEntry): Stage | null => project.pipelineStatus === 'won' ? 'won' : project.pipelineStatus === 'submitted' ? 'sent' : project.pipelineStatus === 'skipped' ? 'skipped'
  : project.latestDraft ? 'ready' : project.status === 'open' ? 'scanned' : null;
type Sort = 'score' | 'budget' | 'closing' | 'newest';
const sorters: Record<Sort, (a: ProjectsCoIdEntry, b: ProjectsCoIdEntry) => number> = {
  score: (a, b) => b.score - a.score,
  budget: (a, b) => b.budgetMax - a.budgetMax,
  closing: (a, b) => (a.closesAt ? Date.parse(a.closesAt) : Infinity) - (b.closesAt ? Date.parse(b.closesAt) : Infinity),
  newest: (a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''),
};

export default function ProjectsCoIdPage() {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const focusId = params.get('project');
  const status = useQuery({ queryKey: ['projects-co-id'], queryFn: () => api<ProjectsCoIdStatus | null>('/projects-co-id'), refetchInterval: 3000 });
  const entries = useQuery({ queryKey: ['projects-co-id-drafts'], queryFn: () => api<ProjectsCoIdEntry[]>('/projects-co-id/drafts'), refetchInterval: 5000 });
  const policy = useQuery({ queryKey: ['policy'], queryFn: () => api<Policy>('/policy') });
  const [stage, setStage] = useState<Stage | 'all'>(focusId ? 'all' : 'ready');
  const [field, setField] = useState('all');
  const [author, setAuthor] = useState<'all' | 'hermes' | 'template'>('all');
  const [sort, setSort] = useState<Sort>('score');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  // Follows the worker state until the owner opens, closes or uses the panel, then stays where they left it.
  const [connectionOpen, setConnectionOpen] = useState<boolean | null>(null);
  const refresh = async () => { await Promise.all(['projects-co-id', 'projects-co-id-drafts', 'pipeline', 'projects', 'activity', 'policy', 'work'].map(key => client.invalidateQueries({ queryKey: [key] }))); };
  const control = useMutation({
    mutationFn: ({ action, mode }: { action: 'open' | 'check' | 'scan' | 'close' | 'mode'; mode?: ProjectsCoIdStatus['mode'] }) => api(`/projects-co-id/${action}`, jsonRequest(action === 'mode' ? 'PUT' : 'POST', action === 'mode' ? { mode } : undefined)),
    onSuccess: async () => { setNotice('Permintaan diterima. Status diperbarui dari worker.'); await refresh(); },
  });
  const worker = status.isError ? undefined : status.data;
  const projects = entries.isError ? undefined : entries.data;
  const settings = policy.isError || !policy.data ? undefined : projectsCoIdSettings(policy.data);
  const busy = !!worker?.busy || control.isPending;
  const withFields = useMemo(() => (projects ?? []).map(project => ({ project, stage: stageOf(project), fields: projectsCoIdFieldsOf(project) })), [projects]);
  const counts = Object.fromEntries(STAGES.map(([key]) => [key, withFields.filter(item => item.stage === key).length])) as Record<Stage, number>;
  const text = search.trim().toLowerCase();
  const visible = withFields.filter(item => item.stage && (stage === 'all' || item.stage === stage)
    && (field === 'all' || item.fields.includes(field))
    && (author === 'all' || item.project.latestDraft?.author === author)
    && (!text || `${item.project.title} ${item.project.clientName} ${item.project.skills.join(' ')} ${item.project.description}`.toLowerCase().includes(text)))
    .sort((a, b) => sorters[sort](a.project, b.project));
  useEffect(() => {
    if (focusId && projects) document.getElementById(`pci-${focusId}`)?.scrollIntoView({ block: 'start' });
  }, [focusId, projects]);
  const workerOk = worker?.state === 'ready';
  const run = (input: { action: 'open' | 'check' | 'scan' | 'close' | 'mode'; mode?: ProjectsCoIdStatus['mode'] }) => { setConnectionOpen(true); control.mutate(input); };

  return <div className="projects-co-id-page">
    <div className="page-intro"><h1>projects.co.id</h1><p>Scout membaca proyek sesuai bidang, kata kunci dan profil Anda, lalu Hermes menyiapkan draf Bahasa Indonesia. Anda meninjau dan mengirim penawaran sendiri di situs.</p></div>
    {notice && <p className="notice notice-success" role="status">{notice}</p>}
    {control.isError && <p className="notice notice-error" role="alert">{control.error.message}</p>}

    <section className="pci-overview" aria-labelledby="pci-worker-title">
      <div className="pci-overview-head">
        <div><p className="eyebrow">Scout projects.co.id</p><h2 id="pci-worker-title">{status.isPending ? 'Memuat status…' : worker ? stateLabels[worker.state] : 'Status tidak tersedia'}</h2></div>
        {worker && <span className={`state-label pci-state-${workerOk ? 'ok' : 'attention'}`}>{modeLabels[worker.mode]}</span>}
      </div>
      {status.isError && <p role="alert">Status worker tidak tersedia. <button className="button button-text" onClick={() => status.refetch()}>Coba lagi</button></p>}
      {worker && <>
        <p role="status" className="pci-reason">{worker.reason}</p>
        <dl className="pci-facts">
          <div><dt>Akun teramati</dt><dd>{worker.username ?? 'Tidak diketahui'}</dd></div>
          <div><dt>Pemindaian terakhir</dt><dd>{date(worker.lastScanAt)}{worker.lastResult ? ` · ${worker.lastResult.imported} proyek` : ''}</dd></div>
          <div><dt>Draf otomatis</dt><dd>{worker.draftUsage.today}/{worker.draftUsage.dailyLimit} hari ini · {worker.draftUsage.week}/{worker.draftUsage.weeklyLimit} minggu ini</dd></div>
          <div><dt>Request tulis diblokir</dt><dd>{worker.blockedWrites}</dd></div>
        </dl>
      </>}
      <div className="pci-stage-strip" role="group" aria-label="Ringkasan proyek per tahap">
        {STAGES.map(([key, label]) => <button type="button" key={key} aria-pressed={stage === key} className={stage === key ? 'active' : ''} onClick={() => setStage(stage === key ? 'all' : key)}><strong>{projects ? counts[key] : '–'}</strong><span>{label}</span></button>)}
      </div>
    </section>

    {worker && <details className="pci-panel" open={connectionOpen ?? !workerOk} onToggle={event => { const open = event.currentTarget.open; if (open !== (connectionOpen ?? !workerOk)) setConnectionOpen(open); }}>
      <summary>Koneksi & mode worker</summary>
      <label className="form-field"><span>Mode worker</span><select value={worker.mode} disabled={busy} onChange={e => run({ action: 'mode', mode: e.target.value as ProjectsCoIdStatus['mode'] })}>{Object.entries(modeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <div className="form-actions">
        <button className="button button-primary" disabled={busy || worker.mode === 'off' || worker.state === 'paused'} onClick={() => run({ action: 'open' })}>Hubungkan Chrome saya</button>
        <button className="button button-secondary" disabled={busy || ['stopped', 'paused'].includes(worker.state) || worker.mode === 'off'} onClick={() => run({ action: 'check' })}>Periksa akun</button>
        <button className="button button-secondary" disabled={busy || !workerOk} onClick={() => run({ action: 'scan' })}>Pindai sekarang</button>
        <button className="button button-text" disabled={control.isPending} onClick={() => run({ action: 'close' })}>Lepas sambungan</button>
      </div>
      <p className="form-help">Login sebagai {settings?.username ?? 'akun di Kebijakan'} dan selesaikan verifikasi Cloudflare di tab Chrome biasa pada profil yang sama, lalu Periksa akun. Tab worker memblokir semua request tulis. Jeda automasi juga menghentikan Scout.</p>
    </details>}

    <section className="pci-panel pci-search" aria-labelledby="pci-search-title">
      <div className="pci-overview-head"><h2 id="pci-search-title">Pencarian & batas</h2><Link className="button button-text" to="/policy#projects-co-id-policy">Ubah di Kebijakan</Link></div>
      {policy.isError ? <p role="alert">Kebijakan tidak tersedia.</p> : !settings ? <p role="status">Memuat kebijakan…</p> : <>
        <dl className="pci-facts">
          <div><dt>Bidang</dt><dd>{settings.fields.length ? settings.fields.map(id => fieldLabel.get(id) ?? id).join(', ') : 'Tidak ada bidang dipilih'}</dd></div>
          <div><dt>Harga draf</dt><dd>{rupiah(settings.minPrice)} – {rupiah(settings.maxPrice)}</dd></div>
          <div><dt>Skor minimum draf</dt><dd>{settings.minimumScore}%</dd></div>
          <div><dt>Skill <Link to="/profile">Profil</Link></dt><dd>{settings.useProfileSkills ? 'Dipakai sebagai pencarian' : 'Tidak dipakai'}</dd></div>
        </dl>
        {worker && <div className="pci-terms" aria-label="Istilah pencarian">
          {worker.searchTerms.length ? worker.searchTerms.map(term => <span key={term} className={`skill-tag${worker.lastSearchTerms.includes(term) ? ' pci-term-used' : ''}`}>{term}</span>) : <span className="form-help">Tanpa istilah; Scout membaca daftar proyek terbaru.</span>}
        </div>}
        {worker && worker.searchTerms.length > 3 && <p className="form-help">Ditandai = dipakai pada pemindaian terakhir. Tiga istilah per pemindaian, bergiliran.</p>}
      </>}
    </section>

    <section aria-labelledby="pci-queue-title" className="pci-queue">
      <div className="pci-overview-head"><h2 id="pci-queue-title">{stage === 'all' ? 'Semua proyek' : STAGES.find(([key]) => key === stage)![1]} ({visible.length})</h2>
        <span className="pci-links"><Link to="/pipeline?source=projects_co_id">Pipeline</Link> · <Link to="/tasks?source=projects_co_id">Papan tugas</Link> · <Link to="/activity?source=projects_co_id">Aktivitas</Link></span></div>
      <div className="pci-filters">
        <label className="form-field"><span>Tahap</span><select value={stage} onChange={e => setStage(e.target.value as Stage | 'all')}><option value="all">Semua tahap</option>{STAGES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="form-field"><span>Bidang</span><select value={field} onChange={e => setField(e.target.value)}><option value="all">Semua bidang</option>{PROJECTS_CO_ID_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
        <label className="form-field"><span>Penulis draf</span><select value={author} onChange={e => setAuthor(e.target.value as typeof author)}><option value="all">Semua</option><option value="hermes">Hermes (Lead Agent)</option><option value="template">Template bawaan</option></select></label>
        <label className="form-field"><span>Urutkan</span><select value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="score">Skor tertinggi</option><option value="budget">Anggaran tertinggi</option><option value="closing">Listing segera ditutup</option><option value="newest">Terbit terbaru</option></select></label>
        <label className="form-field pci-search-input"><span>Cari</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Judul, owner atau skill" /></label>
      </div>
      {entries.isPending && <p role="status">Memuat proyek dan draf…</p>}
      {entries.isError && <p className="notice notice-error" role="alert">Proyek dan draf tidak tersedia. <button className="button button-text" onClick={() => entries.refetch()}>Muat ulang</button></p>}
      {projects && !visible.length && <p className="form-help">Tidak ada proyek sesuai filter. {stage === 'ready' ? 'Pilih mode draf atau buat draf dari tahap Tanpa draf.' : 'Ubah filter atau pindai lagi.'}</p>}
      {visible.map(({ project, stage: itemStage, fields }) => <ProjectEntry key={project.latestDraft?.id ?? project.id} project={project} stage={itemStage!} fields={fields} focused={project.id === focusId}
        refresh={refresh} canDraft={!busy && !!worker && worker.mode !== 'off' && workerOk} onClearFocus={() => setParams({}, { replace: true })} />)}
    </section>
  </div>;
}

function ProjectEntry({ project, stage, fields, focused, refresh, canDraft, onClearFocus }: { project: ProjectsCoIdEntry; stage: Stage; fields: string[]; focused: boolean; refresh: () => Promise<void>; canDraft: boolean; onClearFocus: () => void }) {
  const draft = project.latestDraft;
  const [proposal, setProposal] = useState(draft?.proposal ?? '');
  const [notice, setNotice] = useState('');
  const [copiedError, setCopiedError] = useState(false);
  const action = useMutation({
    mutationFn: (name: 'save' | 'draft' | 'mark-sent' | 'skip' | 'won') => name === 'save'
      ? api(`/drafts/${draft!.id}`, jsonRequest('PUT', { proposal, proposedPrice: draft!.proposedPrice }))
      : api(`/projects-co-id/projects/${encodeURIComponent(project.id)}/${name}`, jsonRequest('POST', name === 'draft' ? {} : { confirm: true })),
    onSuccess: async (_result, name) => { setNotice(name === 'won' ? 'Proyek aktif dibuat di Proyek & Pendapatan.' : 'Perubahan tersimpan.'); await refresh(); },
  });
  async function copy() {
    try { await navigator.clipboard.writeText(proposal); setCopiedError(false); setNotice('Proposal disalin.'); }
    catch { setCopiedError(true); setNotice('Clipboard tidak tersedia. Pilih dan salin teks proposal secara manual.'); }
  }
  const confirmThen = (message: string, name: 'mark-sent' | 'skip' | 'won') => { if (window.confirm(message)) action.mutate(name); };
  const editable = stage === 'ready';
  const closing = project.closesAt ? daysUntil(project.closesAt) : null;
  const authorText = !draft ? null : draft.author === 'hermes' ? 'Ditulis Hermes (Lead Agent)' : draft.author === 'template' ? 'Template bawaan (Hermes gagal atau ditolak guard)' : 'Penulis tidak tercatat (draf lama)';
  const ownerNote = stage === 'won' ? 'Ditandai menang oleh Anda' : stage === 'sent' ? 'Ditandai terkirim oleh Anda' : stage === 'skipped' ? 'Dilewati oleh Anda' : null;

  return <article className={`projects-draft-row pci-entry${focused ? ' pci-focused' : ''}`} id={`pci-${project.id}`} aria-labelledby={`pci-title-${project.id}`}>
    <div className="pci-entry-top">
      <span className="eyebrow">{project.clientName}{fields.length ? ` · ${fields.map(id => fieldLabel.get(id)).join(', ')}` : ''}</span>
      <span className="pci-score"><strong>{project.score}</strong><small>skor</small></span>
    </div>
    <h3 id={`pci-title-${project.id}`}>{project.title}</h3>
    {ownerNote && <p className="pci-owner-note">{ownerNote} · {date(project.ownerActionAt)}</p>}
    <dl className="pci-facts pci-entry-facts">
      <div><dt>Anggaran klien</dt><dd>{rupiah(project.budgetMin)} – {rupiah(project.budgetMax)}</dd></div>
      <div><dt>Harga & durasi draf</dt><dd>{draft ? `${rupiah(draft.proposedPrice)} · ${draft.durationDays} hari` : 'Belum ada draf'}</dd></div>
      <div><dt>Listing ditutup</dt><dd>{project.closesAt ? `${date(project.closesAt)}${closing !== null && closing >= 0 ? ` · ${closing} hari lagi` : ' · sudah lewat'}` : 'Tidak diberikan situs'}</dd></div>
      <div><dt>Terbit</dt><dd>{date(project.createdAt)}</dd></div>
      {authorText && <div><dt>Penulis draf</dt><dd>{authorText}</dd></div>}
    </dl>
    <details className="pci-brief"><summary>Brief, skill dan alasan skor</summary>
      <p className="pci-description">{project.description}</p>
      {project.skills.length > 0 && <div className="tag-row">{project.skills.map(skill => <span className="skill-tag" key={skill}>{skill}</span>)}</div>}
      <ul className="pci-factors">{project.factors.map(factor => <li key={factor.key}><span>{factor.label}</span><strong>{factor.value}</strong><em>{factor.points > 0 ? '+' : ''}{factor.points}</em></li>)}</ul>
    </details>
    {draft && editable && <>
      <label className="form-field"><span>Proposal untuk {project.title}</span><textarea rows={8} maxLength={1200} value={proposal} onChange={e => setProposal(e.target.value)} /></label>
      <p className="form-help">{proposal.length}/1.200 karakter{proposal !== draft.proposal ? ' · Perubahan belum disimpan.' : ''} Harga dan durasi ditetapkan Kebijakan; sesuaikan di situs bila perlu.</p>
    </>}
    {draft && !editable && <details className="pci-brief"><summary>Proposal yang disiapkan</summary><p className="pci-description">{draft.proposal}</p></details>}
    {action.isPending && <p role="status">{action.variables === 'draft' ? 'Hermes sedang menulis draf; biasanya 40–95 detik.' : 'Menyimpan…'}</p>}
    {action.isError && <p role="alert">{action.error.message}</p>}
    {notice && <p role={copiedError ? 'alert' : 'status'}>{notice}</p>}
    <div className="form-actions">
      {stage === 'scanned' && <button className="button button-primary" disabled={action.isPending || !canDraft} onClick={() => action.mutate('draft')}>Buat draf</button>}
      {editable && draft && <>
        <button className="button button-secondary" disabled={action.isPending || proposal === draft.proposal} onClick={() => action.mutate('save')}>Simpan proposal</button>
        <button className="button button-secondary" onClick={() => void copy()}>Salin proposal</button>
      </>}
      <a className="button button-secondary" href={project.url} target="_blank" rel="noopener noreferrer">Buka di projects.co.id</a>
      {editable && draft && <button className="button button-primary" disabled={action.isPending || proposal !== draft.proposal} onClick={() => confirmThen('Anda sudah mengirim penawaran sendiri di projects.co.id? Aplikasi tidak memverifikasi pengiriman.', 'mark-sent')}>Sudah saya kirim</button>}
      {stage === 'sent' && <button className="button button-primary" disabled={action.isPending} onClick={() => confirmThen('Klien memilih Anda? Proyek aktif dibuat di Proyek & Pendapatan dengan nilai draf dalam Rupiah. Aplikasi tidak memverifikasi ini.', 'won')}>Saya menang</button>}
      {stage === 'won' && <Link className="button button-secondary" to="/work">Lihat di Proyek & Pendapatan</Link>}
      {(stage === 'ready' || stage === 'scanned') && <button className="button button-text" disabled={action.isPending} onClick={() => confirmThen('Lewati proyek ini? Scout tidak akan membuat draf otomatis untuk proyek ini.', 'skip')}>Lewati</button>}
      <Link className="button button-text" to={`/activity?source=projects_co_id&q=${encodeURIComponent(project.id)}`}>Riwayat aktivitas</Link>
      {focused && <button className="button button-text" onClick={onClearFocus}>Tutup sorotan</button>}
    </div>
  </article>;
}
