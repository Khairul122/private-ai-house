import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OFFICE_ROSTER } from '@fvh/domain';
import { api, jsonRequest } from '../api/api.js';
import { officeLearningQuery } from '../api/queries.js';
import { ErrorNotice, LoadingPanel } from './ui.js';
import { formatDate } from './format.js';
import type { OfficeLearningStatus } from '../../../server/src/models/office-learning-types.js';

const employeeName = (id: string) => OFFICE_ROSTER.find(employee => employee.id === id)?.name ?? id;

export function OfficeLearningCard() {
  const query = useQuery(officeLearningQuery);
  const client = useQueryClient();
  const [employee, setEmployee] = useState('');
  const action = useMutation({
    mutationFn: (enabled: boolean | 'run') => api<OfficeLearningStatus>(
      `/office-learning/${enabled === 'run' ? 'run' : 'enabled'}`,
      enabled === 'run' ? jsonRequest('POST', {}) : jsonRequest('PUT', { enabled }),
    ),
    onSuccess: data => client.setQueryData(officeLearningQuery.queryKey, data),
    onSettled: () => client.invalidateQueries({ queryKey: officeLearningQuery.queryKey }),
  });
  if (query.isPending) return <LoadingPanel label="Memuat ruang belajar tim..." />;
  if (query.isError) return <ErrorNotice message="Percakapan dan memori tim tidak tersedia." onRetry={() => void query.refetch()} />;
  const data = query.data;
  if (!data) return <section className="office-learning"><h2>Ruang belajar tim</h2><p>Hermes belum tersedia untuk sesi belajar.</p></section>;
  const sessions = data.sessions.filter(session => !employee || session.participantIds.includes(employee));
  const memories = data.memories.filter(memory => !employee || memory.employeeId === employee);
  return <section className="office-learning" aria-labelledby="office-learning-title">
    <header>
      <div><h2 id="office-learning-title">Ruang belajar tim</h2><p>Diskusi internal, catatan belajar, dan ingatan setiap karyawan.</p></div>
      <div className="office-learning-actions">
        <button className="button button-primary" disabled={action.isPending || data.busy || !data.available || !data.enabled || data.sessionsToday >= data.dailyLimit || Boolean(data.nextRunAt && Date.parse(data.nextRunAt) > Date.now())} onClick={() => action.mutate('run')}>Mulai sesi</button>
        <button className="button button-secondary" disabled={action.isPending || !data.available} onClick={() => action.mutate(!data.enabled)}>{data.enabled ? 'Jeda belajar' : 'Aktifkan belajar'}</button>
      </div>
    </header>
    <p role="status">{data.reason}</p>
    <p className="card-status-note">Setiap {data.intervalMinutes} menit; {data.sessionsToday}/{data.dailyLimit} sesi hari ini (WIB).{data.nextRunAt ? ` Jadwal berikut: ${formatDate(data.nextRunAt)}.` : ''} Pekerjaan aktif didahulukan.</p>
    {action.isError && <ErrorNotice message={action.error.message} />}
    <label className="office-learning-filter" htmlFor="office-learning-employee">Karyawan
      <select id="office-learning-employee" value={employee} onChange={event => setEmployee(event.target.value)}><option value="">Seluruh tim</option>{OFFICE_ROSTER.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
    </label>
    <div className="office-learning-columns">
      <div><h3>Percakapan</h3>
        {sessions.length === 0 && <p>Belum ada percakapan tersimpan untuk pilihan ini.</p>}
        {sessions.map((session, index) => <details className="office-conversation" key={session.id} open={index === 0}>
          <summary>{session.topic}<small>{formatDate(session.startedAt)} · {session.state === 'completed' ? 'Selesai' : session.state === 'failed' ? 'Gagal' : 'Berjalan'}</small></summary>
          <ol>{session.turns.map((turn, turnIndex) => <li key={turnIndex}><strong>{employeeName(turn.employeeId)}</strong><p>{turn.message}</p></li>)}</ol>
          {session.turns.length === 0 && <p>Belum ada tanggapan Hermes.</p>}
          {session.error && <p role="alert">{session.error}</p>}
        </details>)}
      </div>
      <aside><h3>Ingatan karyawan</h3><p className="card-status-note">Catatan AI belum diverifikasi. Ingatan ini dibaca kembali pada sesi berikutnya; bukan fakta profil atau instruksi kerja.</p>
        {memories.length === 0 && <p>Belum ada pelajaran tersimpan untuk pilihan ini.</p>}
        <ul className="office-memories">{memories.map(memory => <li key={`${memory.sessionId}-${memory.employeeId}`}><strong>{employeeName(memory.employeeId)}</strong><p>{memory.lesson}</p><small>{formatDate(memory.createdAt)}</small></li>)}</ul>
      </aside>
    </div>
  </section>;
}
