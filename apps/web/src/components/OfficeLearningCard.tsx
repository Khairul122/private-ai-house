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
  const completed = sessions.filter(session => session.state === 'completed').length;
  const turns = sessions.reduce((total, session) => total + session.turns.length, 0);
  const statusLabel = data.busy ? 'Sedang berlangsung' : data.phase === 'error' ? 'Sesi terakhir gagal' : 'Menunggu jadwal';
  return <section className="office-learning" aria-labelledby="office-learning-title">
    <header className="office-learning-header">
      <div><p className="office-learning-kicker">Jurnal internal tim</p><h2 id="office-learning-title">Percakapan karyawan</h2><p>Lihat pertukaran gagasan dan pelajaran yang benar-benar tersimpan dari sesi Hermes.</p></div>
      <div className="office-learning-actions">
        <button className="button button-primary" disabled={action.isPending || data.busy || !data.available || !data.enabled || data.sessionsToday >= data.dailyLimit || Boolean(data.nextRunAt && Date.parse(data.nextRunAt) > Date.now())} onClick={() => action.mutate('run')}>Mulai sesi</button>
        <button className="button button-secondary" disabled={action.isPending || !data.available} onClick={() => action.mutate(!data.enabled)}>{data.enabled ? 'Jeda belajar' : 'Aktifkan belajar'}</button>
      </div>
    </header>
    <div className="office-learning-status" role="status" aria-live="polite"><span className={`office-learning-indicator ${data.busy ? 'is-live' : ''}`} aria-hidden="true" /> <strong>{statusLabel}</strong><span>{data.reason}</span></div>
    <div className="office-learning-meta"><span>{data.sessionsToday}/{data.dailyLimit} sesi hari ini</span><span>{completed} selesai di hasil filter</span><span>{turns} tanggapan tersimpan</span>{data.nextRunAt && <span>Berikutnya {formatDate(data.nextRunAt)}</span>}</div>
    {action.isError && <ErrorNotice message={action.error.message} />}
    <label className="office-learning-filter" htmlFor="office-learning-employee">Tampilkan percakapan dari
      <select id="office-learning-employee" value={employee} onChange={event => setEmployee(event.target.value)}><option value="">Seluruh tim</option>{OFFICE_ROSTER.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
    </label>
    <div className="office-learning-columns">
      <div className="office-learning-journal"><div className="office-learning-section-heading"><h3>Jurnal percakapan</h3><span>{sessions.length} sesi</span></div>
        {sessions.length === 0 && <p className="office-learning-empty">Belum ada percakapan tersimpan untuk pilihan ini.</p>}
        {sessions.map((session, index) => <details className={`office-conversation conversation-${session.state}`} key={session.id} open={index === 0}>
          <summary><span className="office-conversation-title">{session.topic}</span><span className="office-conversation-info"><span>{session.participantIds.map(employeeName).join(' · ')}</span><span>{formatDate(session.startedAt)}</span><span className={`conversation-state state-${session.state}`}>{session.state === 'completed' ? 'Selesai' : session.state === 'failed' ? 'Gagal' : 'Berjalan'}</span></span></summary>
          <div className="office-conversation-body">
            {session.turns.length > 0 ? <ol className="office-turns">{session.turns.map((turn, turnIndex) => <li key={turnIndex}><strong>{employeeName(turn.employeeId)}</strong><p>{turn.message}</p></li>)}</ol> : <p className="office-learning-empty">Belum ada tanggapan Hermes.</p>}
            {session.error && <p className="office-conversation-error" role="alert">{session.error}</p>}
          </div>
        </details>)}
      </div>
      <aside className="office-learning-memory"><div className="office-learning-section-heading"><h3>Pelajaran tersimpan</h3><span>{memories.length}</span></div><p className="card-status-note">Catatan AI belum diverifikasi. Ingatan ini dibaca kembali pada sesi berikutnya; bukan fakta profil atau instruksi kerja.</p>
        {memories.length === 0 && <p className="office-learning-empty">Belum ada pelajaran tersimpan untuk pilihan ini.</p>}
        <ul className="office-memories">{memories.map(memory => <li key={`${memory.sessionId}-${memory.employeeId}`}><strong>{employeeName(memory.employeeId)}</strong><p>{memory.lesson}</p><small>{formatDate(memory.createdAt)}</small></li>)}</ul>
      </aside>
    </div>
  </section>;
}
