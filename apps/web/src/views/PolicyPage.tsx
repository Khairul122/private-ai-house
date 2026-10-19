import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, jsonRequest, type Autopilot, type Policy } from '../api/api.js';
import { PROJECTS_CO_ID_FIELDS, projectsCoIdSettings } from '@fvh/domain';
import { StateLabel, ErrorNotice, LoadingPanel, PageIntro, OperationStatus } from '../components/ui.js';
import { formatMoney, formatDate } from '../components/format.js';

/** Number input that keeps the raw text while typing, so clearing or typing "50" does not turn into "050". */
function NumField({ value, onChange, ...rest }: { value: number; onChange: (value: number) => void; min?: string; max?: string; step?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if (Number(text) !== value) setText(String(value)); }, [value]);
  return <input type="number" required {...rest} value={text} onChange={(event) => { setText(event.target.value); if (event.target.value !== '' && Number.isFinite(Number(event.target.value))) onChange(Number(event.target.value)); }} />;
}

export default function PolicyPage() {
  const queryClient = useQueryClient();
  const policyQuery = useQuery({ queryKey: ['policy'], queryFn: () => api<Policy>('/policy') });
  const autopilotQuery = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 30_000 });
  const [draft, setDraft] = useState<Policy | null>(null);
  const presets = useQuery({ queryKey: ['policy-presets'], queryFn: () => api<{ keywords: string[]; groups: Array<{ id: string; label: string; keywords: string[] }> }>('/policy/presets') });
  const [validityDays, setValidityDays] = useState(30);
  const [extendValidity, setExtendValidity] = useState(false);
  // Raw text of the comma lists, so a typed trailing comma/space is not stripped on every keystroke.
  const [listText, setListText] = useState<{ keywords?: string; noNegotiationTerms?: string; projectsKeywords?: string }>({});
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['policy'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['autopilot'] }),
  ]);
  const save = useMutation({
    mutationFn: (value: Policy) => api<Policy>('/policy', jsonRequest('PUT', {
      allowedActions: value.allowedActions,
      projectsCoId: projectsCoIdSettings(value),
      keywords: value.keywords,
      minimumConfidence: value.minimumConfidence,
      minPrice: value.minPrice,
      maxPrice: value.maxPrice,
      dailyBidLimit: value.dailyBidLimit,
      weeklyBidLimit: value.weeklyBidLimit,
      timezone: value.timezone,
      activeHours: value.activeHours,
      noNegotiationTerms: value.noNegotiationTerms,
      expectedVersion: value.version,
      activeDays: value.activeDays ?? [0, 1, 2, 3, 4, 5, 6],
      scanIntervalMinutes: value.scanIntervalMinutes ?? 15,
      allowUnknownDeadline: value.allowUnknownDeadline ?? false,
      maxRiskScore: value.maxRiskScore ?? 0.65,
      requireSpecializationMatch: value.requireSpecializationMatch ?? true,
      ...(extendValidity ? { validityDays } : {}),
    })),
    onSuccess: async (value) => { queryClient.setQueryData(['policy'], value); setDraft(null); setListText({}); setExtendValidity(false); setNotice({ text: `Kebijakan versi ${value.version} tersimpan di Supabase. ${value.state === 'paused' ? 'Automasi tetap dijeda.' : value.state === 'active' ? 'Berlaku pada pemeriksaan autopilot berikutnya.' : 'Periksa batas lalu aktifkan kebijakan.'}`, error: false }); await refresh(); },
    onError: (error) => setNotice({ text: error instanceof Error ? error.message : 'Policy tidak dapat disimpan.', error: true }),
  });
  const activate = useMutation({
    mutationFn: () => api<{ policy: Policy }>('/policy/activate', jsonRequest('POST', { mode: 'live', confirmLive: true })),
    onSuccess: async () => { setDraft(null); setListText({}); setNotice({ text: 'Bid live aktif dalam batas kebijakan tersimpan.', error: false }); await refresh(); },
    onError: (error) => setNotice({ text: error instanceof Error ? error.message : 'Policy tidak dapat diaktifkan.', error: true }),
  });
  const control = useMutation({
    mutationFn: (action: 'pause' | 'resume') => api<Policy>('/policy/' + action, jsonRequest('POST')),
    onSuccess: async () => { setDraft(null); setListText({}); await refresh(); },
  });
  if (policyQuery.isPending) return <LoadingPanel label="Membaca kebijakan autopilot..." />;
  if (policyQuery.isError) return <ErrorNotice message="Kebijakan belum dapat dimuat." onRetry={() => policyQuery.refetch()} />;
  const policy = draft ?? policyQuery.data;
  const projectsSettings = projectsCoIdSettings(policy);
  const setProjectsSettings = (patch: Partial<typeof projectsSettings>) => setDraft({ ...policy, projectsCoId: { ...projectsSettings, ...patch } });
  const autopilot = autopilotQuery.isError ? undefined : autopilotQuery.data;
  const setList = (key: 'keywords' | 'noNegotiationTerms', value: string) => { setListText({ ...listText, [key]: value }); setDraft({ ...policy, [key]: [...new Map(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean).map((item) => [item.toLowerCase(), item])).values()] }); };
  return <>
    <PageIntro eyebrow="Kebijakan" title="Atur batas autopilot." description="Atur cakupan pencarian, jadwal, dan batas keputusan. Perubahan kebijakan aktif berlaku pada pemeriksaan berikutnya; kebijakan dijeda tetap dijeda." action={<StateLabel state={policy.state} />} />
    {notice && (notice.error ? <ErrorNotice message={notice.text} /> : <div className="notice notice-success" role="status">{notice.text}</div>)}
    {control.isError && <ErrorNotice message={(control.error as Error).message} />}
    <div className="policy-summary-grid">
      <section className="form-card">
        <div className="section-heading"><div><p className="eyebrow">Editor policy</p><h2>Batas keputusan otomatis</h2></div><span>Versi {policy.version}</span></div>
        <p className="form-help">Bid otomatis mendukung proyek harga tetap dalam USD. Kata kunci memperluas pencarian; peluang tetap diperiksa menurut batas Anda dan kecocokan profil.</p>
        <form className="policy-form" onSubmit={(event) => { event.preventDefault(); save.mutate(policy); }}>
          <div className="form-grid form-grid-three">
            <label className="form-field"><span>Skor kecocokan minimum (%)</span><NumField min="0" max="100" step="1" value={Math.round(policy.minimumConfidence * 100)} onChange={(next) => setDraft({ ...policy, minimumConfidence: next / 100 })} /></label>
            <label className="form-field"><span>Harga minimum (USD)</span><NumField min="0" value={policy.minPrice} onChange={(next) => setDraft({ ...policy, minPrice: next })} /></label>
            <label className="form-field"><span>Harga maksimum (USD)</span><NumField min="0" value={policy.maxPrice} onChange={(next) => setDraft({ ...policy, maxPrice: next })} /></label>
            <label className="form-field"><span>Batas bid harian</span><NumField min="0" max="50" value={policy.dailyBidLimit} onChange={(next) => setDraft({ ...policy, dailyBidLimit: next })} /></label>
            <label className="form-field"><span>Batas bid mingguan</span><NumField min="0" max="200" value={policy.weeklyBidLimit} onChange={(next) => setDraft({ ...policy, weeklyBidLimit: next })} /></label>
            <label className="form-field"><span>Zona waktu</span><input value={policy.timezone} onChange={(event) => setDraft({ ...policy, timezone: event.target.value })} /></label>
            <label className="form-field"><span>Jam mulai</span><NumField min="0" max="23" value={policy.activeHours.start} onChange={(next) => setDraft({ ...policy, activeHours: { ...policy.activeHours, start: next } })} /></label>
            <label className="form-field"><span>Jam selesai (0–24)</span><NumField min="0" max="24" value={policy.activeHours.end} onChange={(next) => setDraft({ ...policy, activeHours: { ...policy.activeHours, end: next } })} /></label>
            <label className="form-field"><span>Interval pemindaian (menit)</span><NumField min="5" max="60" value={policy.scanIntervalMinutes ?? 15} onChange={(next) => setDraft({ ...policy, scanIntervalMinutes: next })} /></label>
            <label className="form-field"><span>Batas risiko maksimum (%)</span><NumField min="0" max="100" value={Math.round((policy.maxRiskScore ?? 0.65) * 100)} onChange={(next) => setDraft({ ...policy, maxRiskScore: next / 100 })} /></label>
          </div>
          <fieldset className="specialty-fieldset"><legend>Hari operasi</legend><div className="day-options">{['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((day, index) => <label className="check-row" key={day}><input type="checkbox" checked={(policy.activeDays ?? [0, 1, 2, 3, 4, 5, 6]).includes(index)} onChange={(event) => { const days = policy.activeDays ?? [0, 1, 2, 3, 4, 5, 6]; setDraft({ ...policy, activeDays: event.target.checked ? [...days, index].sort() : days.filter((item) => item !== index) }); }} /><span>{day}</span></label>)}</div><button className="button button-secondary" type="button" onClick={() => setDraft({ ...policy, activeDays: [0, 1, 2, 3, 4, 5, 6], activeHours: { start: 0, end: 24 } })}>Pilih operasi 24 jam, setiap hari</button><p className="form-help">Jam selesai lebih kecil dari jam mulai berarti melewati tengah malam.</p></fieldset>
          <label className="check-row"><input type="checkbox" checked={policy.allowedActions.includes('bid.submit')} onChange={(event) => setDraft({ ...policy, allowedActions: event.target.checked ? ['bid.submit'] : [] })} /><span>Izinkan pengiriman bid otomatis dalam batas kebijakan</span></label>
          <label className="check-row"><input type="checkbox" checked={policy.allowUnknownDeadline === true} onChange={(event) => setDraft({ ...policy, allowUnknownDeadline: event.target.checked })} /><span>Izinkan proyek tanpa waktu penutupan yang diketahui (durasi bid 14 hari)</span></label>
          <label className="check-row"><input type="checkbox" checked={policy.requireSpecializationMatch !== false} onChange={(event) => setDraft({ ...policy, requireSpecializationMatch: event.target.checked })} /><span>Wajib cocok dengan salah satu spesialisasi profil</span></label>
          <label className="form-field"><span>Kata kunci proyek ({policy.keywords.length}/300)</span><textarea rows={6} value={listText.keywords ?? policy.keywords.join(', ')} onChange={(event) => setList('keywords', event.target.value)} placeholder="Python, Laravel, API" /><small>Pisahkan dengan koma atau baris baru. Minimal satu kata cocok; kosong berarti tanpa filter kata kunci.</small></label>
          <details className="keyword-catalog"><summary>Tambahkan katalog coding</summary>{presets.isError ? <ErrorNotice message="Katalog tidak dapat dimuat." onRetry={() => presets.refetch()} /> : <><p className="form-help">Pilih bidang yang relevan atau seluruh katalog. Kata kunci tidak menambahkan klaim keahlian ke profil.</p><div className="form-actions"><button className="button button-secondary" type="button" disabled={!presets.data} onClick={() => setList('keywords', [...policy.keywords, ...(presets.data?.keywords ?? [])].join(', '))}>Tambahkan seluruh katalog ({presets.data?.keywords.length ?? '…'})</button>{presets.data?.groups.map((group) => <button className="button button-secondary" type="button" key={group.id} onClick={() => setList('keywords', [...policy.keywords, ...group.keywords].join(', '))}>{group.label} ({group.keywords.length})</button>)}</div></>}</details>
          <label className="form-field"><span>Istilah non-negosiasi</span><input value={listText.noNegotiationTerms ?? policy.noNegotiationTerms.join(', ')} onChange={(event) => setList('noNegotiationTerms', event.target.value)} placeholder="pembayaran di muka, onsite" /></label>
          <fieldset className="projects-policy-fields" id="projects-co-id-policy"><legend>projects.co.id: pencarian dan draf lokal dalam Rupiah</legend>
            <p className="form-help">Akun {projectsSettings.username}. Mode diatur di <Link to="/projects-co-id">kartu projects.co.id</Link>. Kuota ini membatasi draf otomatis, terpisah dari bid Freelancer. Menyimpan tidak mengubah status aktif atau jeda kebijakan.</p>
            <div className="form-grid">
              <label className="form-field"><span>Harga minimum IDR</span><NumField min="1" step="1000" value={projectsSettings.minPrice} onChange={value => setProjectsSettings({ minPrice: value })} /></label>
              <label className="form-field"><span>Harga maksimum IDR</span><NumField min="1" step="1000" value={projectsSettings.maxPrice} onChange={value => setProjectsSettings({ maxPrice: value })} /></label>
              <label className="form-field"><span>Draf otomatis / hari</span><NumField min="0" max="50" value={projectsSettings.dailyBidLimit} onChange={value => setProjectsSettings({ dailyBidLimit: value })} /></label>
              <label className="form-field"><span>Draf otomatis / minggu</span><NumField min="0" max="200" value={projectsSettings.weeklyBidLimit} onChange={value => setProjectsSettings({ weeklyBidLimit: value })} /></label>
              <label className="form-field"><span>Skor minimum untuk draf (%)</span><NumField min="0" max="100" step="1" value={projectsSettings.minimumScore} onChange={value => setProjectsSettings({ minimumScore: value })} /></label>
            </div>
            <fieldset className="projects-field-options"><legend>Bidang yang dicari</legend>
              <p className="form-help">Setiap bidang menambah istilah pencarian di projects.co.id. Tanpa bidang, kata kunci dan skill profil, Scout membaca daftar proyek terbaru.</p>
              {PROJECTS_CO_ID_FIELDS.map(field => <label className="check-row" key={field.id}><input type="checkbox" checked={projectsSettings.fields.includes(field.id)} onChange={event => setProjectsSettings({ fields: event.target.checked ? [...projectsSettings.fields, field.id] : projectsSettings.fields.filter(id => id !== field.id) })} /><span>{field.label} <small>({field.terms.join(', ')})</small></span></label>)}
            </fieldset>
            <label className="form-field"><span>Kata kunci tambahan projects.co.id ({projectsSettings.keywords.length}/20)</span><textarea rows={3} value={listText.projectsKeywords ?? projectsSettings.keywords.join(', ')} onChange={event => { setListText({ ...listText, projectsKeywords: event.target.value }); setProjectsSettings({ keywords: [...new Map(event.target.value.split(/[,\n]/).map(item => item.trim()).filter(Boolean).map(item => [item.toLowerCase(), item])).values()] }); }} placeholder="Laravel, scraping, dashboard" /><small>Huruf, angka, spasi dan . + # / - saja; maksimal 40 karakter per kata kunci.</small></label>
            <label className="check-row"><input type="checkbox" checked={projectsSettings.useProfileSkills} onChange={event => setProjectsSettings({ useProfileSkills: event.target.checked })} /><span>Pakai spesialisasi <Link to="/profile">Profil</Link> sebagai pencarian ({policy.specializations.join(', ') || 'belum ada'})</span></label>
            <p className="form-help">Setiap pemindaian membuka paling banyak tiga pencarian; istilah lain dipakai bergiliran pada pemindaian berikutnya.</p>
          </fieldset>
          <label className="check-row"><input type="checkbox" checked={extendValidity} onChange={(event) => setExtendValidity(event.target.checked)} /><span>Perbarui masa berlaku saat disimpan</span></label>{extendValidity && <label className="form-field"><span>Berlaku sejak sekarang (hari)</span><NumField min="1" max="365" value={validityDays} onChange={setValidityDays} /></label>}
          <div className="form-actions"><button className="button button-primary" type="submit" disabled={(!draft && !extendValidity) || save.isPending}>{save.isPending ? 'Menyimpan...' : 'Simpan kebijakan ke Supabase'}</button>{(policy.state === 'draft' || policy.simulationOnly) && <button className="button button-primary" type="button" disabled={activate.isPending || policy.state === 'paused' || !!draft} onClick={() => activate.mutate()}>Aktifkan bid live sesuai batas tersimpan</button>}{(draft || extendValidity) && <button className="button button-text" type="button" onClick={() => { setDraft(null); setListText({}); setExtendValidity(false); }}>Batalkan perubahan</button>}</div>
        </form>
      </section>
      <section className="form-card">
        <div className="section-heading"><div><p className="eyebrow">Operasi berjalan</p><h2>{autopilotQuery.isError ? 'Status operasi tidak tersedia.' : autopilot?.lastMessage ?? 'Memuat status dari server.'}</h2></div><StateLabel state={autopilot?.state ?? 'unknown'} /></div>
        <div className="policy-facts"><div><span>Spesialisasi</span><strong>{policy.specializations.join(', ') || 'Menunggu profil Freelancer'}</strong></div><div><span>Rentang penawaran</span><strong>{formatMoney(policy.minPrice, 'USD')} – {formatMoney(policy.maxPrice, 'USD')}</strong></div><div><span>Batas harian / mingguan</span><strong>{policy.dailyBidLimit} / {policy.weeklyBidLimit}</strong></div><div><span>Berlaku sampai</span><strong>{formatDate(policy.expiresAt)}</strong></div></div>
        <div className="form-actions">{policy.state === 'paused' ? <button className="button button-primary" type="button" disabled={control.isPending || policy.simulationOnly} onClick={() => control.mutate('resume')}>Lanjutkan autopilot</button> : <button className="button button-secondary" type="button" disabled={control.isPending || policy.state !== 'active'} onClick={() => control.mutate('pause')}>Jeda darurat</button>}<span>{policy.simulationOnly ? 'Mode simulasi lokal.' : 'Bid live mengikuti policy tersimpan.'}</span></div>
      </section>
    </div>
    <OperationStatus data={autopilot} unavailable={autopilotQuery.isError} />
  </>;
}
