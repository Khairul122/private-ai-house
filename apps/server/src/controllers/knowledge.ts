import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { GitHubReadAdapter, GitHubReadError } from '@fvh/adapter-github';
import { createId, hashPayload } from '@fvh/application';
import { knowledgeImportSchema, knowledgeSearchSchema } from '@fvh/contracts';
import { prepareKnowledgeFile } from '@fvh/knowledge';
import { paramsSchema, parseBody, type AppContext } from './shared.js';

const githubSyncSchema = z.object({ repository: z.string().trim().min(3).max(200) });

type SyncJob = { id: string; provider: 'github' | 'linkedin'; state: 'running' | 'completed' | 'failed'; startedAt: string; finishedAt: string | null; current: string | null; total: number; completed: number; chunks: number; results: Array<{ label: string; chunks: number; error: string | null; note?: string }>; error: string | null };

export function knowledgeController({ options, repository, now }: AppContext) {
  const githubAdapter = () => {
    const token = options.getGitHubToken?.() ?? options.githubToken;
    return new GitHubReadAdapter({ ...(token ? { token } : {}), ...(options.fetcher ? { fetcher: options.fetcher } : {}) });
  };
  // Re-syncing a repository replaces its previous source instead of indexing it twice.
  const syncGitHubRepository = async (adapter: GitHubReadAdapter, name: string) => {
    const existing = (await repository.listKnowledgeSources()).find((item) => item.provider === 'github' && item.label.toLowerCase() === name.toLowerCase());
    const knownRef = existing ? await repository.knowledgeSourceRef(existing.id) : undefined;
    const result = await adapter.readRepository(name, knownRef);
    const sourceId = existing?.id ?? `github:${hashPayload(result.repository.toLowerCase()).slice(0, 32)}`;
    const updatedAt = now().toISOString();
    const repositoryUrl = `https://github.com/${result.repository}`;
    if (result.unchanged && existing) {
      await repository.markKnowledgeChecked(existing.id, updatedAt);
      await repository.appendAudit({ type: 'knowledge.github_sync', resourceId: existing.id, status: 'recorded', reason: `${result.repository}: snapshot ${result.ref} tetap sama; ${existing.chunkCount} potongan dipertahankan tanpa mengunduh ulang.`, policyVersion: (await repository.getPolicy()).version, payloadHash: null });
      return { result, chunks: existing.chunkCount, rejected: 0, source: { ...existing, updatedAt } };
    }
    const chunks = [];
    let rejected = 0;
    for (const file of result.files) {
      const prepared = prepareKnowledgeFile({ sourceId, provider: 'github', label: result.repository, referenceUrl: repositoryUrl, sourceRef: result.ref, updatedAt, path: file.path, content: file.content });
      if (prepared.ok) chunks.push(...prepared.chunks);
      else rejected += 1;
    }
    if (!chunks.length) return { result, chunks: 0, rejected, source: null };
    await repository.replaceKnowledgeSource({ id: sourceId, provider: 'github', label: result.repository, referenceUrl: repositoryUrl, updatedAt }, chunks);
    const source = (await repository.listKnowledgeSources()).find((item) => item.id === sourceId)!;
    await repository.appendAudit({ type: 'knowledge.github_sync', resourceId: sourceId, status: 'recorded', reason: `${result.repository}: ${result.fetched} file dibaca pada ${result.ref}; ${rejected + result.skipped} file dilewati.`, policyVersion: (await repository.getPolicy()).version, payloadHash: null });
    return { result, chunks: chunks.length, rejected, source };
  };

  let knowledgeJob: SyncJob | null = null;
  let knowledgeTask: Promise<void> | null = null;

  return {
    /** onClose hook: lets a running background sync finish before the repository closes. */
    waitForSync: async () => { await knowledgeTask; },

    overview: async () => ({
      sources: await repository.listKnowledgeSources(),
      coverage: await repository.knowledgeCoverage(),
      freshness: (await repository.listKnowledgeSources()).map(({ id, updatedAt }) => ({ id, updatedAt })),
      searchMode: 'postgres-fts',
    }),

    importFiles: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = parseBody(knowledgeImportSchema, request.body);
      if ('issues' in parsed) return reply.code(400).send({ error: 'Impor tidak valid.', issues: parsed.issues });
      const sourceId = createId('source');
      const updatedAt = now().toISOString();
      const chunks = [];
      const rejected: Array<{ path: string; code: string; reason: string }> = [];
      for (const file of parsed.value.files) {
        const prepared = prepareKnowledgeFile({ ...file, sourceId, provider: parsed.value.provider, label: parsed.value.label, referenceUrl: parsed.value.referenceUrl, sourceRef: parsed.value.sourceRef || 'user-import', updatedAt });
        if (prepared.ok) chunks.push(...prepared.chunks);
        else rejected.push({ path: file.path, code: prepared.code, reason: prepared.reason });
      }
      if (chunks.length === 0) return reply.code(422).send({ error: 'Tidak ada konten yang lolos pemeriksaan sebelum indeks.', rejected });
      const source = await repository.createKnowledgeSource({ id: sourceId, provider: parsed.value.provider, label: parsed.value.label, referenceUrl: parsed.value.referenceUrl, updatedAt }, chunks);
      await repository.appendAudit({ type: 'knowledge.imported', resourceId: sourceId, status: 'recorded', reason: `${chunks.length} potongan teks ditambahkan; ${rejected.length} file dikecualikan.`, policyVersion: (await repository.getPolicy()).version, payloadHash: null });
      return reply.code(201).send({ source, chunks: chunks.length, rejected });
    },

    syncStatus: async () => ({ job: knowledgeJob }),
    currentJob: () => knowledgeJob,

    startSync: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = z.object({ provider: z.enum(['github', 'linkedin']), repository: z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/).optional() }).safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Pilih GitHub atau LinkedIn dan format repositori yang valid.' });
      if (knowledgeJob?.state === 'running') return reply.code(409).send({ error: 'Sinkronisasi lain masih berjalan. Tunggu hingga selesai.' });
      if (parsed.data.provider === 'linkedin' && !options.syncLinkedIn) return reply.code(409).send({ error: 'Sinkronisasi LinkedIn belum tersedia.' });
      if (parsed.data.provider === 'github' && !parsed.data.repository && !(options.getGitHubToken?.() ?? options.githubToken)) return reply.code(400).send({ error: 'Token GitHub diperlukan untuk membaca daftar repo milik Anda.' });
      const job: SyncJob = { id: createId('sync'), provider: parsed.data.provider, state: 'running', startedAt: now().toISOString(), finishedAt: null, current: 'Membaca sumber API', total: 0, completed: 0, chunks: 0, results: [], error: null };
      knowledgeJob = job;
      knowledgeTask = (async () => {
        try {
          if (parsed.data.provider === 'linkedin') {
            job.total = 1; job.current = 'LinkedIn /userinfo';
            const result = await options.syncLinkedIn!();
            job.chunks = result.chunks; job.completed = 1;
            job.results.push({ label: 'LinkedIn API userinfo', chunks: result.chunks, error: null });
          } else {
            const adapter = githubAdapter();
            const names = parsed.data.repository ? [parsed.data.repository] : await adapter.listOwnRepositories();
            job.total = names.length;
            for (const name of names) {
              job.current = name;
              try {
                const result = await syncGitHubRepository(adapter, name);
                job.results.push({ label: name, chunks: result.chunks, error: null, ...(!result.chunks ? { note: 'Dilewati: tidak ada berkas teks yang lolos pemeriksaan.' } : result.result.limited > 0 || result.rejected > 0 ? { note: `Cakupan parsial: ${result.result.limited} berkas layak belum diambil, ${result.rejected} ditolak pemeriksaan konten.` } : {}) });
                job.chunks += result.chunks;
              } catch (error) {
                const message = error instanceof GitHubReadError ? error.message : 'Repositori tidak dapat diindeks; sumber sebelumnya dipertahankan.';
                job.results.push({ label: name, chunks: 0, error: error instanceof GitHubReadError && error.code === 'repository_empty' ? null : message, ...(error instanceof GitHubReadError && error.code === 'repository_empty' ? { note: 'Dilewati: repositori kosong.' } : {}) });
                if (error instanceof GitHubReadError && error.code === 'rate_limited') throw error;
              }
              job.completed += 1;
            }
          }
          job.state = job.results.some((item) => item.error) ? 'failed' : 'completed';
          job.error = job.state === 'failed' ? 'Sebagian sumber gagal. Periksa hasil per sumber; sumber yang berhasil sudah tersimpan.' : null;
        } catch (error) {
          job.state = 'failed'; job.error = error instanceof GitHubReadError ? error.message : 'API tidak dapat disinkronkan. Periksa koneksi dan izin akun di Status Integrasi.';
        } finally {
          job.finishedAt = now().toISOString(); job.current = null;
        }
      })();
      return reply.code(202).send({ job });
    },

    syncGitHub: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = parseBody(githubSyncSchema, request.body);
      if ('issues' in parsed) return reply.code(400).send({ error: 'Repositori tidak valid.', issues: parsed.issues });
      try {
        const { result, chunks, rejected, source } = await syncGitHubRepository(githubAdapter(), parsed.value.repository);
        if (!source) return reply.code(422).send({ error: 'Tidak ada file yang lolos pemeriksaan sebelum indeks.', filesSeen: result.fetched, rejected });
        return reply.code(201).send({ source, branch: result.branch, ref: result.ref, filesSeen: result.fetched, chunks, rejected: rejected + result.skipped, eligible: result.eligible, limited: result.limited, complete: result.limited === 0 && rejected === 0 });
      } catch (error) {
        if (error instanceof GitHubReadError) return reply.code(error.code === 'permission_denied' ? 403 : error.code === 'repository_not_found' ? 404 : 502).send({ error: error.message, code: error.code });
        return reply.code(502).send({ error: 'Sinkronisasi GitHub gagal; tidak ada data yang ditambahkan.' });
      }
    },

    syncAllGitHub: async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!(options.getGitHubToken?.() ?? options.githubToken)) return reply.code(400).send({ error: 'Token GitHub belum diatur; daftar repositori milik Anda tidak dapat dibaca.' });
      const adapter = githubAdapter();
      let names: string[];
      try {
        names = await adapter.listOwnRepositories();
      } catch (error) {
        return reply.code(error instanceof GitHubReadError && error.code === 'permission_denied' ? 403 : 502).send({ error: error instanceof Error ? error.message : 'Daftar repositori tidak dapat dibaca.' });
      }
      const repositories: Array<{ repository: string; chunks: number; error: string | null }> = [];
      for (const name of names) {
        try {
          const { chunks } = await syncGitHubRepository(adapter, name);
          repositories.push({ repository: name, chunks, error: chunks ? null : 'Tidak ada file teks yang lolos pemeriksaan.' });
        } catch (error) {
          repositories.push({ repository: name, chunks: 0, error: error instanceof Error ? error.message : 'Gagal dibaca.' });
        }
      }
      return { repositories, synced: repositories.filter((item) => item.chunks > 0).length, chunks: repositories.reduce((total, item) => total + item.chunks, 0) };
    },

    search: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = parseBody(knowledgeSearchSchema, request.body);
      if ('issues' in parsed) return reply.code(400).send({ error: 'Pencarian tidak valid.', issues: parsed.issues });
      return await repository.searchKnowledge(parsed.value.query, parsed.value.limit);
    },

    deleteSource: async (request: FastifyRequest, reply: FastifyReply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: 'ID sumber tidak valid.' });
      if (!await repository.deleteKnowledgeSource(params.data.id)) return reply.code(404).send({ error: 'Sumber tidak ditemukan.' });
      await repository.appendAudit({ type: 'knowledge.deleted', resourceId: params.data.id, status: 'recorded', reason: 'Sumber dan potongan indeks terkait dihapus.', policyVersion: (await repository.getPolicy()).version, payloadHash: null });
      return { deleted: true, id: params.data.id };
    },
  };
}
