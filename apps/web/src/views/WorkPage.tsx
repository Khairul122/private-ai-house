import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, jsonRequest, type ClientProject, type Profile, type Work } from '../api/api.js';
import { EmptyState, ErrorNotice, LoadingPanel, Metric, PageIntro, StateLabel } from '../components/ui.js';
import { formatMoney, deadlineLabel } from '../components/format.js';

const SOURCE_LABELS: Record<ClientProject['source'], string> = { freelancer: 'Freelancer', direct: 'Langsung', linkedin: 'LinkedIn', projects_co_id: 'projects.co.id', other: 'Lainnya' };
const CURRENCY_CODE = /^[A-Z]{3}$/;
const validCurrency = (value: string) => CURRENCY_CODE.test(value.trim().toUpperCase());
const valueOrDash = (value: number | null, currency: string) => value === null ? '–' : formatMoney(value, currency);

export default function WorkPage() {
  const queryClient = useQueryClient();
  const work = useQuery({ queryKey: ['work'], queryFn: () => api<Work>('/work'), refetchInterval: 10_000 });
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/profile'), refetchInterval: 30_000 });
  const profileCurrency = !profile.isError && profile.data && validCurrency(profile.data.currency) ? profile.data.currency : null;
  const [project, setProject] = useState({ title: '', client: '', source: 'direct' as ClientProject['source'], deadline: '', value: '', currency: '' });
  const [payment, setPayment] = useState({ projectId: '', amount: '', currency: '', status: 'expected' as 'expected' | 'received', dueDate: '', note: '' });
  const [formsOpen, setFormsOpen] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['work'] });
  const createProject = useMutation({
    mutationFn: () => api<ClientProject>('/work/projects', jsonRequest('POST', {
      title: project.title, client: project.client, source: project.source, deadline: project.deadline || null,
      value: project.value === '' ? null : Number(project.value), currency: project.currency.trim().toUpperCase(),
    })),
    onSuccess: async () => { setProject({ title: '', client: '', source: 'direct', deadline: '', value: '', currency: '' }); await refresh(); },
  });
  const updateProject = useMutation({ mutationFn: ({ id, status }: { id: string; status: ClientProject['status'] }) => api(`/work/projects/${encodeURIComponent(id)}`, jsonRequest('PUT', { status })), onSuccess: refresh });
  const recordPayment = useMutation({
    mutationFn: () => api('/work/payments', jsonRequest('POST', {
      projectId: payment.projectId, amount: Number(payment.amount), currency: payment.currency.trim().toUpperCase(),
      status: payment.status, dueDate: payment.dueDate || null, note: payment.note,
    })),
    onSuccess: async () => { setPayment({ projectId: '', amount: '', currency: '', status: 'expected', dueDate: '', note: '' }); await refresh(); },
  });
  const markReceived = useMutation({ mutationFn: (id: string) => api(`/work/payments/${encodeURIComponent(id)}/received`, jsonRequest('POST')), onSuccess: refresh });

  if (work.isPending) return <LoadingPanel label="Memuat proyek dan pendapatan..." />;
  if (work.isError) return <ErrorNotice message="Data proyek belum dapat dimuat." onRetry={() => work.refetch()} />;
  const { projects, payments, income, dueSoon } = work.data;
  const active = projects.filter((item) => item.status === 'active');
  const finished = projects.filter((item) => item.status !== 'active');
  const titles = new Map(projects.map((item) => [item.id, item.title]));
  const pendingPayments = payments.filter((item) => item.status === 'expected');
  const money = (rows: Array<{ currency: string; total: number }>) => rows.length ? rows.map((row) => formatMoney(row.total, row.currency)).join(' · ') : '–';
  const noProjects = projects.length === 0;

  return <>
    <PageIntro eyebrow="Proyek berjalan" title="Proyek & pendapatan" description="Fokus utama: uang yang belum masuk dan tenggat terdekat. Nilai tidak dijumlahkan lintas mata uang." />
    <section className="card-summary-grid" aria-label="Ringkasan proyek dan pendapatan">
      <Metric label="Menunggu pembayaran" value={money(income.expected)} note={`${pendingPayments.length} pembayaran tercatat, per mata uang`} tone="primary" />
      <Metric label="Tenggat ≤ 2 hari" value={dueSoon} note="Proyek aktif dengan tenggat dekat" />
      <Metric label={`Diterima ${income.month}`} value={money(income.received)} note="Per mata uang, tidak dijumlahkan lintas kurs" />
      <Metric label="Proyek aktif" value={active.length} note={`${finished.length} selesai atau ditutup`} />
    </section>

    <div className="card-toolbar">
      <p className="form-help" role="status" aria-live="polite">Data layar diperbarui {new Date(work.dataUpdatedAt).toLocaleString('id-ID')}{work.isFetching ? '. Memperbarui...' : '.'}</p>
      <button type="button" className="button button-secondary" disabled={work.isFetching} onClick={() => void work.refetch()}>{work.isFetching ? 'Memperbarui...' : 'Perbarui proyek'}</button>
    </div>

    <section className="activity-preview card-section" aria-labelledby="active-projects-title">
      <div className="section-heading">
        <div><p className="eyebrow">Proyek yang tercatat</p><h2 id="active-projects-title">Proyek aktif ({active.length})</h2></div>
        <button type="button" className="button button-secondary" onClick={() => setFormsOpen(true)}>Tambah proyek</button>
      </div>
      {updateProject.isError && <ErrorNotice message={updateProject.error.message} onRetry={() => { const variables = updateProject.variables; if (variables) updateProject.mutate(variables); }} />}
      {active.length ? <ul className="deadlines-list">{active.map((item) => <li className="deadline-item" key={item.id}>
        <div><strong>{item.title}</strong><div className="item-sub">{item.client} · {SOURCE_LABELS[item.source]} · {valueOrDash(item.value, item.currency)}</div></div>
        <div className="item-aside">
          <strong className={item.daysToDeadline !== null && item.daysToDeadline <= 2 ? 'is-late' : ''}>{deadlineLabel(item.daysToDeadline)}</strong>
          <span className="item-actions">
            <button type="button" className="button button-secondary" disabled={updateProject.isPending} onClick={() => { if (window.confirm(`Tandai proyek "${item.title}" sudah terkirim?`)) updateProject.mutate({ id: item.id, status: 'delivered' }); }}>Tandai terkirim</button>
            <button type="button" className="button button-secondary" disabled={updateProject.isPending} onClick={() => { if (window.confirm(`Tutup proyek "${item.title}"? Proyek ditutup tanpa menandai pengiriman.`)) updateProject.mutate({ id: item.id, status: 'closed' }); }}>Tutup</button>
          </span>
        </div>
      </li>)}</ul>
        : <EmptyState title={noProjects ? 'Belum ada proyek tercatat' : 'Tidak ada proyek aktif'} description={noProjects ? 'Proyek Freelancer yang menang masuk otomatis. Proyek dari sumber lain dicatat manual.' : 'Semua proyek sudah ditandai terkirim atau ditutup.'} action={<button type="button" className="button button-secondary" onClick={() => setFormsOpen(true)}>Tambah proyek</button>} />}
      {finished.length > 0 && <details className="card-disclosure"><summary>Selesai atau ditutup ({finished.length})</summary><ul className="deadlines-list">{finished.map((item) => <li className="deadline-item" key={item.id}><div>{item.title}<div className="item-sub">{item.client} · {item.status === 'delivered' ? 'Terkirim' : 'Ditutup'} · {valueOrDash(item.value, item.currency)}</div></div></li>)}</ul></details>}
    </section>

    <section className="activity-preview card-section" aria-labelledby="payments-title">
      <div className="section-heading"><div><p className="eyebrow">Belum diterima</p><h2 id="payments-title">Pembayaran tertunda ({pendingPayments.length})</h2></div></div>
      {markReceived.isError && <ErrorNotice message={markReceived.error.message} onRetry={() => { const variables = markReceived.variables; if (variables) markReceived.mutate(variables); }} />}
      {pendingPayments.length ? <ul className="deadlines-list invoice-list">{pendingPayments.map((item) => <li className="deadline-item invoice-card" key={item.id}>
        <div><div className="invoice-meta"><span className="invoice-id">ID: {item.id}</span><span className="invoice-status"><StateLabel state={item.status === 'expected' ? 'active' : 'won'} /> {item.status === 'expected' ? 'Menunggu' : 'Diterima'}</span></div><strong className="invoice-amount">{formatMoney(item.amount, item.currency)}</strong><div className="item-sub invoice-project">{titles.get(item.projectId) ?? 'Proyek tidak ditemukan'}{item.dueDate ? ` · jatuh tempo ${item.dueDate}` : ' · tanpa jatuh tempo'}{item.note ? ` · ${item.note}` : ''}</div><small className="invoice-due">{item.dueDate ? `Jatuh tempo: ${item.dueDate}` : 'Tanpa jatuh tempo'}</small></div>
        <button type="button" className="button button-secondary invoice-action" disabled={markReceived.isPending} onClick={() => { if (window.confirm(`Tandai pembayaran ${formatMoney(item.amount, item.currency)} sudah diterima?`)) markReceived.mutate(item.id); }}>Tandai diterima</button>
      </li>)}</ul>
        : <EmptyState title="Belum ada pembayaran tertunda" description={payments.length ? 'Semua pembayaran yang tercatat sudah ditandai diterima.' : 'Pembayaran muncul setelah dicatat di formulir bawah.'} action={<button type="button" className="button button-secondary" onClick={() => setFormsOpen(true)}>Catat pembayaran</button>} />}
    </section>

    <details className="card-disclosure" open={formsOpen} onToggle={(event) => setFormsOpen(event.currentTarget.open)}><summary>Tambah proyek atau catat pembayaran</summary>
    <p className="form-help">Proyek Freelancer yang menang masuk otomatis. Catat proyek dari sumber lain dan pembayaran nyata di sini.</p>
    <div className="form-section">
      <form className="form-card" onSubmit={(event) => { event.preventDefault(); createProject.mutate(); }}>
        <div className="section-heading"><div><p className="eyebrow">Klien langsung, LinkedIn, atau lainnya</p><h2>Tambah proyek</h2></div></div>
        {createProject.isError && <ErrorNotice message={createProject.error.message} onRetry={() => createProject.reset()} />}
        <div className="form-grid">
          <label className="form-field"><span>Judul proyek</span><input required maxLength={150} value={project.title} onChange={(event) => setProject({ ...project, title: event.target.value })} /></label>
          <label className="form-field"><span>Klien</span><input required maxLength={120} value={project.client} onChange={(event) => setProject({ ...project, client: event.target.value })} /></label>
          <label className="form-field"><span>Sumber</span><select value={project.source} onChange={(event) => setProject({ ...project, source: event.target.value as ClientProject['source'] })}>{Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="form-field"><span>Tenggat</span><input type="date" value={project.deadline} onChange={(event) => setProject({ ...project, deadline: event.target.value })} /></label>
          <label className="form-field"><span>Nilai proyek</span><input type="number" min="0" step="any" placeholder="Kosongkan bila belum ada nilai" value={project.value} onChange={(event) => setProject({ ...project, value: event.target.value })} /></label>
          <label className="form-field"><span>Mata uang</span><input required maxLength={3} placeholder="Mata uang" aria-describedby="project-currency-help" value={project.currency} onChange={(event) => setProject({ ...project, currency: event.target.value.toUpperCase() })} /></label>
        </div>
        <p className="form-help" id="project-currency-help">{profileCurrency ? `Kode 3 huruf. Mata uang profil saat ini: ${profileCurrency}.` : 'Kode 3 huruf, misalnya IDR atau USD. Mata uang profil tidak diketahui, jadi isi manual.'}</p>
        <div className="form-actions"><button type="submit" className="button button-primary" disabled={createProject.isPending || !validCurrency(project.currency)}>Simpan proyek</button></div>
      </form>

      <form className="form-card" onSubmit={(event) => { event.preventDefault(); recordPayment.mutate(); }}>
        <div className="section-heading"><div><p className="eyebrow">Pemasukan</p><h2>Catat pembayaran</h2></div></div>
        {recordPayment.isError && <ErrorNotice message={recordPayment.error.message} onRetry={() => recordPayment.reset()} />}
        {projects.length ? <>
          <div className="form-grid">
            <label className="form-field"><span>Proyek</span><select required value={payment.projectId} onChange={(event) => { const selected = projects.find((item) => item.id === event.target.value); setPayment({ ...payment, projectId: event.target.value, currency: selected?.currency ?? '' }); }}><option value="">Pilih proyek</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label className="form-field"><span>Jumlah</span><input required type="number" min="0" step="any" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} /></label>
            <label className="form-field"><span>Mata uang</span><input required maxLength={3} placeholder="Mata uang" aria-describedby="payment-currency-help" value={payment.currency} onChange={(event) => setPayment({ ...payment, currency: event.target.value.toUpperCase() })} /></label>
            <label className="form-field"><span>Status</span><select value={payment.status} onChange={(event) => setPayment({ ...payment, status: event.target.value as 'expected' | 'received' })}><option value="expected">Menunggu</option><option value="received">Sudah diterima</option></select></label>
            <label className="form-field"><span>Jatuh tempo</span><input type="date" value={payment.dueDate} onChange={(event) => setPayment({ ...payment, dueDate: event.target.value })} /></label>
            <label className="form-field"><span>Catatan</span><input maxLength={200} value={payment.note} onChange={(event) => setPayment({ ...payment, note: event.target.value })} /></label>
          </div>
          <p className="form-help" id="payment-currency-help">Mata uang terisi dari proyek terpilih. Ubah hanya bila pembayaran memakai mata uang lain.</p>
          <div className="form-actions"><button type="submit" className="button button-primary" disabled={recordPayment.isPending || !validCurrency(payment.currency)}>Simpan pembayaran</button></div>
        </> : <EmptyState title="Belum ada proyek untuk pembayaran" description="Pembayaran selalu terikat ke proyek. Tambahkan proyek lebih dulu di formulir atas." />}
      </form>
    </div>
    </details>
  </>;
}
