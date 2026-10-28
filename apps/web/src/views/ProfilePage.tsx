import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, jsonRequest, type Policy, type Profile } from '../api/api.js';
import { ErrorNotice, LoadingPanel, PageIntro, Metric, FormActionBar, FormField, NumField, extractFieldErrors } from '../components/ui.js';

const MAX_SPECIALIZATIONS = 12;
const fields = ['Fullstack Engineer', 'Backend Engineer', 'Android Engineer', 'iOS Engineer', 'Frontend Engineer', 'DevOps Engineer', 'QA Engineer', 'UI/UX Designer', 'Data Engineer', 'Technical Writer'];

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/profile'), refetchInterval: 30_000 });
  const [draft, setProfile] = useState<Profile | null>(null);
  const [newFact, setNewFact] = useState({ label: '', value: '', source: '' });
  const [newSpecialty, setNewSpecialty] = useState('');
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const profile = draft ?? (profileQuery.isError ? undefined : profileQuery.data);
  const fieldErrors = notice?.error ? extractFieldErrors(notice.text) : {};

  const save = useMutation({
    mutationFn: (value: Profile) => api<{ profile: Profile; policy: Policy }>('/profile', jsonRequest('PUT', value)),
    onSuccess: (result: { profile: Profile; policy: Policy }) => {
      queryClient.setQueryData(['profile'], result.profile);
      setProfile(null);
      setNotice({ text: result.policy.state === 'draft' ? 'Profil tersimpan. Kebijakan kembali ke draf; aktifkan ulang di kartu Kebijakan agar autopilot mengirim bid lagi.' : 'Profil tersimpan.', error: false });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['policy'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: Error) => setNotice({ text: error.message, error: true }),
  });

  if (profileQuery.isError) return <ErrorNotice message="Profil belum dapat dimuat." onRetry={() => profileQuery.refetch()} />;
  if (profileQuery.isPending || !profile) return <LoadingPanel label="Membuka profil layanan..." />;

  function toggleSpecialty(value: string) {
    if (profile) setProfile({ ...profile, specializations: profile.specializations.includes(value) ? profile.specializations.filter((item) => item !== value) : [...profile.specializations, value] });
  }

  function addFact(event: FormEvent) {
    event.preventDefault();
    if (!profile || !newFact.label.trim() || !newFact.value.trim() || !newFact.source.trim()) return;
    setProfile({ ...profile, facts: [...profile.facts, { label: newFact.label.trim(), value: newFact.value.trim(), source: newFact.source.trim() }] });
    setNewFact({ label: '', value: '', source: '' });
  }

  return <>
    <PageIntro eyebrow="Profil layanan" title="Keahlian dan bukti kerja" description="Profil menjadi acuan pencarian proyek dan isi proposal. Simpan hanya keahlian dan hasil yang dapat Anda buktikan." />
    {profileQuery.isFetching && <p className="form-help" role="status">Menyegarkan profil tersimpan…</p>}
    <div className="card-summary-grid"><Metric label="Spesialisasi tersimpan" value={profileQuery.data.specializations.length} note={`Maksimal ${MAX_SPECIALIZATIONS}; dipakai untuk mencari proyek`} /><Metric label="Fakta tersimpan" value={profileQuery.data.facts.length} note="Bukti yang dapat dipakai Hermes saat menulis" /><Metric label="Bidang utama tersimpan" value={profileQuery.data.primaryField || 'Belum diisi'} note={profileQuery.data.timezone} /></div>
    <div className="notice notice-warning" role="note"><strong>Menyimpan profil mengembalikan kebijakan aktif ke draf.</strong><p>Kebijakan yang aktif kembali menjadi draf. Setelah menyimpan, tinjau dan aktifkan kembali melalui kartu Kebijakan.</p></div>
    {notice && (notice.error ? <ErrorNotice message={notice.text} /> : <div className="notice notice-success" role="status">{notice.text}</div>)}
    <form className="form-section" onSubmit={(event) => { event.preventDefault(); if (profile && window.confirm('Simpan perubahan profil? Jika kebijakan sedang aktif, kebijakan akan kembali menjadi draf dan autopilot live berhenti sampai Anda meninjaunya.')) save.mutate(profile); }}>
      <section className="form-card"><div className="section-heading"><div><p className="eyebrow">Arah layanan</p><h2>Bidang utama dan spesialisasi</h2></div></div>
        <div className="form-grid">
          <FormField label="Bidang utama" error={fieldErrors.primaryField} id="field-primaryField">
            <select value={profile.primaryField} onChange={(event) => setProfile({ ...profile, primaryField: event.target.value })}>
              <option value="">Pilih bidang utama</option>
              {fields.map((field) => <option key={field}>{field}</option>)}
            </select>
          </FormField>
          <FormField label="Bahasa kerja" error={fieldErrors.language} id="field-language">
            <select value={profile.language} onChange={(event) => setProfile({ ...profile, language: event.target.value })}>
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
              <option value="id-en">Indonesia dan English</option>
            </select>
          </FormField>
        </div>
        <fieldset className="specialty-fieldset"><legend>Spesialisasi aktif ({profile.specializations.length}/{MAX_SPECIALIZATIONS})</legend>
          <p className="form-help">Dipakai autopilot sebagai kata kunci pencarian proyek Freelancer; skill teknis (mis. Python, Laravel) lebih cocok daripada nama peran.</p>
          {fieldErrors.specializations && <p className="field-error" role="alert">{fieldErrors.specializations}</p>}
          <div className="specialty-grid">{[...new Set([...profile.specializations, ...fields])].map((field) => { const checked = profile.specializations.includes(field); return <label key={field} className="check-row"><input type="checkbox" checked={checked} disabled={!checked && profile.specializations.length >= MAX_SPECIALIZATIONS} onChange={() => toggleSpecialty(field)} /><span>{field}</span></label>; })}</div></fieldset>
        <div className="search-inline">
          <FormField label="Tambahkan spesialisasi teknis" id="field-newSpecialty" className="search-field">
            <input maxLength={80} value={newSpecialty} onChange={(event) => setNewSpecialty(event.target.value)} placeholder="Misalnya: React atau Docker" />
          </FormField>
          <button className="button button-secondary" type="button" disabled={profile.specializations.length >= MAX_SPECIALIZATIONS || !newSpecialty.trim() || profile.specializations.some((item) => item.toLowerCase() === newSpecialty.trim().toLowerCase())} onClick={() => { setProfile({ ...profile, specializations: [...profile.specializations, newSpecialty.trim()] }); setNewSpecialty(''); }}>Tambah spesialisasi</button>
        </div>
      </section>
      <section className="form-card"><div className="section-heading"><div><p className="eyebrow">Batas layanan</p><h2>Tarif dan konteks kerja</h2></div></div>
        <div className="form-grid form-grid-three">
          <FormField label="Mata uang" error={fieldErrors.currency} id="field-currency">
            <select value={profile.currency} onChange={(event) => setProfile({ ...profile, currency: event.target.value })}>
              <option value="USD">USD</option>
              <option value="IDR">IDR</option>
              <option value="EUR">EUR</option>
              <option value="SGD">SGD</option>
            </select>
          </FormField>
          <FormField label="Tarif minimum" error={fieldErrors.minPrice} id="field-minPrice">
            <NumField min="0" value={profile.minPrice} error={fieldErrors.minPrice} onChange={(value) => setProfile({ ...profile, minPrice: value })} />
          </FormField>
          <FormField label="Tarif maksimum" error={fieldErrors.maxPrice} id="field-maxPrice">
            <NumField min="0" value={profile.maxPrice} error={fieldErrors.maxPrice} onChange={(value) => setProfile({ ...profile, maxPrice: value })} />
          </FormField>
          <FormField label="Zona waktu" error={fieldErrors.timezone} id="field-timezone">
            <input value={profile.timezone} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })} />
          </FormField>
        </div>
      </section>
      <section className="form-card"><div className="section-heading"><div><p className="eyebrow">Bukti kerja</p><h2>Fakta yang boleh dipakai</h2></div></div>
        <p className="form-help">Gunakan klaim yang dapat dibuktikan, lalu isi sumbernya dengan repositori, URL, atau catatan milik Anda. Isi ini tidak dikirim sampai Anda memakai provider drafting.</p>
        {profile.facts.length > 0 ? <ul className="fact-list">{profile.facts.map((fact, index) => <li key={`${fact.label}-${index}`}><div><strong className="nominal-wrap">{fact.label}</strong><p className="nominal-wrap">{fact.value}</p><small className="nominal-wrap">{fact.source}</small></div><button className="button button-text" type="button" aria-label={`Hapus fakta ${fact.label}`} onClick={() => setProfile({ ...profile, facts: profile.facts.filter((_, factIndex) => factIndex !== index) })}>Hapus fakta</button></li>)}</ul> : <div className="empty-inline">Belum ada fakta profil yang disimpan. Tambahkan bukti kerja lewat bagian di bawah.</div>}
        <details className="card-disclosure"><summary>Tambah fakta beserta sumber bukti</summary>
          <div className="fact-entry">
            <FormField label="Nama fakta" id="fact-label">
              <input value={newFact.label} onChange={(event) => setNewFact({ ...newFact, label: event.target.value })} placeholder="Contoh: Sistem inventori" />
            </FormField>
            <FormField label="Nilai atau hasil" id="fact-value">
              <input value={newFact.value} onChange={(event) => setNewFact({ ...newFact, value: event.target.value })} placeholder="Isi hanya yang benar" />
            </FormField>
            <FormField label="Sumber bukti" id="fact-source">
              <input value={newFact.source} onChange={(event) => setNewFact({ ...newFact, source: event.target.value })} placeholder="URL, repositori, atau catatan" />
            </FormField>
            <button type="button" className="button button-secondary" onClick={addFact} disabled={!newFact.label.trim() || !newFact.value.trim() || !newFact.source.trim()}>Tambah fakta</button>
          </div>
        </details>
      </section>
      <FormActionBar sticky note={draft ? 'Perubahan belum disimpan.' : 'Sesuai profil tersimpan.'} ariaLabel="Aksi profil">
        <button className="button button-primary" type="submit" disabled={save.isPending || !draft}>{save.isPending ? 'Menyimpan...' : 'Simpan profil'}</button>
        {draft && <button className="button button-secondary" type="button" onClick={() => setProfile(null)}>Batalkan perubahan</button>}
      </FormActionBar>
    </form>
  </>;
}
