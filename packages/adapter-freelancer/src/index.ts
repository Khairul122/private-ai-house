import type { CapabilityStatus, ProjectOpportunity } from '@fvh/domain';

export type FreelancerCapability = {
  operation: 'read_projects' | 'read_profile' | 'read_portfolio' | 'read_messages' | 'submit_bid' | 'edit_profile' | 'send_message';
  status: CapabilityStatus;
  evidence: string;
};

export type FreelancerReadVerification = {
  readProfile: boolean;
  readProjects: boolean;
};

export type FreelancerProfile = {
  id: string;
  username: string | null;
  displayName: string | null;
  country: string | null;
  profileUrl: string | null;
};

export type FreelancerProjectsResult = { projects: ProjectOpportunity[]; skipped: number };

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

const API_ROOT = 'https://www.freelancer.com/api';
const dayMilliseconds = 24 * 60 * 60 * 1000;

export class FreelancerReadError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'FreelancerReadError';
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function identifier(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return text(value);
}

function number(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function objectValues(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value)) return Object.values(value).filter(isRecord);
  return [];
}

function resultRecord(payload: unknown): JsonRecord {
  if (!isRecord(payload) || !isRecord(payload.result)) throw new FreelancerReadError('invalid_response', 'Freelancer mengembalikan struktur respons yang tidak valid.');
  return payload.result;
}

function skillNames(project: JsonRecord): string[] {
  const values = objectValues(project.job_details ?? project.jobs ?? project.jobDetails);
  return [...new Set(values.map((item) => text(item.name) ?? text(item.seo_url)).filter((value): value is string => Boolean(value)))].slice(0, 20);
}

function deadlineDays(project: JsonRecord, now: Date): number | null {
  const numericExpiry = number(project.time_expire ?? project.deadline_timestamp);
  const stringExpiry = text(project.deadline ?? project.expires_at ?? project.time_expire ?? project.deadline_timestamp);
  const expiresAt = numericExpiry !== undefined
    ? (numericExpiry > 1_000_000_000_000 ? numericExpiry : numericExpiry * 1000)
    : stringExpiry ? Date.parse(stringExpiry) : Number.NaN;
  if (!Number.isFinite(expiresAt)) return null;
  return expiresAt > now.getTime() ? Math.ceil((expiresAt - now.getTime()) / dayMilliseconds) : 0;
}

function dateCreated(project: JsonRecord, now: Date): string {
  const raw = project.time_submitted ?? project.created_at ?? project.createdAt;
  const epoch = number(raw);
  if (epoch !== undefined && epoch > 0) return new Date(epoch * 1000).toISOString();
  const date = text(raw);
  if (date && Number.isFinite(Date.parse(date))) return new Date(date).toISOString();
  return now.toISOString();
}

function normalizeProject(project: JsonRecord, now: Date): ProjectOpportunity | undefined {
  const externalId = identifier(project.id);
  const title = text(project.title);
  if (!externalId || !title) return undefined;

  const budget = isRecord(project.budget) ? project.budget : {};
  const currency = isRecord(project.currency) ? project.currency : {};
  const budgetMin = number(project.budget_min ?? project.budget_minimum ?? budget.minimum) ?? 0;
  const budgetMax = number(project.budget_max ?? project.budget_maximum ?? budget.maximum ?? budget.minimum) ?? budgetMin;
  const currencyCode = text(currency.code) ?? text(project.currency_code) ?? text(budget.currency_code) ?? 'USD';
  const description = text(project.description) ?? text(project.full_description) ?? '';
  const skills = skillNames(project);
  const owner = isRecord(project.owner) ? project.owner : isRecord(project.user_details) ? project.user_details : {};
  const clientName = text(owner.display_name) ?? text(owner.username) ?? text(owner.public_name) ?? 'Klien Freelancer';
  const dueDays = deadlineDays(project, now);
  const budgetAvailable = budgetMin > 0 || budgetMax > 0;
  const briefQuality = Math.min(1, 0.25 + Math.min(description.length / 1_200, 0.55) + Math.min(skills.length / 10, 0.2));
  const riskTerms = /urgent|asap|guaranteed|wire transfer|crypto|password|credential/i.test(`${title} ${description}`);
  const riskScore = Math.min(1, (budgetAvailable ? 0 : 0.3) + (description.length < 160 ? 0.3 : 0) + (dueDays === 0 ? 0.1 : 0) + (riskTerms ? 0.35 : 0));

  return {
    id: `freelancer:${externalId}`,
    title,
    description,
    clientName,
    budgetMin: Math.max(0, budgetMin),
    budgetMax: Math.max(0, budgetMax),
    currency: currencyCode,
    skills,
    deadlineDays: dueDays,
    briefQuality,
    riskScore,
    status: 'open',
    source: 'freelancer',
    createdAt: dateCreated(project, now),
  };
}

function projectsFromResult(result: JsonRecord): unknown[] | undefined {
  if (Array.isArray(result.projects)) return result.projects;
  if (isRecord(result.projects)) return Object.values(result.projects);
  return undefined;
}

