import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FreelancerReadError, FreelancerSandboxWriteError, FreelancerWriteError } from '@fvh/adapter-freelancer';
import type { FreelancerSandboxWriteInput, FreelancerWriteInput, FreelancerWriteOperation } from '@fvh/adapter-freelancer';
import { hashPayload } from '@fvh/application';
import type { WorkspaceRepository } from '@fvh/persistence';
import { parseBody, type AppContext, type FreelancerProductionWriteCheck } from './shared.js';

const freelancerSyncSchema = z.object({ query: z.string().trim().min(2).max(120), limit: z.number().int().min(1).max(50).default(25) });
const safeFreelancerIdSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const freelancerProductionWriteSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('submit_bid'), projectId: safeFreelancerIdSchema, amount: z.number().finite().positive(), period: z.number().int().positive(), milestonePercentage: z.number().int().min(1).max(100), description: z.string().trim().min(1).max(4_000), confirmLive: z.literal(true) }),
  z.object({ operation: z.literal('edit_profile'), jobIds: z.array(safeFreelancerIdSchema).min(1).max(20).refine((ids) => new Set(ids).size === ids.length, 'ID job tidak boleh duplikat.'), confirmLive: z.literal(true) }),
  z.object({ operation: z.literal('send_message'), threadId: safeFreelancerIdSchema, message: z.string().trim().min(1).max(4_000), confirmLive: z.literal(true) }),
]);
const freelancerSandboxWriteSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('submit_bid'), projectId: safeFreelancerIdSchema, amount: z.number().finite().positive(), period: z.number().int().positive(), milestonePercentage: z.number().int().min(1).max(100), description: z.string().trim().min(1).max(4_000) }),
  z.object({ operation: z.literal('edit_profile'), jobIds: z.array(safeFreelancerIdSchema).min(1).max(20).refine((ids) => new Set(ids).size === ids.length, 'ID job tidak boleh duplikat.') }),
  z.object({ operation: z.literal('send_message'), threadId: safeFreelancerIdSchema, message: z.string().trim().min(1).max(4_000) }),
]);

export async function readProductionWriteChecks(repository: WorkspaceRepository): Promise<Map<FreelancerWriteOperation, FreelancerProductionWriteCheck>> {
  const checks = new Map<FreelancerWriteOperation, FreelancerProductionWriteCheck>();
  const operations = new Set<FreelancerWriteOperation>(['submit_bid', 'edit_profile', 'send_message']);
  for (const event of await repository.listAudit(1_000)) {
    const prefix = 'marketplace.production.';
    if (!event.type.startsWith(prefix) || event.status === 'allowed') continue;
    const operation = event.type.slice(prefix.length) as FreelancerWriteOperation;
    if (!operations.has(operation) || checks.get(operation)?.statusCode === 200) continue;
    const statusCode = event.reason.match(/HTTP (\d{3})/)?.[1];
    if (checks.has(operation) && statusCode !== '200') continue;
    const resultId = event.reason.match(/ID hasil: (\d{1,30})/)?.[1];
    checks.set(operation, {
      statusCode: statusCode ? Number(statusCode) : null,
      checkedAt: event.createdAt,
      ...(resultId ? { resultId } : {}),
    });
  }
  return checks;
}

