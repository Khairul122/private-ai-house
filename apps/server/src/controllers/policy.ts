import type { FastifyReply, FastifyRequest } from 'fastify';
import { hashPayload } from '@fvh/application';
import { activatePolicySchema, updatePolicySchema } from '@fvh/contracts';
import { CODING_KEYWORD_GROUPS, CODING_KEYWORDS } from '@fvh/domain';
import type { AutonomyPolicy } from '@fvh/domain';
import { parseBody, type AppContext } from './shared.js';

export function policyController({ options, repository, now }: AppContext) {
  return {
    get: async () => await repository.getPolicy(),

    presets: async () => ({ groups: CODING_KEYWORD_GROUPS, keywords: CODING_KEYWORDS, searchTermsPerCycle: 8, supportedBids: 'Harga tetap, USD', storage: 'postgres' }),

    update: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = parseBody(updatePolicySchema, request.body);
      if ('issues' in parsed) return reply.code(400).send({ error: 'Kebijakan tidak valid.', issues: parsed.issues });
      const previous = await repository.getPolicy();
      if (parsed.value.expectedVersion !== undefined && parsed.value.expectedVersion !== previous.version) return reply.code(409).send({ error: 'Kebijakan sudah berubah. Muat ulang sebelum menyimpan.' });
      const profile = await repository.getProfile();
      const { expectedVersion: _expectedVersion, validityDays, ...changes } = parsed.value;
      void _expectedVersion;
      const keepLive = previous.state === 'active' && !previous.simulationOnly;
      const next: AutonomyPolicy = {
        ...previous,
        ...changes,
        ...(validityDays === undefined ? {} : { expiresAt: new Date(now().getTime() + validityDays * 86_400_000).toISOString() }),
        version: previous.version + 1,
        state: previous.state,
        primaryField: profile.primaryField,
        specializations: profile.specializations,
        simulationOnly: previous.simulationOnly,
      };
      if (!await repository.savePolicyIfVersion(next, previous.version)) return reply.code(409).send({ error: 'Kebijakan berubah saat penyimpanan. Muat ulang sebelum menyimpan.' });
      await repository.appendAudit({ type: 'policy.updated', resourceId: 'policy', status: 'recorded', reason: keepLive ? 'Batas kebijakan live diperbarui; langsung berlaku di siklus berikutnya.' : 'Batas kebijakan diperbarui; perlu aktivasi ulang.', policyVersion: next.version, payloadHash: hashPayload(next) });
      return next;
    },

    activate: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = parseBody(activatePolicySchema, request.body);
      if ('issues' in parsed) return reply.code(400).send({ error: 'Konfirmasikan aktivasi bid live.', issues: parsed.issues });
      const policy = await repository.getPolicy();
      if (policy.state === 'paused') return reply.code(409).send({ error: 'Kebijakan dijeda. Gunakan tindakan lanjutkan oleh pemilik.' });
      if (!Number.isFinite(Date.parse(policy.expiresAt)) || Date.parse(policy.expiresAt) <= now().getTime()) return reply.code(409).send({ error: 'Perbarui masa berlaku sebelum aktivasi.' });
      if ((!options.autopilot || !(options.getCredentialStatus?.() ?? options.credentialStatus)?.freelancerAccessTokenConfigured)) return reply.code(409).send({ error: 'Autopilot dan kredensial Freelancer harus tersedia sebelum aktivasi live.' });
       if (options.freelancerBidCapability?.() !== 'supported') return reply.code(409).send({ error: 'Kemampuan submit bid Freelancer belum terverifikasi.' });
      const profile = await repository.getProfile();
      if (!profile.primaryField.trim() || profile.specializations.length === 0) return reply.code(409).send({ error: 'Isi bidang utama dan minimal satu spesialisasi sebelum mengaktifkan kebijakan.' });
      if (!policy.allowedActions.includes('bid.submit')) return reply.code(409).send({ error: 'Kebijakan harus mengizinkan tindakan bid.' });
      const activated: AutonomyPolicy = { ...policy, version: policy.version + 1, state: 'active', primaryField: profile.primaryField, specializations: profile.specializations, simulationOnly: false };
      await repository.savePolicy(activated);
      await repository.appendAudit({ type: 'policy.activated', resourceId: 'policy', status: 'recorded', reason: 'Pemilik mengaktifkan bid live dalam batas kebijakan tersimpan.', policyVersion: activated.version, payloadHash: hashPayload(activated) });
      void options.autopilot?.start();
      return { policy: activated, externalWrites: true };
    },

    pause: async () => {
      const policy = await repository.getPolicy();
      const paused: AutonomyPolicy = { ...policy, state: 'paused', version: policy.version + 1 };
      await repository.savePolicy(paused);
      await repository.appendAudit({ type: 'policy.paused', resourceId: 'policy', status: 'recorded', reason: 'Jeda darurat diaktifkan dari dashboard.', policyVersion: paused.version, payloadHash: null });
      return paused;
    },

    resume: async (_request: FastifyRequest, reply: FastifyReply) => {
      const policy = await repository.getPolicy();
      if (policy.state !== 'paused') return reply.code(409).send({ error: 'Kebijakan tidak sedang dijeda.' });
      if (!Number.isFinite(Date.parse(policy.expiresAt)) || Date.parse(policy.expiresAt) <= now().getTime()) return reply.code(409).send({ error: 'Kebijakan kedaluwarsa dan perlu dikonfigurasi ulang.' });
      const resumed = { ...policy, state: 'active' as const, version: policy.version + 1 };
      await repository.savePolicy(resumed);
      await repository.appendAudit({ type: 'policy.resumed', resourceId: 'policy', status: 'recorded', reason: 'Kebijakan dilanjutkan oleh pemilik.', policyVersion: resumed.version, payloadHash: null });
      void options.autopilot?.start();
      return resumed;
    },
  };
}
