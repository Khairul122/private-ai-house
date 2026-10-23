import { z } from 'zod';
export const officeLearningEnabledSchema = z.object({ enabled: z.boolean() }).strict();
import { normalizeKeywords, PROJECTS_CO_ID_FIELDS, validPolicyTimezone } from '@fvh/domain';

const timezone = z.string().trim().min(3).max(80).refine(validPolicyTimezone, 'Zona waktu IANA tidak valid, misalnya Asia/Jakarta.');

export const updateProfileSchema = z.object({
  primaryField: z.string().trim().max(100),
  specializations: z.array(z.string().trim().min(1).max(80)).max(12),
  language: z.string().trim().min(2).max(40),
  currency: z.string().trim().length(3).toUpperCase(),
  timezone,
  minPrice: z.number().finite().min(0),
  maxPrice: z.number().finite().min(0),
  facts: z.array(z.object({ label: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(500), source: z.string().trim().min(1).max(300) })).max(30),
}).refine((profile) => profile.maxPrice >= profile.minPrice, { path: ['maxPrice'], message: 'Tarif maksimum harus sama atau lebih besar.' });

export const projectsCoIdSettingsSchema = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Username projects.co.id tidak valid.'),
  minPrice: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maxPrice: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  dailyBidLimit: z.number().int().min(0).max(50),
  weeklyBidLimit: z.number().int().min(0).max(200),
  mode: z.enum(['off', 'scan-only', 'drafts']),
  fields: z.array(z.enum(PROJECTS_CO_ID_FIELDS.map(field => field.id) as [string, ...string[]])).max(PROJECTS_CO_ID_FIELDS.length).default([]).transform(ids => [...new Set(ids)]),
  // Terms become a listing ?search= value, so keep them to plain words.
  keywords: z.array(z.string().trim().regex(/^[\p{L}\p{N}][\p{L}\p{N} .+#/-]{0,39}$/u, 'Kata kunci projects.co.id hanya huruf, angka, spasi dan . + # / -')).max(20).default([]),
  useProfileSkills: z.boolean().default(true),
  minimumScore: z.number().int().min(0).max(100).default(50),
}).strict().refine(value => value.maxPrice >= value.minPrice, { path: ['maxPrice'], message: 'Harga maksimum IDR harus sama atau lebih besar.' });

export const projectsCoIdModeSchema = z.object({ mode: z.enum(['off', 'scan-only', 'drafts']) }).strict();
export const projectsCoIdOwnerActionSchema = z.object({ confirm: z.literal(true) }).strict();
export const hermesKanbanTaskSchema = z.object({
  requestId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(200).regex(/^[^-]/, 'Judul tidak boleh diawali tanda minus.'),
  goal: z.string().trim().max(4000).default(''),
  assignee: z.string().regex(/^fvh-[a-z0-9-]{1,60}$/),
  includeData: z.boolean().default(true),
}).strict();

export const hermesKanbanRecoverySchema = z.object({
  message: z.string().trim().max(4000).default(''),
  resume: z.boolean().default(false),
}).strict().refine(input => input.resume || input.message.length > 0, 'Tulis komentar atau pilih lanjutkan.');

export const updatePolicySchema = z.object({
  projectsCoId: projectsCoIdSettingsSchema.optional(),
  allowedActions: z.array(z.enum(['bid.submit'])).max(1),
  keywords: z.array(z.string().trim().min(1).max(60)).max(300).transform(normalizeKeywords),
  minimumConfidence: z.number().min(0).max(1),
  minPrice: z.number().finite().min(0),
  maxPrice: z.number().finite().min(0),
  dailyBidLimit: z.number().int().min(0).max(50),
  weeklyBidLimit: z.number().int().min(0).max(200),
  timezone,
  activeHours: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(24) }),
  activeDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  allowUnknownDeadline: z.boolean().optional(),
  scanIntervalMinutes: z.number().int().min(5).max(60).optional(),
  maxRiskScore: z.number().min(0).max(1).optional(),
  requireSpecializationMatch: z.boolean().optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
  expectedVersion: z.number().int().positive().optional(),
  noNegotiationTerms: z.array(z.string().trim().min(2).max(80)).max(30),
}).refine((policy) => policy.maxPrice >= policy.minPrice, { path: ['maxPrice'], message: 'Harga maksimum harus sama atau lebih besar.' })
  .refine((policy) => policy.activeHours.end !== policy.activeHours.start, { path: ['activeHours'], message: 'Untuk operasi 24 jam gunakan 00–24; jam mulai dan selesai tidak boleh sama.' });

export const activatePolicySchema = z.object({ confirmLive: z.literal(true), mode: z.literal('live') });

export const knowledgeImportSchema = z.object({
  provider: z.enum(['github', 'linkedin', 'manual']),
  label: z.string().trim().min(1).max(120),
  referenceUrl: z.string().trim().max(500).refine((value) => value === '' || /^https:\/\//i.test(value), 'Gunakan URL HTTPS.'),
  sourceRef: z.string().trim().max(150),
  files: z.array(z.object({ path: z.string().trim().min(1).max(300), content: z.string().max(100_000) })).min(1).max(30),
});

export const knowledgeSearchSchema = z.object({ query: z.string().trim().min(2).max(200), limit: z.number().int().min(1).max(12).default(5) });

export const proposalDraftOutputSchema = z.object({
  proposal: z.string().trim().min(40).max(4_000),
  proposedPrice: z.number().finite().positive(),
  durationDays: z.number().int().min(1).max(365),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.object({ label: z.string().trim().min(1).max(200), source: z.string().trim().min(1).max(500) })).max(20),
  assumptions: z.array(z.string().trim().min(1).max(300)).max(20),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gunakan format tanggal YYYY-MM-DD.');
const currencyCode = z.string().trim().length(3).toUpperCase();

export const createClientProjectSchema = z.object({
  title: z.string().trim().min(1).max(150),
  client: z.string().trim().min(1).max(120),
  source: z.enum(['freelancer', 'direct', 'linkedin', 'projects_co_id', 'other']),
  status: z.enum(['active', 'delivered', 'closed']).default('active'),
  deadline: isoDate.nullable(),
  value: z.number().finite().min(0).nullable(),
  currency: currencyCode,
});

export const updateClientProjectSchema = z.object({
  status: z.enum(['active', 'delivered', 'closed']).optional(),
  deadline: isoDate.nullable().optional(),
  value: z.number().finite().min(0).nullable().optional(),
}).refine((patch) => Object.keys(patch).length > 0, 'Tidak ada perubahan.');

export const createPaymentSchema = z.object({
  projectId: z.string().min(1).max(100),
  amount: z.number().finite().positive(),
  currency: currencyCode,
  status: z.enum(['expected', 'received']),
  dueDate: isoDate.nullable(),
  note: z.string().trim().max(200).default(''),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;
export type KnowledgeImportInput = z.infer<typeof knowledgeImportSchema>;
export type ProposalDraftOutput = z.infer<typeof proposalDraftOutputSchema>;
export * from './operations.js';
