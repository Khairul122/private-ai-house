import type { ProjectOpportunity, ProjectsCoIdSettings } from '@fvh/domain';

export const PROJECTS_CO_ID_ORIGIN = 'https://projects.co.id';
export const PROJECTS_CO_ID_AUTO_REASON = 'Aplikasi hanya memindai dan menyiapkan draf lokal. Penawaran dikirim sendiri oleh pemilik di situs.';
export const PROJECTS_CO_ID_PROPOSAL_LIMIT = 1200;
export { chooseProjectsCoIdBid } from '@fvh/domain';
export type ProjectsCoIdStatus = {
  mode: ProjectsCoIdSettings['mode'];
  state: 'stopped' | 'opening' | 'checking' | 'scanning' | 'drafting' | 'ready' | 'paused' | 'login_required' | 'account_mismatch' | 'challenge' | 'error';
  busy: boolean;
  reason: string;
  username: string | null;
  remaining: number | null;
  checkedAt: string | null;
  pageStatus: number | null;
  lastScanAt: string | null;
  lastResult: { imported: number; at: string } | null;
  autoAvailable: false;
  draftsInProgress: number;
  projectCount: number;
  readyDrafts: number;
  blockedWrites: number;
  draftUsage: { today: number; week: number; dailyLimit: number; weeklyLimit: number };
};
export type ProjectsCoIdObservation = Pick<ProjectsCoIdStatus, 'username' | 'remaining' | 'checkedAt' | 'pageStatus'> & { challenge: boolean };
export type ProjectsCoIdListing = { href: string; title: string; description: string; clientName: string; skills: string[]; text: string };

export function projectsCoIdPath(project: Pick<ProjectOpportunity, 'id' | 'sourceSlug'>): string {
  const id = project.id.match(/^projects_co_id:([a-f0-9]{6})$/)?.[1];
  if (!id || !project.sourceSlug || !/^[a-zA-Z0-9_-]{1,300}$/.test(project.sourceSlug)) throw new Error('ID atau slug projects.co.id tidak valid.');
  return `/public/browse_projects/view/${id}/${project.sourceSlug}`;
}

export function mentionedRupiahAmounts(text: string): number[] {
  return [...text.matchAll(/(?:\b(?:Rp|IDR)\s*(\d[\d.,]*)(?:\s*(juta|jt|ribu|rb))?|\b(\d[\d.,]*)\s*(juta|jt|ribu|rb)\b)/gi)].map(m => {
    const unit = (m[2] ?? m[4] ?? '').toLowerCase();
    const raw = m[1] ?? m[3]!;
    const value = Number(unit ? raw.replace(',', '.') : raw.replace(/[.,]/g, ''));
    return value * (unit === 'juta' || unit === 'jt' ? 1_000_000 : unit ? 1000 : 1);
  });
}

export function validProjectsCoIdProposal(proposal: string, amount: number, period: number): boolean {
  return proposal.length >= 40 && proposal.length <= PROJECTS_CO_ID_PROPOSAL_LIMIT
    && !mentionedRupiahAmounts(proposal).some(value => value !== amount)
    && !/\$|\bUSD\b|\bEUR\b|€/i.test(proposal)
    && ![...proposal.matchAll(/\b(\d+)\s*(?:hari|days?)\b/gi)].some(m => Number(m[1]) !== period);
}

export function readRupiahBudget(text: string): [number, number] | null {
  const match = text.trim().match(/^Rp\s*(\d+(?:[.,]\d{3})*)\s*[-–]\s*(?:Rp\s*)?(\d+(?:[.,]\d{3})*)$/i);
  if (!match) return null;
  const min = Number(match[1]!.replace(/[.,]/g, '')); const max = Number(match[2]!.replace(/[.,]/g, ''));
  return Number.isSafeInteger(min) && Number.isSafeInteger(max) && min > 0 && max >= min ? [min, max] : null;
}

function wibDate(text: string): Date | null {
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2}) WIB$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+07:00`;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const local = new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 19);
  return local === iso.slice(0, 19) ? date : null;
}

export function parseProjectsCoIdProject(item: ProjectsCoIdListing, now: Date, origin = PROJECTS_CO_ID_ORIGIN): ProjectOpportunity | null {
  let url: URL; try { url = new URL(item.href, origin); } catch { return null; }
  const path = url.pathname.match(/^\/public\/browse_projects\/view\/([a-f0-9]{6})\/([a-zA-Z0-9_-]{1,300})\/?$/);
  const id = path?.[1];
  if (url.origin !== origin || url.username || url.password || url.search || !id || !item.title.trim() || !item.description.trim()) return null;
  const field = (name: string) => item.text.match(new RegExp(`^\\s*${name}:\\s*([^\\n]+)`, 'm'))?.[1]?.trim() ?? '';
  const budget = readRupiahBudget(field('Published Budget'));
  const status = field('Project Status');
  const published = wibDate(field('Published Date'));
  if (!budget || !published || !status) return null;
  const deadline = wibDate(field('Select Deadline'));
  const deadlineDays = deadline ? Math.floor((deadline.getTime() - now.getTime()) / 86_400_000) : null;
  return {
    id: `projects_co_id:${id}`, title: item.title.trim().slice(0, 500), description: item.description.trim().slice(0, 20_000),
    clientName: item.clientName.trim() || 'Tidak tersedia', budgetMin: budget[0], budgetMax: budget[1], currency: 'IDR', projectType: 'fixed',
    skills: item.skills.slice(0, 100).map(s => s.trim().slice(0, 100)).filter(Boolean), deadlineDays,
    // These are brief heuristics, never an assertion about the owner's reputation.
    briefQuality: Math.min(1, 0.25 + Math.min(item.description.length / 1200, 0.55) + Math.min(item.skills.length / 10, 0.2)),
    riskScore: Math.min(1, (item.description.length < 160 ? 0.3 : 0) + (deadlineDays === 0 ? 0.1 : 0) + (/crypto|gambling|adult|akun|account|adsense|godev/i.test(item.title + ' ' + item.description) ? 0.35 : 0)),
    sourceSlug: path![2],
    status: deadlineDays !== null && deadlineDays < 0 ? 'expired' : status === 'Published' ? 'open' : 'closed', source: 'projects_co_id', createdAt: published.toISOString(),
  };
}
