import { z } from 'zod';
import { MISSION_PRIORITIES, MISSION_SOURCES, MISSION_STATUSES } from '@fvh/domain';

export const missionSourceSchema = z.enum(MISSION_SOURCES);
export const missionStatusSchema = z.enum(MISSION_STATUSES);
export const missionPrioritySchema = z.enum(MISSION_PRIORITIES);

const identifier = z.string().trim().min(1).max(200);
const payloadIdentifier = z.string().trim().min(1).max(2048);
const timestamp = z.string().refine(value => !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value), 'Gunakan waktu ISO 8601 dengan zona waktu.');

export const missionPayloadSchema = z.object({
  projectId: payloadIdentifier.optional(),
  threadId: payloadIdentifier.optional(),
  paymentId: payloadIdentifier.optional(),
  taskId: payloadIdentifier.optional(),
  knowledgeSourceId: payloadIdentifier.optional(),
}).strict().refine(value => {
  const fieldCount = Object.values(value).filter(field => field !== undefined).length;
  // PostgreSQL jsonb::text inserts one space after each colon and comma.
  const jsonbTextBytes = new TextEncoder().encode(JSON.stringify(value)).length + (fieldCount ? 2 * fieldCount - 1 : 0);
  return jsonbTextBytes <= 2048;
}, 'Payload maksimal 2 KiB.');

export const createMissionSchema = z.object({
  source: missionSourceSchema,
  sourceId: identifier,
  kind: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  status: z.literal('queued').default('queued'),
  priority: missionPrioritySchema,
  dueAt: timestamp.nullable().default(null),
  assignedTo: z.string().trim().min(1).max(100).nullable().default(null),
  payload: missionPayloadSchema.default({}),
}).strict();

export const listMissionsSchema = z.object({
  status: missionStatusSchema.optional(),
  source: missionSourceSchema.optional(),
  assignedTo: z.string().trim().min(1).max(100).optional(),
  dueFrom: timestamp.optional(),
  dueTo: timestamp.optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
}).strict().refine(value => !value.dueFrom || !value.dueTo || Date.parse(value.dueFrom) <= Date.parse(value.dueTo), 'Rentang tenggat tidak valid.');

export const updateMissionStatusSchema = z.object({
  status: missionStatusSchema,
  blocker: z.string().trim().min(1).max(500).nullable().optional(),
  error: z.string().trim().min(1).max(500).nullable().optional(),
}).strict().refine(value => value.status === 'blocked' || (value.blocker === undefined && value.error === undefined), 'Blocker dan error hanya untuk status blocked.');

const claimant = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/, 'ID claimant tidak valid.');
const leaseId = z.string().uuid();

export const claimMissionSchema = z.object({
  claimant,
  leaseSeconds: z.number().int().min(1).max(86_400),
}).strict();

export const renewMissionLeaseSchema = claimMissionSchema.extend({ leaseId });
export const releaseMissionLeaseSchema = z.object({ claimant, leaseId }).strict();

export type CreateMissionInput = z.input<typeof createMissionSchema>;
export type ListMissionsInput = z.input<typeof listMissionsSchema>;
export type UpdateMissionStatusInput = z.input<typeof updateMissionStatusSchema>;
export type ClaimMissionInput = z.input<typeof claimMissionSchema>;
export type RenewMissionLeaseInput = z.input<typeof renewMissionLeaseSchema>;
export type ReleaseMissionLeaseInput = z.input<typeof releaseMissionLeaseSchema>;