export function freelancerController({ options, repository, now, state, freelancerSandboxWriteChecks, freelancerProductionWriteChecks }: AppContext) {
  return {
    verify: async (_request: FastifyRequest, reply: FastifyReply) => {
      const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
      if (!credentialStatus?.freelancerAccessTokenConfigured) return reply.code(409).send({ error: 'Token Freelancer belum dikonfigurasi di .env atau secure store Windows.' });
      if (!options.verifyFreelancer) return reply.code(503).send({ error: 'Pemeriksaan koneksi Freelancer belum tersedia di server ini.' });
      const freelancerVerification = state.freelancerVerification = await options.verifyFreelancer();
      const resultSummary = [
        ['profil', freelancerVerification.readProfile],
        ['proyek', freelancerVerification.readProjects],
        ['portofolio', freelancerVerification.readPortfolio ?? false],
        ['pesan', freelancerVerification.readMessages ?? false],
      ].map(([label, ok]) => `${label}: ${ok ? 'ok' : 'belum terverifikasi'}`).join('; ');
      return {
        ...freelancerVerification,
        message: `${freelancerVerification.connected ? 'Koneksi Freelancer berhasil diperiksa' : 'Koneksi Freelancer belum terverifikasi'}. ${resultSummary}.`,
      };
    },

    sandboxWriteTest: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!options.freelancerSandboxTokenConfigured) {
        return reply.code(409).send({ error: 'Token sandbox Freelancer belum dikonfigurasi pada FVH_FREELANCER_SANDBOX_ACCESS_TOKEN.' });
      }
      if (!options.verifyFreelancerSandboxWrite) {
        return reply.code(503).send({ error: 'Adapter uji tulis sandbox belum tersedia di server ini.' });
      }
      const parsed = parseBody(freelancerSandboxWriteSchema, request.body);
      if ('issues' in parsed) return reply.code(400).send({ error: 'Data uji sandbox tidak valid.', issues: parsed.issues });

      const input = parsed.value as FreelancerSandboxWriteInput;
      try {
        const result = await options.verifyFreelancerSandboxWrite(input);
        const checkedAt = now().toISOString();
        freelancerSandboxWriteChecks.set(input.operation, {
          statusCode: result.statusCode, checkedAt,
          ...(result.resultId ? { resultId: result.resultId } : {}),
          ...(result.resultStatus ? { resultStatus: result.resultStatus } : {}),
        });
        const success = result.statusCode === 200;
        const resultDescription = result.resultId ? `ID hasil: ${result.resultId}.` : result.resultStatus ? `Status hasil: ${result.resultStatus}.` : 'Freelancer tidak memberikan ID hasil.';
        await repository.appendAudit({
          type: `marketplace.sandbox.${input.operation}_test`, resourceId: result.resultId ?? 'freelancer-sandbox',
          status: success ? 'recorded' : 'failed',
          reason: `Uji tulis sandbox ${input.operation} menghasilkan HTTP ${result.statusCode}. ${resultDescription} Isi payload tidak disimpan.`,
          policyVersion: (await repository.getPolicy()).version, payloadHash: hashPayload(input),
        });
        if (!success) return reply.code(502).send({ error: `Freelancer sandbox merespons HTTP ${result.statusCode}; status bukan 200.`, providerStatusCode: result.statusCode });
        return {
          operation: input.operation, statusCode: result.statusCode, environment: 'sandbox', checkedAt,
          ...(result.resultId ? { resultId: result.resultId } : {}),
          ...(result.resultStatus ? { resultStatus: result.resultStatus } : {}),
          message: `Uji ${input.operation} menerima HTTP 200 dari Freelancer sandbox. ${resultDescription}`,
        };
      } catch (error) {
        const checkedAt = now().toISOString();
        const providerStatusCode = error instanceof FreelancerSandboxWriteError ? error.statusCode ?? null : null;
        freelancerSandboxWriteChecks.set(input.operation, { statusCode: providerStatusCode, checkedAt });
        await repository.appendAudit({
          type: `marketplace.sandbox.${input.operation}_test`, resourceId: 'freelancer-sandbox', status: 'failed',
          reason: providerStatusCode === null
            ? `Uji tulis sandbox ${input.operation} tidak menerima hasil; jangan retry sebelum memeriksa sandbox.`
            : `Uji tulis sandbox ${input.operation} menghasilkan HTTP ${providerStatusCode}.`,
          policyVersion: (await repository.getPolicy()).version, payloadHash: hashPayload(input),
        });
        const message = providerStatusCode === null
          ? 'Uji sandbox tidak memperoleh respons yang dapat dipastikan. Periksa thread/proyek sandbox sebelum mengulang.'
          : `Freelancer sandbox merespons HTTP ${providerStatusCode}; status bukan 200.`;
        return reply.code(502).send({ error: message, providerStatusCode });
      }
    },

    productionWrite: async (request: FastifyRequest, reply: FastifyReply) => {
      const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
      if (!credentialStatus?.freelancerAccessTokenConfigured) {
        return reply.code(409).send({ error: 'Token produksi Freelancer belum dikonfigurasi di .env atau secure store Windows.' });
      }
      if (!options.runFreelancerProductionWrite) {
        return reply.code(503).send({ error: 'Adapter operasi live Freelancer belum tersedia di server ini.' });
      }
      const parsed = parseBody(freelancerProductionWriteSchema, request.body);
      if ('issues' in parsed) return reply.code(400).send({ error: 'Data operasi live tidak valid.', issues: parsed.issues });

      const { confirmLive, ...input } = parsed.value;
      if (!confirmLive) return reply.code(400).send({ error: 'Konfirmasi operasi live wajib diberikan.' });
      const liveInput = input as FreelancerWriteInput;
      try {
        const result = await options.runFreelancerProductionWrite(liveInput);
        const checkedAt = now().toISOString();
        const check = {
          statusCode: result.statusCode, checkedAt,
          ...(result.resultId ? { resultId: result.resultId } : {}),
          ...(result.resultStatus ? { resultStatus: result.resultStatus } : {}),
        };
        freelancerProductionWriteChecks.set(liveInput.operation, check);
        const resultDescription = result.resultId ? `ID hasil: ${result.resultId}.` : result.resultStatus ? `Status hasil: ${result.resultStatus}.` : 'Freelancer tidak memberikan ID hasil.';
        const success = result.statusCode === 200;
        await repository.appendAudit({
          type: `marketplace.production.${liveInput.operation}`, resourceId: result.resultId ?? 'freelancer-production',
          status: success ? 'recorded' : 'failed',
          reason: `Operasi live ${liveInput.operation} menghasilkan HTTP ${result.statusCode}. ${resultDescription} Isi payload tidak disimpan.`,
          policyVersion: (await repository.getPolicy()).version, payloadHash: hashPayload(liveInput),
        });
        if (!success) return reply.code(502).send({ error: `Freelancer merespons HTTP ${result.statusCode}; operasi tidak dinyatakan berhasil.`, providerStatusCode: result.statusCode });
        return {
          operation: liveInput.operation, statusCode: result.statusCode, environment: 'production', checkedAt,
          ...(result.resultId ? { resultId: result.resultId } : {}),
          ...(result.resultStatus ? { resultStatus: result.resultStatus } : {}),
          message: `Freelancer production menerima ${liveInput.operation} dengan HTTP 200. ${resultDescription}`,
        };
      } catch (error) {
        const checkedAt = now().toISOString();
        const providerStatusCode = error instanceof FreelancerWriteError ? error.statusCode ?? null : null;
        freelancerProductionWriteChecks.set(liveInput.operation, { statusCode: providerStatusCode, checkedAt });
        await repository.appendAudit({
          type: `marketplace.production.${liveInput.operation}`, resourceId: 'freelancer-production', status: 'failed',
          reason: providerStatusCode === null
            ? `Hasil operasi live ${liveInput.operation} tidak dapat dipastikan; periksa akun Freelancer sebelum mengulang.`
            : `Operasi live ${liveInput.operation} menghasilkan HTTP ${providerStatusCode}.`,
          policyVersion: (await repository.getPolicy()).version, payloadHash: hashPayload(liveInput),
        });
        const message = providerStatusCode === null
          ? 'Hasil operasi live tidak dapat dipastikan. Periksa akun Freelancer sebelum mencoba lagi agar tidak membuat duplikasi.'
          : `Freelancer merespons HTTP ${providerStatusCode}; operasi tidak dinyatakan berhasil.`;
        return reply.code(502).send({ error: message, providerStatusCode });
      }
    },

    syncProjects: async (request: FastifyRequest, reply: FastifyReply) => {
      const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
      if (!credentialStatus?.freelancerAccessTokenConfigured) return reply.code(409).send({ error: 'Token Freelancer belum dikonfigurasi di .env atau secure store Windows.' });
      if (!options.readFreelancerProjects) return reply.code(503).send({ error: 'Sinkronisasi Freelancer belum tersedia di server ini.' });
      const parsed = parseBody(freelancerSyncSchema, request.body);
      if ('issues' in parsed) return reply.code(400).send({ error: 'Pencarian proyek tidak valid.', issues: parsed.issues });
      try {
        const result = await options.readFreelancerProjects(parsed.value.query, parsed.value.limit);
        const synced = await repository.syncFreelancerProjects(result.projects);
        const freelancerVerification = state.freelancerVerification;
        state.freelancerVerification = {
          connected: true,
          readProfile: freelancerVerification?.readProfile ?? false,
          readProjects: true,
          readPortfolio: freelancerVerification?.readPortfolio ?? false,
          readMessages: freelancerVerification?.readMessages ?? false,
          ...(freelancerVerification?.portfolioError ? { portfolioError: freelancerVerification.portfolioError } : {}),
          ...(freelancerVerification?.messagesError ? { messagesError: freelancerVerification.messagesError } : {}),
          reason: freelancerVerification?.readProfile ? 'verified' : 'profile_unavailable',
        };
        await repository.appendAudit({
          type: 'marketplace.projects_synced', resourceId: 'freelancer', status: 'recorded',
          reason: `Sinkronisasi baca-saja menyimpan ${synced.upserted} proyek dari Freelancer; ${result.skipped} hasil tidak valid dilewati.`,
          policyVersion: (await repository.getPolicy()).version, payloadHash: null,
        });
        return { imported: synced.upserted, skipped: result.skipped, projects: (await repository.listProjects()).filter((project) => project.source === 'freelancer') };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Freelancer tidak dapat diperiksa.';
        await repository.appendAudit({ type: 'marketplace.sync_failed', resourceId: 'freelancer', status: 'failed', reason: message, policyVersion: (await repository.getPolicy()).version, payloadHash: null });
        const statusCode = error instanceof FreelancerReadError ? error.statusCode : undefined;
        return reply.code(statusCode === 401 || statusCode === 403 || statusCode === 429 ? statusCode : 502).send({ error: message });
      }
    },
  };
}
