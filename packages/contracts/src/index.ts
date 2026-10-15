import { z } from 'zod';

export const updateProfileSchema = z.object({
  primaryField: z.string().trim().max(100),
  specializations: z.array(z.string().trim().min(1).max(80)).max(12),
  language: z.string().trim().min(2).max(40),
  currency: z.string().trim().length(3).toUpperCase(),
  timezone: z.string().trim().min(3).max(80),
  minPrice: z.number().finite().min(0),
  maxPrice: z.number().finite().min(0),
  facts: z.array(z.object({ label: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(500), source: z.string().trim().min(1).max(300) })).max(30),
}).refine((profile) => profile.maxPrice >= profile.minPrice, { path: ['maxPrice'], message: 'Tarif maksimum harus sama atau lebih besar.' });

export const updatePolicySchema = z.object({
  allowedActions: z.array(z.enum(['bid.submit'])).max(1),
  keywords: z.array(z.string().trim().min(2).max(60)).max(30),
  minimumConfidence: z.number().min(0.5).max(1),
  minPrice: z.number().finite().min(0),
  maxPrice: z.number().finite().min(0),
  dailyBidLimit: z.number().int().min(0).max(50),
  weeklyBidLimit: z.number().int().min(0).max(200),
  timezone: z.string().trim().min(3).max(80),
  activeHours: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(1).max(24) }),
  noNegotiationTerms: z.array(z.string().trim().min(2).max(80)).max(30),
}).refine((policy) => policy.maxPrice >= policy.minPrice, { path: ['maxPrice'], message: 'Harga maksimum harus sama atau lebih besar.' })
  .refine((policy) => policy.activeHours.end > policy.activeHours.start, { path: ['activeHours'], message: 'Jam selesai harus setelah jam mulai.' });

export const activatePolicySchema = z.object({ confirmSimulation: z.literal(true) });

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
  source: z.enum(['freelancer', 'direct', 'linkedin', 'other']),
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
