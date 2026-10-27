import { z } from 'zod';

const sourceVersion = z.string().regex(/^[a-f0-9]{64}$/, 'sourceVersion tidak valid.');

/** A candidate is created from one stored analysis, never from free text. */
export const createCandidateTaskSchema = z.object({ sourceVersion }).strict();

export const confirmCandidateTaskSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  objective: z.string().trim().min(10).max(1000).optional(),
}).strict();

export const rejectCandidateTaskSchema = z.object({
  reason: z.string().trim().min(3).max(300),
}).strict();

/** Converting to a local mission is the owner's decision, so it needs an explicit confirmation. */
export const convertCandidateTaskSchema = z.object({ confirm: z.literal(true) }).strict();

export type CreateCandidateTaskInput = z.input<typeof createCandidateTaskSchema>;
export type ConfirmCandidateTaskInput = z.input<typeof confirmCandidateTaskSchema>;
export type RejectCandidateTaskInput = z.input<typeof rejectCandidateTaskSchema>;
