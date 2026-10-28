import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, jsonRequest, type Autopilot, type Policy } from '../api/api.js';
import { PROJECTS_CO_ID_FIELDS, projectsCoIdSettings } from '@fvh/domain';
import { StateLabel, ErrorNotice, LoadingPanel, PageIntro, OperationStatus, FormActionBar, FormField, NumField, extractFieldErrors } from '../components/ui.js';
import { formatMoney, formatDate } from '../components/format.js';

export default function PolicyPage() {
  const queryClient = useQueryClient();
  const policyQuery = useQuery({ queryKey: ['policy'], queryFn: () => api<Policy>('/policy'), refetchInterval: 30_000 });
  const autopilotQuery = useQuery({ queryKey: ['autopilot'], queryFn: () => api<Autopilot>('/autopilot'), refetchInterval: 10_000 });
  const [draft, setDraft] = useState<Policy | null>(null);
  const presets = useQuery({ queryKey: ['policy-presets'], queryFn: () => api<{ keywords: string[]; groups: Array<{ id: string; label: string; keywords: string[] }> }>('/policy/presets') });
  const [validityDays, setValidityDays] = useState(30);
  const [extendValidity, setExtendValidity] = useState(false);
  // Raw text of the comma lists, so a typed trailing comma/space is not stripped on every keystroke.
  const [listText, setListText] = useState<{ keywords?: string; noNegotiationTerms?: string; projectsKeywords?: string }>({});
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const fieldErrors = notice?.error ? extractFieldErrors(notice.text) : {};

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
    onSuccess: async (value) => { queryClient.setQueryData(['policy'], value); setDraft(null); setListText({}); setExtendValidity(false); setNotice({ text: `Kebijakan versi ${value.version} tersimpan di database. ${value.state === 'paused' ? 'Automasi tetap dijeda.' : value.state === 'active' ? 'Berlaku pada pemeriksaan autopilot berikutnya.' : 'Periksa batas lalu aktifkan kebijakan.'}`, error: false }); await refresh(); },
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
    <PageIntro eyebrow="Kebijakan" title="Batas automasi Anda" description="Tinjau aturan tersimpan sebelum mengubah harga, kuota, jadwal, atau pencarian." action={<StateLabel state={policyQuery.data.state} />} />
    {notice && (notice.error ? <ErrorNotice message={notice.text} /> : <div className="notice notice-success" role="status">{notice.text}</div>)}
    {activate.isPending && <p className="form-help" role="status">Mengaktifkan bid live…</p>}
    {control.isError && <ErrorNotice message={(control.error as Error).message} />}
    <OperationStatus data={autopilot} unavailable={autopilotQuery.isError} />
    {policyQuery.isFetching && <p className="form-help" role="status">Menyegarkan kebijakan tersimpan…</p>}
    <section className="form-card">
      <div className="section-heading"><div><p className="eyebrow">Aturan tersimpan</p><h2>Kebijakan versi {policyQuery.data.version}</h2></div><StateLabel state={policyQuery.data.state} /></div>
      <div className="policy-facts">
        <div><span>Spesialisasi</span><strong className="nominal-wrap">{policyQuery.data.specializations.join(', ') || 'Menunggu profil Freelancer'}</strong></div>
        <div><span>Rentang penawaran</span><strong className="nominal-wrap">{formatMoney(policyQuery.data.minPrice, 'USD')} – {formatMoney(policyQuery.data.maxPrice, 'USD')}</strong></div>
        <div><span>Batas harian / mingguan</span><strong className="nominal-wrap">{policyQuery.data.dailyBidLimit} / {policyQuery.data.weeklyBidLimit}</strong></div>
        <div><span>Berlaku sampai</span><strong className="nominal-wrap">{formatDate(policyQuery.data.expiresAt)}</strong></div>
      </div>
      <div className="form-actions" aria-live="polite">
        {policyQuery.data.state === 'paused' ? (
          <button className="button button-primary" type="button" disabled={control.isPending || policyQuery.data.simulationOnly} onClick={() => { if (window.confirm('Lanjutkan autopilot? Bid live dapat dikirim lagi sesuai kebijakan tersimpan.')) control.mutate('resume'); }}>Lanjutkan autopilot</button>
        ) : (
          <button className="button button-secondary" type="button" disabled={control.isPending || policyQuery.data.state !== 'active'} onClick={() => control.mutate('pause')}>Jeda darurat</button>
        )}
        <span>{policyQuery.data.state === 'active' && !policyQuery.data.simulationOnly ? 'Pengiriman bid live mengikuti aturan tersimpan.' : policyQuery.data.state === 'paused' ? 'Automasi dijeda oleh pemilik.' : 'Pengiriman bid belum diaktifkan.'}</span>
      </div>
    </section>
    <details className="card-disclosure" open={window.location.hash === '#projects-co-id-policy' || undefined}><summary>Ubah aturan pencarian, harga, kuota, dan jadwal{draft || extendValidity ? ' · Belum disimpan' : ''}</summary>
      <div className="card-section">
        <section className="form-card">
          <div className="section-heading"><div><p className="eyebrow">Editor kebijakan</p><h2>Ubah batas keputusan</h2></div><span>Versi {policy.version}{draft ? ' · Belum disimpan' : ''}</span></div>
          <p className="form-help">Bid otomatis mendukung proyek harga tetap dalam USD. Kata kunci memperluas pencarian; peluang tetap diperiksa menurut batas Anda dan kecocokan profil.</p>
          <form className="policy-form" onSubmit={(event) => { event.preventDefault(); save.mutate(policy); }}>
            <div className="form-grid form-grid-three">
              <FormField label="Skor kecocokan minimum (%)" error={fieldErrors.minimumConfidence} id="field-minimumConfidence">
                <NumField min="0" max="100" step="1" error={fieldErrors.minimumConfidence} value={Math.round(policy.minimumConfidence * 100)} onChange={(next) => setDraft({ ...policy, minimumConfidence: next / 100 })} />
              </FormField>
              <FormField label="Harga minimum (USD)" error={fieldErrors.minPrice} id="field-minPrice">
                <NumField min="0" error={fieldErrors.minPrice} value={policy.minPrice} onChange={(next) => setDraft({ ...policy, minPrice: next })} />
              </FormField>
              <FormField label="Harga maksimum (USD)" error={fieldErrors.maxPrice} id="field-maxPrice">
                <NumField min="0" error={fieldErrors.maxPrice} value={policy.maxPrice} onChange={(next) => setDraft({ ...policy, maxPrice: next })} />
              </FormField>
              <FormField label="Batas bid harian" error={fieldErrors.dailyBidLimit} id="field-dailyBidLimit">
                <NumField min="0" max="50" error={fieldErrors.dailyBidLimit} value={policy.dailyBidLimit} onChange={(next) => setDraft({ ...policy, dailyBidLimit: next })} />
              </FormField>
              <FormField label="Batas bid mingguan" error={fieldErrors.weeklyBidLimit} id="field-weeklyBidLimit">
                <NumField min="0" max="200" error={fieldErrors.weeklyBidLimit} value={policy.weeklyBidLimit} onChange={(next) => setDraft({ ...policy, weeklyBidLimit: next })} />
              </FormField>
              <FormField label="Zona waktu" error={fieldErrors.timezone} id="field-timezone">
                <input value={policy.timezone} onChange={(event) => setDraft({ ...policy, timezone: event.target.value })} />
              </FormField>
              <FormField label="Jam mulai" error={fieldErrors['activeHours.start'] ?? fieldErrors.activeHours} id="field-activeHours-start">
                <NumField min="0" max="23" value={policy.activeHours.start} onChange={(next) => setDraft({ ...policy, activeHours: { ...policy.activeHours, start: next } })} />
              </FormField>
              <FormField label="Jam selesai (0–24)" error={fieldErrors['activeHours.end'] ?? fieldErrors.activeHours} id="field-activeHours-end">
                <NumField min="0" max="24" value={policy.activeHours.end} onChange={(next) => setDraft({ ...policy, activeHours: { ...policy.activeHours, end: next } })} />
              </FormField>
              <FormField label="Interval pemindaian (menit)" error={fieldErrors.scanIntervalMinutes} id="field-scanIntervalMinutes">
                <NumField min="5" max="60" error={fieldErrors.scanIntervalMinutes} value={policy.scanIntervalMinutes ?? 15} onChange={(next) => setDraft({ ...policy, scanIntervalMinutes: next })} />
              </FormField>
              <FormField label="Batas risiko maksimum (%)" error={fieldErrors.maxRiskScore} id="field-maxRiskScore">
                <NumField min="0" max="100" error={fieldErrors.maxRiskScore} value={Math.round((policy.maxRiskScore ?? 0.65) * 100)} onChange={(next) => setDraft({ ...policy, maxRiskScore: next / 100 })} />
              </FormField>
            </div>
            <fieldset className="specialty-fieldset"><legend>Hari operasi</legend><div className="day-options">{['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((day, index) => <label className="check-row" key={day}><input type="checkbox" checked={(policy.activeDays ?? [0, 1, 2, 3, 4, 5, 6]).includes(index)} onChange={(event) => { const days = policy.activeDays ?? [0, 1, 2, 3, 4, 5, 6]; setDraft({ ...policy, activeDays: event.target.checked ? [...days, index].sort() : days.filter((item) => item !== index) }); }} /><span>{day}</span></label>)}</div><button className="button button-secondary" type="button" onClick={() => setDraft({ ...policy, activeDays: [0, 1, 2, 3, 4, 5, 6], activeHours: { start: 0, end: 24 } })}>Pilih operasi 24 jam, setiap hari</button><p className="form-help">Jam selesai lebih kecil dari jam mulai berarti melewati tengah malam.</p></fieldset>
            <label className="check-row"><input type="checkbox" checked={policy.allowedActions.includes('bid.submit')} onChange={(event) => setDraft({ ...policy, allowedActions: event.target.checked ? ['bid.submit'] : [] })} /><span>Izinkan pengiriman bid otomatis dalam batas kebijakan</span></label>
            <label className="check-row"><input type="checkbox" checked={policy.allowUnknownDeadline === true} onChange={(event) => setDraft({ ...policy, allowUnknownDeadline: event.target.checked })} /><span>Izinkan proyek tanpa waktu penutupan yang diketahui (durasi bid 14 hari)</span></label>
            <label className="check-row"><input type="checkbox" checked={policy.requireSpecializationMatch !== false} onChange={(event) => setDraft({ ...policy, requireSpecializationMatch: event.target.checked })} /><span>Wajib cocok dengan salah satu spesialisasi profil</span></label>
            <FormField label={`Kata kunci proyek (${policy.keywords.length}/300)`} help="Pisahkan dengan koma atau baris baru. Minimal satu kata cocok; kosong berarti tanpa filter kata kunci." error={fieldErrors.keywords} id="field-keywords">
              <textarea rows={6} value={listText.keywords ?? policy.keywords.join(', ')} onChange={(event) => setList('keywords', event.target.value)} placeholder="Python, Laravel, API" />
            </FormField>
            <details className="keyword-catalog"><summary>Tambahkan katalog coding</summary>{presets.isError ? <ErrorNotice message="Katalog tidak dapat dimuat." onRetry={() => presets.refetch()} /> : <><p className="form-help">Pilih bidang yang relevan atau seluruh katalog. Kata kunci tidak menambahkan klaim keahlian ke profil.</p><div className="form-actions"><button className="button button-secondary" type="button" disabled={!presets.data} onClick={() => setList('keywords', [...policy.keywords, ...(presets.data?.keywords ?? [])].join(', '))}>Tambahkan seluruh katalog ({presets.data?.keywords.length ?? '…'})</button>{presets.data?.groups.map((group) => <button className="button button-secondary" type="button" key={group.id} onClick={() => setList('keywords', [...policy.keywords, ...group.keywords].join(', '))}>{group.label} ({group.keywords.length})</button>)}</div></>}</details>
            <FormField label="Istilah non-negosiasi" error={fieldErrors.noNegotiationTerms} id="field-noNegotiationTerms">
              <input value={listText.noNegotiationTerms ?? policy.noNegotiationTerms.join(', ')} onChange={(event) => setList('noNegotiationTerms', event.target.value)} placeholder="pembayaran di muka, onsite" />
            </FormField>
            <details className="card-disclosure" open={window.location.hash === '#projects-co-id-policy' || undefined}><summary>Aturan projects.co.id · Rupiah</summary><fieldset className="projects-policy-fields" id="projects-co-id-policy"><legend>projects.co.id: pencarian dan draf lokal dalam Rupiah</legend>
              <p className="form-help">Akun {projectsSettings.username}. Mode diatur di <Link to="/projects-co-id">kartu projects.co.id</Link>. Kuota ini membatasi draf otomatis, terpisah dari bid Freelancer. Menyimpan tidak mengubah status aktif atau jeda kebijakan.</p>
              <div className="form-grid">
                <FormField label="Harga minimum IDR" error={fieldErrors['projectsCoId.minPrice']} id="field-projects-minPrice">
                  <NumField min="1" step="1000" value={projectsSettings.minPrice} onChange={value => setProjectsSettings({ minPrice: value })} />
                </FormField>
                <FormField label="Harga maksimum IDR" error={fieldErrors['projectsCoId.maxPrice']} id="field-projects-maxPrice">
                  <NumField min="1" step="1000" value={projectsSettings.maxPrice} onChange={value => setProjectsSettings({ maxPrice: value })} />
                </FormField>
                <FormField label="Draf otomatis / hari" error={fieldErrors['projectsCoId.dailyBidLimit']} id="field-projects-dailyBidLimit">
                  <NumField min="0" max="50" value={projectsSettings.dailyBidLimit} onChange={value => setProjectsSettings({ dailyBidLimit: value })} />
                </FormField>
                <FormField label="Draf otomatis / minggu" error={fieldErrors['projectsCoId.weeklyBidLimit']} id="field-projects-weeklyBidLimit">
                  <NumField min="0" max="200" value={projectsSettings.weeklyBidLimit} onChange={value => setProjectsSettings({ weeklyBidLimit: value })} />
                </FormField>
                <FormField label="Skor minimum untuk draf (%)" error={fieldErrors['projectsCoId.minimumScore']} id="field-projects-minimumScore">
                  <NumField min="0" max="100" step="1" value={projectsSettings.minimumScore} onChange={value => setProjectsSettings({ minimumScore: value })} />
                </FormField>
              </div>
              <fieldset className="projects-field-options"><legend>Bidang yang dicari</legend>
                <p className="form-help">Setiap bidang menambah istilah pencarian di projects.co.id. Tanpa bidang, kata kunci dan skill profil, Scout membaca daftar proyek terbaru.</p>
                {PROJECTS_CO_ID_FIELDS.map(field => <label className="check-row" key={field.id}><input type="checkbox" checked={projectsSettings.fields.includes(field.id)} onChange={event => setProjectsSettings({ fields: event.target.checked ? [...projectsSettings.fields, field.id] : projectsSettings.fields.filter(id => id !== field.id) })} /><span>{field.label} <small>({field.terms.join(', ')})</small></span></label>)}
              </fieldset>
              <FormField label={`Kata kunci tambahan projects.co.id (${projectsSettings.keywords.length}/20)`} help="Huruf, angka, spasi dan . + # / - saja; maksimal 40 karakter per kata kunci." error={fieldErrors['projectsCoId.keywords']} id="field-projects-keywords">
                <textarea rows={3} value={listText.projectsKeywords ?? projectsSettings.keywords.join(', ')} onChange={event => { setListText({ ...listText, projectsKeywords: event.target.value }); setProjectsSettings({ keywords: [...new Map(event.target.value.split(/[,\n]/).map(item => item.trim()).filter(Boolean).map(item => [item.toLowerCase(), item])).values()] }); }} placeholder="Laravel, scraping, dashboard" />
              </FormField>
              <label className="check-row"><input type="checkbox" checked={projectsSettings.useProfileSkills} onChange={event => setProjectsSettings({ useProfileSkills: event.target.checked })} /><span>Pakai spesialisasi <Link to="/profile">Profil</Link> sebagai pencarian ({policy.specializations.join(', ') || 'belum ada'})</span></label>
              <p className="form-help">Setiap pemindaian membuka paling banyak tiga pencarian; istilah lain dipakai bergiliran pada pemindaian berikutnya.</p>
            </fieldset></details>
            <label className="check-row"><input type="checkbox" checked={extendValidity} onChange={(event) => setExtendValidity(event.target.checked)} /><span>Perbarui masa berlaku saat disimpan</span></label>
            {extendValidity && (
              <FormField label="Berlaku sejak sekarang (hari)" id="field-validityDays">
                <NumField min="1" max="365" value={validityDays} onChange={setValidityDays} />
              </FormField>
            )}
            <FormActionBar sticky note={draft || extendValidity ? 'Perubahan belum disimpan.' : 'Aturan tersimpan aktif.'} ariaLabel="Aksi kebijakan">
              <button className="button button-primary" type="submit" disabled={(!draft && !extendValidity) || save.isPending}>{save.isPending ? 'Menyimpan...' : 'Simpan perubahan kebijakan'}</button>
              {(policy.state === 'draft' || policy.simulationOnly) && (
                <button className="button button-primary" type="button" disabled={activate.isPending || policy.state === 'paused' || !!draft} onClick={() => { if (window.confirm('Aktifkan pengiriman bid live sesuai kebijakan tersimpan? Tindakan ini dapat mengirim bid otomatis saat autopilot berjalan.')) activate.mutate(); }}>Aktifkan bid live sesuai batas tersimpan</button>
              )}
              {(draft || extendValidity) && (
                <button className="button button-secondary" type="button" onClick={() => { setDraft(null); setListText({}); setExtendValidity(false); }}>Batalkan perubahan</button>
              )}
            </FormActionBar>
          </form>
        </section>
      </div>
    </details>
  </>;
}
