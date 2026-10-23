import { OPERATIONS_ROSTER } from './operations.js';

export type OfficeEmployee = { id: string; name: string; role: string; color: string; floor?: 1 | 2 };

export const OFFICE_ROSTER: OfficeEmployee[] = [
  { id: 'chief-of-staff', name: 'Chief of Staff', role: 'Orchestrator Ruang Kerja', color: '#e76f51' },
  { id: 'market-scout', name: 'Market Scout', role: 'Pencari & Penilai Pasar', color: '#2a9d8f' },
  { id: 'bid-strategist', name: 'Bid Strategist', role: 'Perumus Proposal & Harga', color: '#e9c46a' },
  { id: 'profile-editor', name: 'Profile Editor', role: 'Kurator Profil & Bukti', color: '#f4a261' },
  { id: 'client-relations', name: 'Client Relations', role: 'Manajer Komunikasi Klien', color: '#457b9d' },
  { id: 'operations-analyst', name: 'Operations Analyst', role: 'Analis Pipeline & Jadwal', color: '#6a4c93' },
  { id: 'knowledge-curator', name: 'Knowledge Curator', role: 'Kurator Pengetahuan & Kode', color: '#8ab17d' },
  { id: 'compliance-auditor', name: 'Compliance Auditor', role: 'Auditor Kebijakan & Keamanan', color: '#d62828' },
  { id: 'qa-engineer', name: 'QA Engineer', role: 'Verifikator Kontrak & Smoke', color: '#277da1' },
  { id: 'lead-agent', name: 'Lead Agent', role: 'Koordinator Tim AI (Hermes)', color: '#343a40' },
  { id: 'projects-co-id-scout', name: 'Scout projects.co.id', role: 'Cari proyek & siapkan draf projects.co.id', color: '#476b68', floor: 1 },
  ...OPERATIONS_ROSTER,
];
