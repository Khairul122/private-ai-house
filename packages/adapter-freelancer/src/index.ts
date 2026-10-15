import type { CapabilityStatus, ProjectOpportunity } from '@fvh/domain';

export type FreelancerCapability = {
  operation: 'read_projects' | 'read_profile' | 'read_portfolio' | 'read_messages' | 'submit_bid' | 'edit_profile' | 'send_message';
  status: CapabilityStatus;
  evidence: string;
};

export type FreelancerReadVerification = {
  readProfile: boolean;
  readProjects: boolean;
  readPortfolio?: boolean;
  readMessages?: boolean;
  profileError?: string;
  projectsError?: string;
  portfolioError?: string;
  messagesError?: string;
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
const SANDBOX_API_ROOT = 'https://www.freelancer-sandbox.com/api';
const dayMilliseconds = 24 * 60 * 60 * 1000;

export type FreelancerSandboxWriteInput =
  | { operation: 'submit_bid'; projectId: number; amount: number; period: number; milestonePercentage: number; description: string }
  | { operation: 'edit_profile'; jobIds: number[] }
  | { operation: 'send_message'; threadId: number; message: string };

export type FreelancerSandboxWriteOperation = FreelancerSandboxWriteInput['operation'];

export class FreelancerSandboxWriteError extends Error {
  constructor(public readonly statusCode: number | undefined, message: string) {
    super(message);
    this.name = 'FreelancerSandboxWriteError';
  }
}

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
  { operation: 'submit_bid', status: 'unknown', evidence: 'Uji bid hanya tersedia pada sandbox dengan proyek milik akun sandbox. Izin dan operasi pada akun produksi belum diverifikasi.' },
  { operation: 'edit_profile', status: 'unknown', evidence: 'Uji edit profil terbatas pada penggantian daftar job di sandbox; field profil lain dan akun produksi belum diverifikasi.' },
  { operation: 'send_message', status: 'unknown', evidence: 'Uji pesan hanya tersedia pada thread sandbox milik akun sandbox. Izin dan operasi pada akun produksi belum diverifikasi.' },
];

function failedCheckEvidence(label: string, error?: string): string {
  if (!error) return `Pemeriksaan baca-saja ${label} belum dijalankan.`;
  if (error === 'scope_denied') return `Freelancer menolak akses baca ${label} (HTTP 403); scope token tidak mengizinkannya.`;
  if (error === 'no_message_thread') return 'Pencarian thread berhasil, tetapi akun belum memiliki thread untuk menguji endpoint pesan.';
  if (error === 'profile_unavailable') return 'ID akun belum tersedia karena pembacaan profil belum berhasil.';
  if (error === 'invalid_token') return 'Freelancer menolak token tersimpan. Perbarui token lalu periksa kembali.';
  if (error === 'rate_limited') return 'Freelancer membatasi permintaan. Tunggu sebelum memeriksa kembali.';
  if (error === 'network_error') return 'Server lokal tidak dapat menjangkau Freelancer.';
  return `Pemeriksaan baca-saja ${label} gagal (${error}); status tetap belum terverifikasi.`;
}

