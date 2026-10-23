import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, jsonRequest } from '../api/api.js';
import { ROSTER } from '../state/office-state.js';
import type { HermesKanbanDetail, HermesKanbanStatus, HermesKanbanTask } from '../../../server/src/models/hermes-kanban-types.js';

const ORCHESTRATOR = 'fvh-chief-of-staff';
const COLUMNS: Array<{ title: string; hint: string; statuses: string[] }> = [
  { title: 'Antre', hint: 'Menunggu dispatcher, kartu induk, atau jadwal', statuses: ['triage', 'todo', 'ready', 'scheduled'] },
  { title: 'Dikerjakan', hint: 'Karyawan Hermes sedang bekerja atau meninjau', statuses: ['running', 'review'] },
  { title: 'Butuh Anda', hint: 'Diblokir: karyawan meminta data atau keputusan', statuses: ['blocked'] },
  { title: 'Selesai', hint: 'Hasil siap dibaca', statuses: ['done'] },
];
const STATUS: Record<string, string> = { triage: 'Triage', todo: 'Menunggu', ready: 'Siap', scheduled: 'Terjadwal', running: 'Berjalan', review: 'Ditinjau', blocked: 'Diblokir', done: 'Selesai' };
const employee = (profile: string | null) => {
  const entry = ROSTER.find(item => `fvh-${item.id}` === profile);
  return entry ? entry.name : profile ?? 'Belum ditugaskan';
};
const time = (value: string | null) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : null;

function TaskResult({ id }: { id: string }) {
  const detail = useQuery({ queryKey: ['hermes-kanban', id], queryFn: () => api<HermesKanbanDetail>(`/hermes-kanban/tasks/${id}`), refetchInterval: 30_000 });
  if (detail.isPending) return <p role="status">Memuat hasil…</p>;
  if (detail.isError) return <p role="alert">Hasil kartu tidak tersedia.</p>;
  return <div className="hermes-result">
    <p>{detail.data.summary ?? 'Belum ada ringkasan hasil.'}</p>
    {detail.data.runs.length > 0 && <ol>{detail.data.runs.map((run, index) => <li key={index}>
      <strong>{employee(run.profile)}</strong> — {run.outcome ?? 'tidak diketahui'}{run.endedAt ? `, ${time(run.endedAt)}` : ''}{run.error ? `. Kesalahan: ${run.error}` : ''}
      {run.summary && run.summary !== detail.data.summary && <p>{run.summary}</p>}
    </li>)}</ol>}
    {detail.data.children.length > 0 && <p>Kartu turunan: {detail.data.children.join(', ')}</p>}
  </div>;
}

