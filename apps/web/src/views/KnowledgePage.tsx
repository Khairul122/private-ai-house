import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, jsonRequest, type Capabilities } from '../api/api.js';
import { ErrorNotice, LoadingPanel, PageIntro, Metric } from '../components/ui.js';
import { formatDate } from '../components/format.js';

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const knowledge = useQuery({ queryKey: ['knowledge'], queryFn: () => api<{ sources: Array<{ id: string; provider: string; label: string; referenceUrl: string; updatedAt: string; chunkCount: number }>; coverage: { sources: number; chunks: number } }>('/knowledge'), refetchInterval: 30_000 });
  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: () => api<Capabilities>('/capabilities'), refetchInterval: 30_000 });
  type SyncJob = { id: string; provider: string; state: string; startedAt: string; finishedAt: string | null; current: string | null; total: number; completed: number; chunks: number; results: Array<{ label: string; chunks: number; error: string | null; note?: string }>; error: string | null };
  const syncStatus = useQuery({ queryKey: ['knowledge-sync'], queryFn: () => api<{ job: SyncJob | null }>('/knowledge/sync-status'), refetchInterval: (query) => query.state.data?.job?.state === 'running' ? 2_000 : 10_000 });
  const job = syncStatus.isError ? null : syncStatus.data?.job;
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sourceSearch, setSourceSearch] = useState('');
  useEffect(() => { if (job && job.state !== 'running') { queryClient.invalidateQueries({ queryKey: ['knowledge'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['activity'] }); } }, [job?.id, job?.state]);
  const [provider, setProvider] = useState<'manual' | 'linkedin'>('manual');
  const [label, setLabel] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [sourceRef, setSourceRef] = useState('user-import');
  const [files, setFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [repo, setRepo] = useState('');
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<Array<{ label: string; path: string; url: string; content: string }>>([]);
  const [searched, setSearched] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length > 30 || selected.some((file) => file.size > 100_000 || !/\.(md|txt|csv|json)$/i.test(file.name))) { setFiles([]); setNotice({ text: 'Pilih maksimal 30 berkas teks, masing-masing maksimal 100 KB (.md, .txt, .csv, .json).', error: true }); event.target.value = ''; return; }
    try {
      setFiles(await Promise.all(selected.map(async (file) => ({ path: file.name, content: await file.text() }))));
      if (selected.length) setLabel((current) => current || (selected.length === 1 ? selected[0]?.name.replace(/\.[^.]+$/, '') || '' : `${selected.length} berkas pilihan`));
    } catch { setFiles([]); setNotice({ text: 'Berkas tidak dapat dibaca. Pilih ulang berkas Anda.', error: true }); }
  };
  const runImport = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const result = await api<{ chunks: number; rejected: Array<{ path: string; reason: string }> }>('/knowledge/import', jsonRequest('POST', { provider, label, referenceUrl, sourceRef, files }));
      setNotice({ text: `${result.chunks} potongan aman ditambahkan. ${result.rejected.length} berkas dikecualikan.`, error: false }); setFiles([]); setLabel('');
      queryClient.invalidateQueries({ queryKey: ['knowledge'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['activity'] });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Impor gagal.', error: true }); }
    finally { setBusy(false); }
  };
  const startSync = async (provider: 'github' | 'linkedin', repository?: string) => {
    setBusy(true); setNotice(null);
    try {
      const result = await api<{ job: SyncJob }>('/knowledge/sync', jsonRequest('POST', { provider, ...(repository ? { repository } : {}) }));
      queryClient.setQueryData(['knowledge-sync'], result);
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Sinkronisasi gagal.', error: true }); }
    finally { setBusy(false); }
  };
  const syncGitHub = (event: FormEvent) => { event.preventDefault(); void startSync('github', repo.trim()); };
  const syncAllGitHub = () => startSync('github');
  const search = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setResults([]); setSearched(false); setNotice(null);
    try { const nextResults = await api<Array<{ label: string; path: string; url: string; content: string }>>('/knowledge/search', jsonRequest('POST', { query: queryText, limit: 6 })); setResults(nextResults); setSearched(true); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Pencarian gagal.', error: true }); }
    finally { setBusy(false); }
  };
  const removeSource = async (id: string) => {
    if (!window.confirm('Hapus sumber dan semua potongan indeks terkait?')) return;
    try { await api(`/knowledge/sources/${encodeURIComponent(id)}`, { method: 'DELETE' }); setNotice({ text: 'Sumber dan indeks terkait dihapus.', error: false }); queryClient.invalidateQueries({ queryKey: ['knowledge'] }); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Sumber tidak dapat dihapus.', error: true }); }
  };

  if (knowledge.isPending) return <LoadingPanel label="Membuka knowledge hub lokal..." />;
  if (knowledge.isError) return <ErrorNotice message="Status knowledge hub belum dapat dimuat." onRetry={() => knowledge.refetch()} />;
  const syncing = busy || job?.state === 'running';
  const sources = knowledge.data.sources.filter((source) => (sourceFilter === 'all' || source.provider === sourceFilter) && source.label.toLowerCase().includes(sourceSearch.toLowerCase()));
  return <>
    <PageIntro eyebrow="Knowledge Hub" title="Bukti kerja untuk proposal" description="Cari bukti yang tersimpan, periksa sumbernya, atau tambahkan berkas dan repositori." />
    {notice && (notice.error ? <ErrorNotice message={notice.text} /> : <div className="notice notice-success" role="status">{notice.text}</div>)}
<div className="card-summary-grid"><Metric label="Sumber terindeks" value={knowledge.data.coverage.sources} note="Berkas, profil dan repositori tersimpan" /><Metric label="Potongan bukti" value={knowledge.data.coverage.chunks} note="Dapat ditemukan dan dipakai dalam draf" /></div>
    {syncStatus.isError && <ErrorNotice message="Progres sinkronisasi tidak dapat dimuat." onRetry={() => syncStatus.refetch()} />}
    {job && <section className="form-card" aria-live="polite">
      <h2>{job.provider === 'github' ? 'GitHub' : 'LinkedIn'}: {job.state === 'running' ? 'sinkronisasi berjalan' : job.state === 'completed' ? 'sinkronisasi selesai' : 'sinkronisasi memerlukan perhatian'}</h2>
      <p>{job.completed}/{job.total || '…'} sumber diproses, {job.chunks} potongan tersimpan. {job.current}</p>
      {job.state === 'running' && <progress aria-label="Progres sinkronisasi" max={Math.max(1, job.total)} value={job.completed} />}
      {job.error && <p className="is-late">{job.error}</p>}
      <small>Mulai {formatDate(job.startedAt)}{job.finishedAt ? `, selesai ${formatDate(job.finishedAt)}` : ''}</small>
      {job.results.length > 0 && <details><summary>Hasil per sumber ({job.results.filter((item) => item.chunks > 0).length} diindeks, {job.results.filter((item) => !item.error && item.chunks === 0).length} dilewati)</summary><ul className="sync-results">{job.results.map((result) => <li key={result.label}><strong>{result.label}</strong><span>{result.error ?? `${result.chunks} potongan tersimpan`}{result.note && <small>{result.note}</small>}</span></li>)}</ul></details>}
    </section>}
    <section className="form-card search-section"><div className="section-heading"><div><p className="eyebrow">Cari bukti</p><h2>Temukan bukti yang relevan</h2></div></div><form className="search-inline" onSubmit={search}><label className="form-field"><span>Kata atau frasa</span><input value={queryText} onChange={(event) => setQueryText(event.target.value)} minLength={2} placeholder="Misalnya: cursor pagination" /></label><button type="submit" className="button button-primary" disabled={busy || queryText.trim().length < 2}>Cari di knowledge hub</button></form>
      {results.length > 0 ? <div className="search-results" aria-live="polite">{results.map((result, index) => <article key={`${result.path}-${index}`}><div><strong>{result.label} / {result.path}</strong>{result.url.startsWith('https://') ? <a href={result.url} target="_blank" rel="noreferrer">Buka sumber bukti</a> : <span className="local-reference">Sumber lokal</span>}</div><p>{result.content}</p></article>)}</div> : <p className="form-help" role="status">{busy ? 'Mencari di indeks…' : searched ? 'Tidak ada hasil untuk pencarian ini. Coba kata yang lebih umum atau tambahkan sumber baru.' : 'Hasil pencarian menampilkan potongan teks dan sumbernya, bukan seluruh dokumen.'}</p>}
    </section>
    <details className="card-disclosure"><summary>Tambahkan sumber · impor berkas atau sinkronkan akun</summary>
    <div className="knowledge-grid">
      <section className="form-card"><div className="section-heading"><div><p className="eyebrow">Pilih cakupan</p><h2>Impor berkas teks</h2></div></div>
        <form className="stack-form" onSubmit={runImport}>
          <label className="form-field"><span>Asal berkas</span><select value={provider} onChange={(event) => setProvider(event.target.value as 'manual' | 'linkedin')}><option value="manual">Catatan milik saya</option><option value="linkedin">Ekspor LinkedIn milik saya</option></select></label>
          <label className="form-field"><span>Nama sumber</span><input value={label} required onChange={(event) => setLabel(event.target.value)} placeholder="Misalnya, profil dan portofolio" /></label>
          <label className="form-field"><span>URL sumber, bila tersedia</span><input type="url" value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="https://..." /></label>
          <label className="form-field"><span>Versi atau catatan asal</span><input value={sourceRef} onChange={(event) => setSourceRef(event.target.value)} placeholder="Ekspor Oktober 2026" /></label>
          <label className="form-field file-field"><span>Berkas .md, .txt, .csv, atau .json</span><input type="file" accept=".md,.txt,.csv,.json" multiple onChange={importFiles} /><small>{files.length ? `${files.length} berkas dipilih` : 'Ukuran maksimal 100 KB per berkas. Arsip dan berkas biner tidak diterima.'}</small></label>
          <button className="button button-primary" type="submit" disabled={busy || files.length === 0 || !label.trim()}>{busy ? 'Memproses...' : 'Tambahkan berkas ke indeks'}</button>
        </form>
      </section>
      <section className="form-card"><div className="section-heading"><div><p className="eyebrow">Read-only API</p><h2>Sinkronkan repositori GitHub</h2></div></div>
        <p className="form-help">Pilih satu repositori. Aplikasi memakai Contents: read dan tidak mengubah isi. Token privat, bila dipakai, dibaca server dari konfigurasi dan tidak dikirim ke browser.</p>
        <form className="stack-form" onSubmit={syncGitHub}><label className="form-field"><span>Repositori pemilik/nama</span><input value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="pemilik/nama-repositori" required pattern="[A-Za-z0-9-]+/[A-Za-z0-9_.-]+" /></label><div className="provider-status">Token server: {capabilities.isError ? 'Tidak diketahui' : capabilities.isPending ? 'Memuat…' : capabilities.data?.github.tokenConfigured ? 'tersedia' : 'tidak diatur, hanya repositori publik'}</div><button className="button button-secondary" type="submit" disabled={syncing || repo.trim().length < 3}>Baca repositori pilihan</button></form>
        <div className="form-actions"><button className="button button-primary" type="button" disabled={syncing || capabilities.isError || !capabilities.data?.github.tokenConfigured} onClick={syncAllGitHub}>Sinkronkan semua repo saya</button><small className="form-help">Maksimal 50 repo terbaru milik Anda, kecuali fork/arsip, dan 100 berkas teks per repo. Sinkron ulang mengganti sumber secara atomik.</small></div>
        <div className="provider-limit"><h3>Sinkronisasi LinkedIn API</h3><p>Ambil nama, foto, bahasa, dan email yang diizinkan dari /userinfo. Pembaruan mengganti sumber profil API tanpa duplikat.</p><button className="button button-primary" type="button" disabled={syncing || capabilities.isError || !capabilities.data?.linkedin.authorized} onClick={() => startSync('linkedin')}>Sinkronkan profil LinkedIn</button><Link className="button button-text" to="/capabilities">Kelola koneksi LinkedIn</Link></div>
        <details className="card-disclosure"><summary>Impor riwayat kerja dan skill LinkedIn</summary><p>API LinkedIn tidak memberi akses ke riwayat kerja atau skill. Di LinkedIn buka Settings → Data privacy → Get a copy of your data, unduh arsipnya, ekstrak, lalu pada form “Impor berkas teks” pilih asal “Ekspor LinkedIn milik saya” dan unggah Profile.csv, Positions.csv, Skills.csv, Education.csv, Projects.csv, serta Certifications.csv.</p></details>
      </section>
    </div>
    </details>
    <section className="form-card source-section"><div className="section-heading"><div><p className="eyebrow">Sumber dan pembaruan</p><h2>Sumber terindeks</h2></div></div>
      <div className="form-grid"><label className="form-field"><span>Filter penyedia</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">Semua sumber</option><option value="github">GitHub</option><option value="linkedin">LinkedIn</option><option value="manual">Manual</option></select></label><label className="form-field"><span>Cari nama sumber</span><input type="search" value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} /></label></div><p className="form-help" role="status">{sources.length} dari {knowledge.data.sources.length} sumber · diperbarui {new Date(knowledge.dataUpdatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>
      {sources.length === 0 ? <div className="empty-state"><h3>{knowledge.data.sources.length === 0 ? 'Belum ada sumber terindeks' : 'Tidak ada sumber yang ditampilkan'}</h3><p>{knowledge.data.sources.length === 0 ? 'Tambahkan berkas teks atau sinkronkan repositori GitHub dari bagian di atas.' : 'Ubah filter penyedia atau kata pencarian.'}</p></div> : <div className="source-list">{sources.map((source) => <article key={source.id} className="source-row source-card"><div><span className="source-provider">{source.provider}</span><h3>{source.label}</h3><p>{source.chunkCount} potongan / diperbarui {formatDate(source.updatedAt)}</p>{source.referenceUrl && source.referenceUrl.startsWith('https://') && <a href={source.referenceUrl} target="_blank" rel="noreferrer">Buka sumber</a>}</div><div className="source-actions">{source.provider === 'github' && <button className="button button-secondary" type="button" disabled={syncing} onClick={() => startSync('github', source.label)}>Sinkron ulang</button>}<button className="button button-text" type="button" disabled={syncing} onClick={() => removeSource(source.id)}>Hapus sumber</button></div></article>)}</div>}
    </section>
  </>;
}
