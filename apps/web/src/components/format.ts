export function formatMoney(amount: number, currency: string) {
  if (!Number.isFinite(amount)) return '–';
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('id-ID')}`;
  }
}

export function formatDate(value: string) {
  if (!Number.isFinite(Date.parse(value))) return 'Tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export const PIPELINE_STAGES: Array<[string, string]> = [['new', 'Baru'], ['scored', 'Dinilai'], ['draft_ready', 'Draf siap'], ['policy_check', 'Pemeriksaan'], ['submitted', 'Dikirim / ditandai Anda'], ['in_conversation', 'Percakapan'], ['won', 'Berhasil'], ['lost', 'Tidak lanjut'], ['skipped', 'Dilewati'], ['expired', 'Kedaluwarsa'], ['reconciliation_required', 'Perlu rekonsiliasi'], ['error', 'Kesalahan']];

export function activityTitle(type: string) {
  const titles: Record<string, string> = {
    'projects_co_id.scan_completed': 'Pemindaian projects.co.id selesai', 'projects_co_id.scan_failed': 'Pemindaian projects.co.id gagal',
    'projects_co_id.draft_created': 'Draf otomatis projects.co.id dibuat', 'projects_co_id.manual_draft_created': 'Draf manual projects.co.id dibuat',
    'projects_co_id.draft_skipped': 'Draf projects.co.id ditolak kebijakan', 'projects_co_id.mode_changed': 'Mode projects.co.id diubah',
    'projects_co_id.owner_marked_sent': 'Ditandai terkirim oleh Anda', 'projects_co_id.owner_skipped': 'Proyek dilewati oleh Anda',
    'projects_co_id.write_blocked': 'Request tulis worker diblokir', 'autopilot.draft_fallback': 'Template proposal digunakan',
    'policy.updated': 'Kebijakan diperbarui', 'policy.activated': 'Kebijakan diaktifkan', 'policy.paused': 'Kill switch dijalankan',
    'policy.resumed': 'Kebijakan dilanjutkan', 'policy.reactivation_required': 'Aktivasi ulang diperlukan', 'profile.updated': 'Profil lokal diperbarui',
    'bid.draft_created': 'Draf proposal dibuat', 'bid.draft_updated': 'Draf proposal diubah', 'bid.simulated': 'Simulasi bid dicatat',
    'bid.simulation_skipped': 'Simulasi dilewati', 'knowledge.imported': 'Sumber pengetahuan diimpor', 'knowledge.github_sync': 'Repositori GitHub disinkronkan',
    'knowledge.deleted': 'Sumber dihapus', 'bid.draft_failed': 'Draf proposal gagal',
    'autopilot.cycle': 'Siklus autopilot selesai', 'autopilot.bid_skipped': 'Bid dilewati kebijakan', 'autopilot.policy_bootstrapped': 'Kebijakan autopilot dibentuk',
    'marketplace.projects_synced': 'Proyek marketplace disinkronkan', 'marketplace.sync_failed': 'Sinkronisasi marketplace gagal',
    'marketplace.production.submit_bid': 'Bid dikirim ke Freelancer', 'marketplace.production.edit_profile': 'Profil Freelancer disinkronkan',
  };
  return titles[type] ?? 'Aktivitas ruang kerja';
}

export function deadlineLabel(days: number | null) {
  if (days === null) return 'Tanpa tenggat';
  if (days === 0) return 'Hari ini';
  return days > 0 ? `${days} hari lagi` : `lewat ${-days} hari`;
}