function TaskCard({ task }: { task: HermesKanbanTask }) {
  const [open, setOpen] = useState(false);
  return <article className="kanban-card">
    <div className="kanban-card-top">
      <span className="kanban-card-client">{employee(task.assignee)}</span>
      <span className={`state-label state-${task.status}`}>{STATUS[task.status] ?? task.status}</span>
    </div>
    <h4>{task.title}</h4>
    <p className="kanban-hint">{task.createdBy === 'mission-control' ? 'Dari Mission Control' : task.createdBy === ORCHESTRATOR ? 'Dibagi oleh Chief of Staff' : `Dari ${task.createdBy ?? 'tidak diketahui'}`} · {time(task.completedAt ?? task.startedAt ?? task.createdAt) ?? 'Waktu tidak tersedia'}</p>
    {task.error && <p className="notice notice-error">{task.error}</p>}
    {['done', 'blocked', 'review', 'running'].includes(task.status) && <button type="button" className="button button-secondary" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Tutup hasil' : 'Lihat hasil'}</button>}
    {open && <TaskResult id={task.id} />}
  </article>;
}

export default function HermesKanbanCard({ employeeId, purpose = 'task', meetingWith }: { employeeId?: string; purpose?: 'task' | 'chat' | 'meeting'; meetingWith?: string } = {}) {
  const query = useQuery({ queryKey: ['hermes-kanban'], queryFn: () => api<HermesKanbanStatus | null>('/hermes-kanban'), refetchInterval: 30_000 });
  const cache = useQueryClient();
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState(meetingWith ? `Bahas agenda owner bersama ${meetingWith}. Rangkum masukan dan langkah berikutnya. Jangan mengklaim peserta telah menjawab tanpa hasil nyata.` : '');
  const [assignee, setAssignee] = useState(employeeId ? `fvh-${employeeId}` : ORCHESTRATOR);
  const [includeData, setIncludeData] = useState(!employeeId);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const data = query.isError ? undefined : query.data;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true); setNotice(null);
    try {
      const task = await api<HermesKanbanTask>('/hermes-kanban/tasks', jsonRequest('POST', { title, goal, assignee, includeData }));
      setTitle(''); setGoal('');
      setNotice({ error: false, text: `Kartu ${task.id} dibuat untuk ${employee(task.assignee)}. Dispatcher Hermes akan mengambilnya.` });
      await cache.invalidateQueries({ queryKey: ['hermes-kanban'] });
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : 'Kartu belum dibuat.' }); }
    finally { setPending(false); }
  }

  return <section className="form-card" aria-label="Kanban tim Hermes">
    <div className="section-heading"><div><p className="eyebrow">Tim AI · board {data?.board ?? 'fvh-house'}</p><h2>{purpose === 'meeting' ? 'Agenda rapat' : purpose === 'chat' ? 'Diskusi dengan karyawan' : 'Pekerjaan tim Hermes'}</h2></div></div>
    {query.isPending ? <p role="status">Memuat kanban Hermes…</p>
      : query.isError ? <p role="alert">Kanban Hermes tidak tersedia. <button type="button" className="button button-text" onClick={() => void query.refetch()}>Coba lagi</button></p>
      : !data ? <p>Kanban Hermes tidak aktif: Hermes dan persetujuan data harus aktif di <code>.env</code>.</p>
      : !data.available ? <p role="alert">{data.reason}</p>
      : <>
        <p className="card-status-note">{data.reason} Hasil pekerjaan berupa usulan untuk Anda tinjau.</p>
        <div className="kanban-board">
          {COLUMNS.map(column => {
            const tasks = data.tasks.filter(task => column.statuses.includes(task.status) && (!employeeId || task.assignee === `fvh-${employeeId}`));
            return <div className="kanban-column" key={column.title}>
              <div className="kanban-col-head"><h3>{column.title}</h3><span className="kanban-count">{tasks.length}</span></div>
              <p className="kanban-hint">{column.hint}</p>
              {tasks.length ? tasks.map(task => <TaskCard key={task.id} task={task} />) : <div className="kanban-empty">Tidak ada kartu</div>}
            </div>;
          })}
        </div>
        <details className="card-disclosure" open={employeeId ? true : undefined}><summary>Buat tugas untuk tim Hermes</summary>
          <p className="form-help">Chief of Staff membagi tujuan ke tim, atau pilih satu karyawan. Setiap tugas memakai kuota model.</p>
        <form onSubmit={event => { if (data.team.includes(assignee)) void submit(event); else event.preventDefault(); }}><fieldset disabled={pending}>
          <div className="form-grid">
            <label className="form-field"><span>{purpose === 'meeting' ? 'Agenda rapat' : purpose === 'chat' ? 'Pesan untuk karyawan' : 'Tugas'}</span><input value={title} onChange={e => setTitle(e.target.value)} required minLength={3} maxLength={200} placeholder={purpose === 'task' ? 'Contoh: Pilih 3 peluang AI terbaik minggu ini' : 'Tulis topik yang ingin Anda bahas'} /></label>
            <label className="form-field"><span>Karyawan</span><select value={assignee} onChange={e => setAssignee(e.target.value)}>
              {!data.team.includes(assignee) && <option value={assignee} disabled>{employee(assignee)} — profil Hermes tidak tersedia</option>}
              {data.team.map(profile => <option key={profile} value={profile}>{employee(profile)}{profile === ORCHESTRATOR ? ' (orchestrator)' : ''}</option>)}
            </select></label>
          </div>
          <label className="form-field"><span>Detail tujuan (opsional)</span><textarea value={goal} onChange={e => setGoal(e.target.value)} maxLength={4000} rows={3} /></label>
          <label className="check-row"><input type="checkbox" checked={includeData} onChange={e => setIncludeData(e.target.checked)} /><span>Lampirkan snapshot data aplikasi (kebijakan, hasil bid, peluang, pesan klien, proyek & pembayaran). Data ini dikirim ke provider model Hermes.</span></label>
          <div className="form-actions"><button className="button button-primary" type="submit" disabled={!data.team.includes(assignee)}>{pending ? 'Mengirim…' : 'Kirim ke tim Hermes'}</button><span>Setiap kartu memakai kuota model.</span></div>
        </fieldset></form>
        {notice && <p className={`notice ${notice.error ? 'notice-error' : 'notice-success'}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
        </details>
      </>}
  </section>;
}
