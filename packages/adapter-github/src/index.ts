import { isEligibleKnowledgePath } from '@fvh/knowledge';

const API_ROOT = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const MAX_REPOSITORY_FILES = 100;
const MAX_FILE_BYTES = 100_000;
const MAX_OWN_REPOSITORIES = 50;

export type GitHubFile = { path: string; content: string };
export type GitHubReadResult = { repository: string; branch: string; ref: string; files: GitHubFile[]; fetched: number; skipped: number };
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class GitHubReadError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'GitHubReadError';
  }
}

export class GitHubReadAdapter {
  private readonly fetcher: Fetcher;

  constructor(private readonly options: { token?: string; fetcher?: Fetcher; timeoutMs?: number } = {}) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async readRepository(repository: string): Promise<GitHubReadResult> {
    if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
      throw new GitHubReadError('invalid_repository', 'Gunakan format pemilik/nama-repositori.');
    }
    const [owner, repo] = repository.split('/') as [string, string];
    const repoDetails = await this.getJson(`${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`) as { default_branch?: unknown };
    if (typeof repoDetails.default_branch !== 'string' || !repoDetails.default_branch) {
      throw new GitHubReadError('invalid_repository_response', 'GitHub tidak mengembalikan cabang utama yang valid.');
    }
    const branch = repoDetails.default_branch;
    const tree = await this.getJson(`${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`) as {
      sha?: unknown;
      truncated?: unknown;
      tree?: unknown;
    };
    if (tree.truncated === true) throw new GitHubReadError('tree_truncated', 'Indeks dihentikan karena daftar file GitHub terpotong.');
    if (!Array.isArray(tree.tree) || typeof tree.sha !== 'string') {
      throw new GitHubReadError('invalid_tree_response', 'Struktur repositori tidak dapat dibaca.');
    }

    const entries = tree.tree as Array<{ path?: unknown; type?: unknown; size?: unknown }>;
    const eligible = entries.filter((entry) => entry.type === 'blob' && typeof entry.path === 'string' && isEligibleKnowledgePath(entry.path) && typeof entry.size === 'number' && entry.size <= MAX_FILE_BYTES).slice(0, MAX_REPOSITORY_FILES);
    const files: GitHubFile[] = [];
    for (const entry of eligible) {
      const path = entry.path as string;
      const raw = await this.getText(`${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);
      files.push({ path, content: raw });
    }
    return {
      repository,
      branch,
      ref: tree.sha,
      files,
      fetched: files.length,
      skipped: entries.length - files.length,
    };
  }

  private async request(url: string, accept: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'GET',
        headers: {
          Accept: accept,
          'X-GitHub-Api-Version': API_VERSION,
          'User-Agent': 'freelancer-virtual-house-local',
          ...(this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {}),
        },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 12_000),
      });
    } catch {
      throw new GitHubReadError('network_error', 'GitHub tidak dapat dijangkau. Sinkronisasi dapat dicoba lagi nanti.');
    }
    if (response.status === 401 || response.status === 403) throw new GitHubReadError('permission_denied', 'GitHub menolak akses repositori. Periksa izin baca Contents.');
    if (response.status === 404) throw new GitHubReadError('repository_not_found', 'Repositori tidak ditemukan atau tidak tersedia untuk token ini.');
    if (response.status === 429) throw new GitHubReadError('rate_limited', 'GitHub membatasi permintaan. Sinkronisasi dihentikan tanpa retry otomatis.');
    if (!response.ok) throw new GitHubReadError('provider_error', `GitHub mengembalikan status ${response.status}.`);
    return response;
  }

  /** Repositories owned by the token's user; forks and archived repos are skipped as they are not the owner's current work. */
  async listOwnRepositories(limit = MAX_OWN_REPOSITORIES): Promise<string[]> {
    const names: string[] = [];
    for (let page = 1; names.length < limit; page += 1) {
      const rows = await this.getJson(`${API_ROOT}/user/repos?affiliation=owner&sort=pushed&per_page=100&page=${page}`);
      if (!Array.isArray(rows)) throw new GitHubReadError('invalid_repository_response', 'GitHub tidak mengembalikan daftar repositori yang valid.');
      for (const row of rows as Array<{ full_name?: unknown; fork?: unknown; archived?: unknown }>) {
        if (typeof row.full_name === 'string' && row.fork !== true && row.archived !== true) names.push(row.full_name);
      }
      if (rows.length < 100) break;
    }
    return names.slice(0, limit);
  }

  private async getJson(url: string): Promise<unknown> {
    const response = await this.request(url, 'application/vnd.github+json');
    return response.json();
  }

  private async getText(url: string): Promise<string> {
    const response = await this.request(url, 'application/vnd.github.raw+json');
    const content = await response.text();
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) throw new GitHubReadError('file_too_large', 'GitHub mengembalikan file di atas batas indeks.');
    return content;
  }
}
