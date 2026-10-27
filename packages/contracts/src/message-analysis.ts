import { z } from 'zod';

export const messageClassificationSchema = z.enum(['feature', 'bug', 'question', 'scope_change', 'unknown']);

/** Model output for one client message. It carries no status: only the owner decides what is approved. */
export const messageAnalysisOutputSchema = z.object({
  classification: messageClassificationSchema,
  summary: z.string().trim().min(10).max(1_000),
  requirements: z.array(z.object({
    text: z.string().trim().min(3).max(300),
    quote: z.string().trim().min(1).max(500),
  })).max(12),
  questions: z.array(z.string().trim().min(3).max(300)).max(10),
  replyDraft: z.string().trim().min(10).max(2_000),
}).strict();

export type MessageAnalysisOutput = z.infer<typeof messageAnalysisOutputSchema>;

/** `sourceVersion` analyses one stored message; without it the server picks the oldest pending messages. */
export const analyzeMessageSchema = z.object({
  sourceVersion: z.string().regex(/^[a-f0-9]{64}$/, 'sourceVersion tidak valid.').optional(),
  limit: z.number().int().min(1).max(3).default(1),
}).strict();

export type AnalyzeMessageInput = z.input<typeof analyzeMessageSchema>;
