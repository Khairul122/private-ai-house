export type ClientAutomation = { projectId: string; phone: string; enabled: boolean; progress: boolean; payments: boolean; reminders: boolean; enabledAt: string };
export type ProgressNote = { id: string; projectId: string; text: string; createdAt: string };
export type OwnerTask = { id: string; title: string; projectId: string | null; startAt: string; endAt: string; timezone: string; notes: string; done: boolean; syncGoogle: boolean; updatedAt: string };
export type InvoiceIdentity = { businessName: string; address: string; email: string; paymentInstructions: string; footer: string; signatory: string };
export type Invoice = { id: string; number: string; projectId: string; issuedOn: string; dueOn: string; category: string; description: string; clientEmail: string; currency: string; totalMinor: number; identity: InvoiceIdentity; createdAt: string };
export type OutboxMessage = { id: string; eventKey: string; projectId: string; kind: 'progress' | 'payment' | 'reminder'; phone: string; text: string; status: 'pending' | 'sending' | 'sent' | 'uncertain' | 'canceled'; createdAt: string; sentAt: string | null; providerId: string | null; reason: string | null };
export type TeamBriefing = { id: string; createdAt: string; floor: 1 | 2; manager: string; facts: string[]; leadReview: string | null; state: 'waiting' | 'reviewed' | 'unavailable' };
export const OPERATIONS_ROSTER = [
  { id: 'floor-one-manager', name: 'Manajer Akuisisi', role: 'Koordinasi pasar, bid & Lead', color: '#80503c', floor: 1 },
  { id: 'delivery-manager', name: 'Manajer Operasional', role: 'Koordinasi delivery, keuangan & Lead', color: '#67518b', floor: 2 },
  { id: 'progress-reporter', name: 'Koordinator Progres', role: 'Laporan dari catatan proyek', color: '#267e75', floor: 2 },
  { id: 'payment-officer', name: 'Petugas Pembayaran', role: 'Konfirmasi DP & pelunasan', color: '#557b30', floor: 2 },
  { id: 'collections-officer', name: 'Pengingat Tagihan', role: 'Pengingat jatuh tempo', color: '#a86431', floor: 2 },
  { id: 'invoice-specialist', name: 'Petugas Invoice', role: 'Dokumen invoice & riwayat pembayaran', color: '#8a5065', floor: 2 },
  { id: 'schedule-planner', name: 'Perencana Jadwal', role: 'Kalender tugas pemilik', color: '#386697', floor: 2 },
  { id: 'whatsapp-operator', name: 'Operator WhatsApp', role: 'Pengiriman pesan & sesi QR', color: '#33734c', floor: 2 },
  { id: 'calendar-operator', name: 'Operator Kalender', role: 'Sinkronisasi Google Calendar', color: '#805a2c', floor: 2 },
] as const;

export function currencyDigits(currency: string): number {
  // Intl uses display conventions (IDR can be 0), which differ across Node/Chrome.
  // Stored amounts use ISO 4217 minor units: SIX List One, checked 2026-10-16.
  // https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
  if(!/^[A-Z]{3}$/.test(currency)) throw new Error('Kode mata uang tidak valid.');
  if(['BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW','PYG','RWF','UGX','UYI','VND','VUV','XAF','XOF','XPF'].includes(currency)) return 0;
  if(['BHD','IQD','JOD','KWD','LYD','OMR','TND'].includes(currency)) return 3;
  if(['CLF','UYW'].includes(currency)) return 4;
  return 2;
}
export function toMinor(amount: number, currency: string): number {
  const [significand,exponent='0']=String(amount).split('e');
  const minor = Math.round(Number(`${significand}e${Number(exponent)+currencyDigits(currency)}`));
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(minor)) throw new Error('Nilai uang tidak valid.');
  return minor;
}
export function invoiceBalance(invoice: Pick<Invoice, 'currency' | 'totalMinor'>, payments: Array<{ amount: number; currency: string; status: string }>) {
  const paidMinor = payments.filter((p) => p.currency === invoice.currency && p.status === 'received').reduce((sum, p) => sum + toMinor(p.amount, p.currency), 0);
  if (!Number.isSafeInteger(paidMinor)) throw new Error('Total pembayaran terlalu besar.');
  return { paidMinor, remainingMinor: Math.max(0, invoice.totalMinor - paidMinor), overpaidMinor: Math.max(0, paidMinor - invoice.totalMinor) };
}