export function getFreelancerCapabilities(verification?: FreelancerReadVerification | null) {
  return freelancerCapabilities.map((capability) => {
    if (capability.operation === 'read_profile' && verification?.readProfile) {
      return { ...capability, status: 'supported' as const, evidence: 'Pemeriksaan baca-saja berhasil pada GET /api/users/0.1/self/ dengan token akun yang tersimpan.' };
    }
    if (capability.operation === 'read_profile' && verification?.profileError) {
      return { ...capability, status: verification.profileError === 'scope_denied' ? 'unsupported' as const : 'unknown' as const, evidence: failedCheckEvidence('profil akun', verification.profileError) };
    }
    if (capability.operation === 'read_projects' && verification?.readProjects) {
      return { ...capability, status: 'supported' as const, evidence: 'Pemeriksaan baca-saja berhasil pada pencarian proyek aktif Freelancer dengan token akun yang tersimpan.' };
    }
    if (capability.operation === 'read_projects' && verification?.projectsError) {
      return { ...capability, status: verification.projectsError === 'scope_denied' ? 'unsupported' as const : 'unknown' as const, evidence: failedCheckEvidence('proyek aktif', verification.projectsError) };
    }
    if (capability.operation === 'read_portfolio' && verification?.readPortfolio) {
      return { ...capability, status: 'supported' as const, evidence: 'Pemeriksaan baca-saja berhasil pada GET /api/users/0.1/portfolios/ untuk ID akun sendiri (limit 1). Isi portofolio tidak disimpan.' };
    }
    if (capability.operation === 'read_portfolio' && verification?.portfolioError) {
      return { ...capability, status: verification.portfolioError === 'scope_denied' ? 'unsupported' as const : 'unknown' as const, evidence: failedCheckEvidence('portofolio', verification.portfolioError) };
    }
    if (capability.operation === 'read_messages' && verification?.readMessages) {
      return { ...capability, status: 'supported' as const, evidence: 'Pemeriksaan baca-saja berhasil pada daftar thread akun dan GET pesan dengan limit 1. Isi pesan tidak disimpan.' };
    }
    if (capability.operation === 'read_messages' && verification?.messagesError) {
      return { ...capability, status: verification.messagesError === 'scope_denied' ? 'unsupported' as const : 'unknown' as const, evidence: failedCheckEvidence('pesan', verification.messagesError) };
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

  async checkOwnPortfolioRead(userId: string): Promise<void> {
    const url = new URL(`${API_ROOT}/users/0.1/portfolios/`);
    url.search = new URLSearchParams({ 'users[]': userId, limit: '1', offset: '0' }).toString();
    const result = resultRecord(await (await this.request(url)).json());
    if (!isRecord(result.users) || !Object.hasOwn(result.users, userId) || !isRecord(result.portfolios)) {
      throw new FreelancerReadError('invalid_response', 'Respons portofolio Freelancer tidak memiliki struktur daftar pengguna dan portofolio yang valid.');
    }
  }

  async checkOwnMessageRead(userId: string): Promise<void> {
    const threadsUrl = new URL(`${API_ROOT}/messages/0.1/threads/`);
    threadsUrl.search = new URLSearchParams({ 'members[]': userId }).toString();
    const threadPayload: unknown = await (await this.request(threadsUrl)).json();
    let threadResult: JsonRecord;
    try {
      threadResult = resultRecord(threadPayload);
    } catch (error) {
      if (error instanceof FreelancerReadError && error.code === 'invalid_response') {
        throw new FreelancerReadError('threads_invalid_response', 'Respons daftar thread Freelancer tidak sesuai format API.');
      }
      throw error;
    }
    const threads = threadResult.threads;
    let threadId: string | undefined;
    if (Array.isArray(threads)) {
      for (const thread of threads) {
        if (isRecord(thread) && identifier(thread.id)) { threadId = identifier(thread.id); break; }
      }
    } else if (isRecord(threads)) {
      for (const [key, thread] of Object.entries(threads)) {
        if (!isRecord(thread)) continue;
        threadId = identifier(thread.id) ?? identifier(key);
        if (threadId) break;
      }
    } else {
      throw new FreelancerReadError('threads_invalid_response', 'Respons thread Freelancer tidak memiliki daftar thread yang valid.');
    }
    if (!threadId) throw new FreelancerReadError('no_message_thread', 'Tidak ada thread milik akun untuk menguji akses baca pesan.');

    const messagesUrl = new URL(`${API_ROOT}/messages/0.1/messages/`);
    messagesUrl.search = new URLSearchParams({ 'threads[]': threadId, limit: '1', offset: '0' }).toString();
    const messagePayload: unknown = await (await this.request(messagesUrl)).json();
    if (!isRecord(messagePayload) || !isRecord(messagePayload.result)) {
      throw new FreelancerReadError('messages_invalid_response', 'Respons daftar pesan Freelancer tidak sesuai format API.');
    }
    const messageResult = messagePayload.result;
    if (!Array.isArray(messageResult.messages) && !isRecord(messageResult.messages)) {
      throw new FreelancerReadError('messages_invalid_response', 'Respons pesan Freelancer tidak memiliki daftar pesan yang valid.');
    }
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

export class FreelancerSandboxWriteAdapter {
  private readonly fetcher: Fetcher;

  constructor(private readonly options: { token: string; fetcher?: Fetcher; timeoutMs?: number }) {
    this.fetcher = options.fetcher ?? fetch;
    if (!options.token || options.token.length < 16 || /[\0\r\n]/.test(options.token)) {
      throw new FreelancerSandboxWriteError(undefined, 'Token sandbox Freelancer tidak valid.');
    }
  }

  async run(input: FreelancerSandboxWriteInput): Promise<{ statusCode: number }> {
    switch (input.operation) {
      case 'submit_bid': {
        const selfResponse = await this.request(`${SANDBOX_API_ROOT}/users/0.1/self/`, { method: 'GET' });
        const selfPayload: unknown = await selfResponse.json().catch(() => null);
        const selfResult = isRecord(selfPayload) && isRecord(selfPayload.result) ? selfPayload.result : undefined;
        const bidderId = selfResult ? identifier(selfResult.id) : undefined;
        if (!bidderId || !/^\d+$/.test(bidderId) || !Number.isSafeInteger(Number(bidderId))) {
          throw new FreelancerSandboxWriteError(undefined, 'ID akun sandbox tidak ditemukan; bid tidak dikirim.');
        }
        const response = await this.request(`${SANDBOX_API_ROOT}/projects/0.1/bids/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: input.projectId,
            bidder_id: Number(bidderId),
            amount: input.amount,
            period: input.period,
            milestone_percentage: input.milestonePercentage,
            description: input.description,
          }),
        });
        await response.body?.cancel().catch(() => {});
        return { statusCode: response.status };
      }
      case 'edit_profile': {
        const response = await this.request(`${SANDBOX_API_ROOT}/users/0.1/self/jobs/`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 'jobs[]': input.jobIds }),
        });
        await response.body?.cancel().catch(() => {});
        return { statusCode: response.status };
      }
      case 'send_message': {
        const response = await this.request(`${SANDBOX_API_ROOT}/messages/0.1/threads/${input.threadId}/messages/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ message: input.message }),
        });
        await response.body?.cancel().catch(() => {});
        return { statusCode: response.status };
      }
    }
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        redirect: 'error',
        headers: {
          'Freelancer-OAuth-V1': this.options.token,
          Accept: 'application/json',
          'User-Agent': 'freelancer-virtual-house-sandbox-check',
          ...init.headers,
        },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 12_000),
      });
    } catch {
      throw new FreelancerSandboxWriteError(undefined, 'Sandbox Freelancer tidak dapat dijangkau dari server lokal.');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new FreelancerSandboxWriteError(response.status, `Sandbox Freelancer mengembalikan HTTP ${response.status}.`);
    }
    return response;
  }
}
