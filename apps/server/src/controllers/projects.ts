import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { assessProject, createId, hashPayload } from '@fvh/application';
import type { BidDraft } from '@fvh/domain';
import { validProjectsCoIdProposal } from '../models/projects-co-id-types.js';
import { paramsSchema, parseBody, type AppContext } from './shared.js';

const draftUpdateSchema = z.object({ proposal: z.string().trim().min(40).max(4_000), proposedPrice: z.number().finite().positive() });

export function projectsController({ options, repository, now, drafting, draftingMode, state }: AppContext) {
  return {
    list: async (request: FastifyRequest) => {
      const query = request.query as { search?: string; status?: string };
      const profile = await repository.getProfile();
      const search = query.search?.trim().toLowerCase() ?? '';
      const assessed = (await repository.listProjects()).map((project) => {
        const assessment = assessProject(project, profile.specializations);
        return { ...project, score: assessment.score, factors: assessment.factors };
      });
      await repository.evaluateProjects(assessed.map((project) => ({ id: project.id, score: project.score, factors: project.factors })));
      return assessed.filter((project) => (!search || `${project.title} ${project.description} ${project.skills.join(' ')}`.toLowerCase().includes(search)) && (!query.status || query.status === 'all' || project.status === query.status))
        .sort((a, b) => b.score - a.score);
    },

    get: async (request: FastifyRequest, reply: FastifyReply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: 'ID peluang tidak valid.' });
      const project = await repository.getProject(params.data.id);
      if (!project) return reply.code(404).send({ error: 'Peluang tidak ditemukan.' });
      return project;
    },

    latestDraft: async (request: FastifyRequest, reply: FastifyReply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: 'ID peluang tidak valid.' });
      return { draft: await repository.getLatestDraft(params.data.id) ?? null };
    },

    createDraft: async (request: FastifyRequest, reply: FastifyReply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: 'ID peluang tidak valid.' });
      const project = await repository.getProject(params.data.id);
      if (!project) return reply.code(404).send({ error: 'Peluang tidak ditemukan.' });
      if (project.source === 'projects_co_id') {
        if (!request.headers.origin) return reply.code(403).send({ error: 'Header Origin diperlukan.' });
        if (!options.projectsCoId) return reply.code(503).send({ error: 'Worker projects.co.id tidak tersedia.' });
        try { return reply.code(201).send(await options.projectsCoId.createDraft(project.id)); }
        catch { return reply.code(409).send({ error: 'Draf ditolak; periksa worker, kebijakan dan Aktivitas projects.co.id.' }); }
      }
      if (project.status !== 'open') return reply.code(409).send({ error: 'Peluang ini sudah tidak terbuka.' });
      if (draftingMode === 'disabled') return reply.code(503).send({ error: options.draftingReason ?? 'Hermes belum aktif. Hubungkan profil Hermes dan aktifkan persetujuan pemrosesan data sebelum meminta draf AI.' });
      const profile = await repository.getProfile();
      const score = assessProject(project, profile.specializations).score;
      let generated;
      // Lets the office show the Hermes lead as working only while a draft request is actually running.
      state.draftsInProgress += 1;
      try {
        const evidence=(await repository.searchKnowledge(`${project.title} ${project.skills.join(' ')}`,4)).map(item=>({label:item.path,source:item.url,content:item.content}));
        generated = await drafting.draftBid({
          project,
          profileFacts: profile.facts,
          evidence,publicPortfolio:await options.publicPortfolio?.(evidence).catch(()=>[]) ?? [],
          profileRate: { min: profile.minPrice, max: profile.maxPrice },
          score,
        });
      } catch {
        await repository.appendAudit({ type: 'bid.draft_failed', resourceId: project.id, status: 'failed', reason: 'Adapter drafting gagal atau mengembalikan output yang tidak valid. Tidak ada tindakan marketplace.', policyVersion: (await repository.getPolicy()).version, payloadHash: null });
        return reply.code(503).send({ error: 'Draf tidak dapat dibuat saat ini. Tidak ada tindakan marketplace yang dijalankan.' });
      } finally {
        state.draftsInProgress -= 1;
      }
      const draft: BidDraft = {
        id: createId('draft'), projectId: project.id, ...generated, currency: project.currency,
        status: 'draft_ready', createdAt: now().toISOString(),
      };
      await repository.createDraft(draft);
      await repository.appendAudit({ type: 'bid.draft_created', resourceId: project.id, status: 'recorded', reason: draftingMode === 'hermes' ? 'Draf dibuat Hermes dari fakta dan bukti lokal yang dipilih.' : 'Draf dibuat oleh adapter yang secara eksplisit dipilih untuk pengujian.', policyVersion: (await repository.getPolicy()).version, payloadHash: hashPayload({ proposal: draft.proposal, proposedPrice: draft.proposedPrice, currency: draft.currency }) });
      return reply.code(201).send(draft);
    },

    updateDraft: async (request: FastifyRequest, reply: FastifyReply) => {
      const params = paramsSchema.safeParse(request.params);
      const parsed = parseBody(draftUpdateSchema, request.body);
      if (!params.success) return reply.code(400).send({ error: 'ID draf tidak valid.' });
      if ('issues' in parsed) return reply.code(400).send({ error: 'Draf tidak valid.', issues: parsed.issues });
      const before = await repository.getDraft(params.data.id);
      if (!before) return reply.code(404).send({ error: 'Draf tidak ditemukan.' });
      if (before.projectId.startsWith('projects_co_id:')) {
        if (!request.headers.origin) return reply.code(403).send({ error: 'Header Origin diperlukan.' });
        if (parsed.value.proposedPrice !== before.proposedPrice || !validProjectsCoIdProposal(parsed.value.proposal, before.proposedPrice, before.durationDays)) return reply.code(400).send({ error: 'Harga dan durasi draf IDR tetap dari kebijakan; proposal maksimal 1.200 karakter.' });
      }
      const updated = await repository.updateDraft(params.data.id, parsed.value);
      if (!updated) return reply.code(404).send({ error: 'Draf tidak ditemukan.' });
      await repository.appendAudit({ type: 'bid.draft_updated', resourceId: updated.projectId, status: 'recorded', reason: 'Pemilik memperbarui draf lokal.', policyVersion: (await repository.getPolicy()).version, payloadHash: hashPayload({ proposal: updated.proposal, proposedPrice: updated.proposedPrice, currency: updated.currency }) });
      return updated;
    },

    pipeline: async () => {
      const drafts = await repository.latestDrafts();
      return (await repository.listProjects()).map((project) => ({ ...project, latestDraft: drafts.get(project.id) ?? null })).sort((a, b) => b.score - a.score);
    },
  };
}