export const freelancerCapabilities: FreelancerCapability[] = [
  { operation: 'read_projects', status: 'unknown', evidence: 'Endpoint baca-saja telah diimplementasikan; akses token dan respons akun ini belum diuji.' },
  { operation: 'read_profile', status: 'unknown', evidence: 'Endpoint baca-saja telah diimplementasikan; akses token dan respons akun ini belum diuji.' },
  { operation: 'read_portfolio', status: 'unknown', evidence: 'Akses portofolio belum diperiksa pada akun dan scope aplikasi ini.' },
  { operation: 'read_messages', status: 'unknown', evidence: 'Akses pesan belum diperiksa pada akun dan scope aplikasi ini.' },
  { operation: 'submit_bid', status: 'unknown', evidence: 'Endpoint tulis, idempotensi, scope, dan sandbox belum diverifikasi; pengiriman eksternal nonaktif.' },
  { operation: 'edit_profile', status: 'unknown', evidence: 'Endpoint tulis dan otorisasi sandbox belum diverifikasi; perubahan eksternal nonaktif.' },
  { operation: 'send_message', status: 'unknown', evidence: 'Endpoint tulis dan otorisasi sandbox belum diverifikasi; pesan eksternal nonaktif.' },
];

export function getFreelancerCapabilities(verification?: FreelancerReadVerification | null) {
  return freelancerCapabilities.map((capability) => {
    if (capability.operation === 'read_profile' && verification?.readProfile) {
      return { ...capability, status: 'supported' as const, evidence: 'Pemeriksaan baca-saja berhasil pada GET /api/users/0.1/self/ dengan token akun yang tersimpan.' };
    }
    if (capability.operation === 'read_projects' && verification?.readProjects) {
      return { ...capability, status: 'supported' as const, evidence: 'Pemeriksaan baca-saja berhasil pada pencarian proyek aktif Freelancer dengan token akun yang tersimpan.' };
    }
    return { ...capability };
  });
}

export class FreelancerReadAdapter {
  private readonly fetcher: Fetcher;
  private readonly now: () => Date;

  constructor(private readonly options: { token: string; fetcher?: Fetcher; timeoutMs?: number; now?: () => Date }) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async readOwnProfile(): Promise<FreelancerProfile> {
    const response = await this.request(`${API_ROOT}/users/0.1/self/`);
    const result = resultRecord(await response.json());
    const userId = identifier(result.id);
    if (!userId) throw new FreelancerReadError('invalid_response', 'Freelancer tidak mengembalikan ID profil akun.');
    const username = text(result.username);
    return {
      id: userId,
      username: username ?? null,
      displayName: text(result.display_name) ?? text(result.public_name) ?? null,
      country: isRecord(result.country) ? text(result.country.name) ?? null : null,
      profileUrl: username ? `https://www.freelancer.com/u/${encodeURIComponent(username)}` : null,
    };
  }

  async searchActiveProjects(query: string, limit = 25): Promise<FreelancerProjectsResult> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2 || normalizedQuery.length > 120 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new FreelancerReadError('invalid_query', 'Kata pencarian harus 2–120 karakter dan jumlah proyek 1–50.');
    }
    const url = new URL(`${API_ROOT}/projects/0.1/projects/active/`);
    url.search = new URLSearchParams({
      query: normalizedQuery,
      limit: String(limit),
      offset: '0',
      full_description: 'true',
      job_details: 'true',
      user_details: 'true',
    }).toString();
    const response = await this.request(url);
    const result = resultRecord(await response.json());
    const records = projectsFromResult(result);
    if (!records) throw new FreelancerReadError('invalid_response', 'Respons proyek Freelancer tidak memiliki daftar proyek yang dapat dibaca.');
    const normalized = records.filter(isRecord).map((project) => normalizeProject(project, this.now())).filter((project): project is ProjectOpportunity => Boolean(project));
    return { projects: normalized, skipped: records.length - normalized.length };
  }

  private async request(url: string | URL): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'GET',
        headers: { 'Freelancer-OAuth-V1': this.options.token, Accept: 'application/json', 'User-Agent': 'freelancer-virtual-house-local' },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 12_000),
      });
    } catch {
      throw new FreelancerReadError('network_error', 'Freelancer tidak dapat dijangkau dari server lokal. Periksa koneksi jaringan lalu coba lagi.');
    }
    if (response.status === 401) throw new FreelancerReadError('invalid_token', 'Freelancer menolak token tersimpan. Perbarui token akses.', 401);
    if (response.status === 403) throw new FreelancerReadError('scope_denied', 'Token Freelancer tidak memiliki izin baca untuk endpoint ini.', 403);
    if (response.status === 429) throw new FreelancerReadError('rate_limited', 'Freelancer membatasi permintaan. Coba lagi setelah jeda.', 429);
    if (!response.ok) throw new FreelancerReadError('provider_error', `Freelancer mengembalikan status ${response.status}.`, response.status);
    return response;
  }
}
