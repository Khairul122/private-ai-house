import { useRef, useState, type FormEvent } from 'react';
import type { ClientAutomation } from '@fvh/domain';
import type { ClientProject } from '../api/api.js';
import { normalizeWhatsAppPhone, saveClientCommunication } from '../api/client-communication.js';

export default function ClientWhatsAppCard({ projects, clients, refresh }: { projects: ClientProject[]; clients: ClientAutomation[]; refresh: () => Promise<void> }) {
  const formDetails = useRef<HTMLDetailsElement>(null);
  const [selected, setSelected] = useState('');
  const [created, setCreated] = useState<ClientProject | null>(null);
  const [phone, setPhone] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [progress, setProgress] = useState(true);
  const [payments, setPayments] = useState(true);
  const [reminders, setReminders] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const available = created && !projects.some(p => p.id === created.id) ? [...projects, created] : projects;
  function select(id: string) {
    const config = clients.find(c => c.projectId === id);
    setSelected(id); setPhone(config?.phone ?? ''); setEnabled(config?.enabled ?? false);
    setProgress(config?.progress ?? true); setPayments(config?.payments ?? true); setReminders(config?.reminders ?? true); setNotice(null);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const value = (name: string) => String(fields.get(name) ?? '').trim();
    setBusy(true); setNotice(null);
    let projectCreated = false;
    try {
      await saveClientCommunication({ projectId: selected, newProject: { title: value('title'), client: value('client'), source: value('source') as ClientProject['source'], currency: value('currency').toUpperCase() }, phone, enabled, progress, payments, reminders }, project => {
        projectCreated = true; setCreated(project); setSelected(project.id);
      });
      setPhone(normalizeWhatsAppPhone(phone));
      setNotice({ text: enabled ? 'Nomor WA tersimpan. Pesan otomatis diaktifkan untuk proyek dan jenis pesan yang dipilih.' : 'Nomor WA tersimpan. Pesan otomatis masih dinonaktifkan.', error: false });
    } catch (error) {
      setNotice({ text: `${projectCreated ? 'Proyek sudah dibuat, tetapi nomor WA belum tersimpan. Klik Simpan kembali. ' : ''}${error instanceof Error ? error.message : 'Nomor WA gagal disimpan.'}`, error: true });
    } finally {
      await refresh().catch(() => undefined);
      setBusy(false);
    }
  }
  return <section className="form-card card-section" aria-label="Kontak dan izin WhatsApp klien">
    <h2>Kontak & izin klien</h2>
    <p>{clients.length} kontak tersimpan. Pesan mengikuti izin tiap proyek dan jenis kabar yang Anda pilih.</p>
    {notice && <p className={`notice ${notice.error ? 'notice-error' : 'notice-success'}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    <details className="card-disclosure" ref={formDetails} open={!clients.length}><summary>Tambah atau ubah kontak & izin</summary>
    <p className="form-help">Pilih proyek atau daftarkan yang baru. Nomor Indonesia 08… diubah menjadi 628…. Nomor internasional menggunakan kode negara.</p>
    <form onSubmit={event => void save(event)}><fieldset disabled={busy}>
      <label className="form-field"><span>Klien / proyek</span><select value={selected} onChange={e => select(e.target.value)}><option value="">Daftarkan klien & proyek baru</option>{available.map(p => <option key={p.id} value={p.id}>{p.client} — {p.title}</option>)}</select></label>
      {!selected && <>
        <label className="form-field"><span>Nama klien</span><input name="client" required maxLength={120} autoComplete="off"/></label>
        <label className="form-field"><span>Nama proyek</span><input name="title" required maxLength={150}/></label>
        <div className="form-grid">
          <label className="form-field"><span>Sumber klien</span><select name="source" defaultValue="direct"><option value="direct">Klien langsung</option><option value="freelancer">Freelancer</option><option value="linkedin">LinkedIn</option><option value="other">Lainnya</option></select></label>
          <label className="form-field"><span>Mata uang proyek</span><input name="currency" required pattern="[A-Za-z]{3}" minLength={3} maxLength={3} placeholder="Kode mata uang, misalnya IDR"/></label>
        </div>
      </>}
      <label className="form-field"><span>Nomor WhatsApp klien</span><input name="phone" type="tel" inputMode="tel" autoComplete="off" required maxLength={30} value={phone} onChange={e => setPhone(e.target.value)}/></label>
      <label className="operations-check"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/>Aktifkan pesan otomatis untuk proyek ini</label>
      <fieldset><legend>Jenis pesan yang diizinkan</legend>
      <label className="operations-check"><input type="checkbox" checked={progress} onChange={e => setProgress(e.target.checked)}/>Kirim catatan progres baru</label>
      <label className="operations-check"><input type="checkbox" checked={payments} onChange={e => setPayments(e.target.checked)}/>Konfirmasi pembayaran yang dicatat diterima</label>
      <label className="operations-check"><input type="checkbox" checked={reminders} onChange={e => setReminders(e.target.checked)}/>Ingatkan tagihan yang jatuh tempo</label></fieldset>
      <p>Hanya kejadian setelah izin disimpan yang dikirim sebagai progres atau konfirmasi baru. Pengingat tagihan maksimal sekali per hari per proyek.</p>
      <button className="button button-primary" type="submit">{busy ? 'Menyimpan nomor WA…' : 'Simpan klien & nomor WA'}</button>
    </fieldset></form></details>
    {!!clients.length && <><h3>Nomor tersimpan</h3>{clients.map(config => <article className="operations-row" key={config.projectId}>
      <strong>{available.find(p => p.id === config.projectId)?.client ?? 'Klien tidak tersedia'}</strong>
      <p>{available.find(p => p.id === config.projectId)?.title ?? 'Proyek tidak tersedia'} · +{config.phone}</p>
      <small>{config.enabled ? 'Otomatis aktif' : 'Otomatis nonaktif'} · Progres: {config.progress ? 'ya' : 'tidak'} · Pembayaran: {config.payments ? 'ya' : 'tidak'} · Pengingat: {config.reminders ? 'ya' : 'tidak'}</small>
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => { select(config.projectId); if (formDetails.current) formDetails.current.open = true; setNotice({ text: 'Kontak dipilih. Ubah nomor atau izin pada formulir di atas.', error: false }); }}>Ubah nomor / izin</button>
    </article>)}</>}
  </section>;
}
