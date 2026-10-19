export type { ProjectsCoIdStatus } from '../../../server/src/models/projects-co-id-types.js';
import type { Opportunity, BidDraft } from './api.js';
export type ProjectsCoIdEntry = Opportunity & { latestDraft: BidDraft | null; url: string; ownerActionAt: string | null };
