import { describe, expect, it } from 'vitest';
import { createMissionSchema, listMissionsSchema, updateMissionStatusSchema } from './mission.js';

const input = { source: 'inbox', sourceId: 'thread-1', kind: 'reply', title: 'Balas klien', priority: 'high' };

describe('mission contracts', () => {
  it('rejects invalid source, status, priority, due window and unsafe payload', () => {
    expect(createMissionSchema.safeParse({ ...input, source: 'unknown' }).success).toBe(false);
    expect(createMissionSchema.safeParse({ ...input, priority: 'critical' }).success).toBe(false);
    expect(createMissionSchema.safeParse({ ...input, status: 'completed' }).success).toBe(false);
    expect(updateMissionStatusSchema.safeParse({ status: 'unknown' }).success).toBe(false);
    expect(listMissionsSchema.safeParse({ status: 'unknown' }).success).toBe(false);
    expect(listMissionsSchema.safeParse({ dueFrom: '2026-10-28T00:00:00Z', dueTo: '2026-10-27T00:00:00Z' }).success).toBe(false);
    expect(listMissionsSchema.safeParse({ limit: 501 }).success).toBe(false);
    expect(createMissionSchema.safeParse({ ...input, payload: { token: 'secret' } }).success).toBe(false);
    expect(createMissionSchema.safeParse({ ...input, payload: { projectId: 'a'.repeat(1100), taskId: 'b'.repeat(1100) } }).success).toBe(false);
    expect(createMissionSchema.safeParse({ ...input, payload: { projectId: 'a'.repeat(2031) } }).success).toBe(true);
    expect(createMissionSchema.safeParse({ ...input, payload: { projectId: 'a'.repeat(2032) } }).success).toBe(false);
  });
});
