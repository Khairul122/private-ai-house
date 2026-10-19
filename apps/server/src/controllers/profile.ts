import type { FastifyReply, FastifyRequest } from 'fastify';
import { updateProfileSchema } from '@fvh/contracts';
import type { AutonomyPolicy } from '@fvh/domain';
import { parseBody, type AppContext } from './shared.js';

export function profileController({ repository }: AppContext) {
  return {
    get: async () => await repository.getProfile(),

    update: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = parseBody(updateProfileSchema, request.body);
      if ('issues' in parsed) return reply.code(400).send({ error: 'Profil tidak valid.', issues: parsed.issues });
      const profile = parsed.value;
      await repository.saveProfile(profile);
      const policy = await repository.getPolicy();
      if (policy.state === 'active') {
        const changed: AutonomyPolicy = { ...policy, state: 'draft', version: policy.version + 1, primaryField: profile.primaryField, specializations: profile.specializations };
        await repository.savePolicy(changed);
        await repository.appendAudit({ type: 'policy.reactivation_required', resourceId: 'policy', status: 'recorded', reason: 'Profil berubah; kebijakan kembali ke draf dan perlu diaktifkan ulang.', policyVersion: changed.version, payloadHash: null });
      } else {
        await repository.savePolicy({ ...policy, primaryField: profile.primaryField, specializations: profile.specializations });
      }
      await repository.appendAudit({ type: 'profile.updated', resourceId: 'profile', status: 'recorded', reason: 'Fakta dan bidang kerja lokal diperbarui.', policyVersion: (await repository.getPolicy()).version, payloadHash: null });
      return { profile, policy: await repository.getPolicy() };
    },
  };
}
