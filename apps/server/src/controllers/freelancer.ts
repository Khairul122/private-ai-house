import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FreelancerReadError, FreelancerSandboxWriteError, FreelancerWriteError } from '@fvh/adapter-freelancer';
import type { FreelancerSandboxWriteInput, FreelancerWriteOperation } from '@fvh/adapter-freelancer';
import { hashPayload } from '@fvh/application';
import type { WorkspaceRepository } from '@fvh/persistence';
import { parseBody, type AppContext, type FreelancerProductionWriteCheck } from './shared.js';

const freelancerSyncSchema = z.object({ query: z.string().trim().min(2).max(120), limit: z.number().int().min(1).max(50).default(25) });
const safeFreelancerIdSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const freelancerSandboxWriteSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('submit_bid'), projectId: safeFreelancerIdSchema, amount: z.number().finite().positive(), period: z.number().int().positive(), milestonePercentage: z.number().int().min(1).max(100), description: z.string().trim().min(1).max(4_000) }),
  z.object({ operation: z.literal('edit_profile'), jobIds: z.array(safeFreelancerIdSchema).min(1).max(20).refine((ids) => new Set(ids).size === ids.length, 'ID job tidak boleh duplikat.') }),
  z.object({ operation: z.literal('send_message'), threadId: safeFreelancerIdSchema, message: z.string().trim().min(1).max(4_000) }),
]);

// Reads per type: high-volume audit (skips, cycles) must not push older HTTP 200 evidence out of a global window.
export async function readProductionWriteChecks(repository: WorkspaceRepository): Promise<Map<FreelancerWriteOperation, FreelancerProductionWriteCheck>> {
  const checks = new Map<FreelancerWriteOperation, FreelancerProductionWriteCheck>();
  for (const operation of ['submit_bid', 'edit_profile', 'send_message'] as const) {
    // ponytail: newest 1000 outcomes per operation; a dedicated "latest 200" query if failures ever exceed that.
    const events = (await repository.listAuditForType(`marketplace.production.${operation}`, 1_000)).filter((event) => event.status !== 'allowed');
    const httpStatus = (reason: string) => Number(reason.match(/HTTP (\d{3})/)?.[1]) || null;
    const latest = events[0];
    const success = events.find((event) => event.status === 'recorded' && httpStatus(event.reason) === 200);
    const chosen = success ?? latest;
    if (!chosen) continue;
    const resultId = chosen.reason.match(/ID hasil: (\d{1,30})/)?.[1];
    // A newer failure (e.g. the account bid quota) is reported beside the success instead of erasing it.
    const newerFailure = success && latest !== success ? latest : undefined;
    const errorCode = newerFailure?.reason.match(/ExceptionCodes\.([A-Z_]{1,60})/)?.[1];
    checks.set(operation, {
      statusCode: httpStatus(chosen.reason),
      checkedAt: chosen.createdAt,
      ...(resultId ? { resultId } : {}),
      ...(newerFailure ? { lastFailure: { statusCode: httpStatus(newerFailure.reason), checkedAt: newerFailure.createdAt, ...(errorCode ? { errorCode } : {}) } } : {}),
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
