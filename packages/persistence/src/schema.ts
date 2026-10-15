import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});

export const serviceProfiles = sqliteTable('service_profiles', {
  workspaceId: text('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  profileJson: text('profile_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const autonomyPolicies = sqliteTable('autonomy_policies', {
  workspaceId: text('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  policyJson: text('policy_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  platform: text('platform').notNull(),
  externalId: text('external_id').notNull(),
  projectJson: text('project_json').notNull(),
  pipelineStatus: text('pipeline_status').notNull(),
  score: integer('score').notNull().default(0),
  scoreFactorsJson: text('score_factors_json').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_projects_pipeline').on(table.pipelineStatus, table.score)]);

export const bidDrafts = sqliteTable('bid_drafts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  draftJson: text('draft_json').notNull(),
  createdAt: text('created_at').notNull(),
});

export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  resourceId: text('resource_id').notNull(),
  status: text('status').notNull(),
  reason: text('reason').notNull(),
  policyVersion: integer('policy_version'),
  payloadHash: text('payload_hash'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_audit_created').on(table.createdAt)]);

export const knowledgeSources = sqliteTable('knowledge_sources', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  label: text('label').notNull(),
  referenceUrl: text('reference_url').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const bidOutcomes = sqliteTable('bid_results', {
  projectId: text('project_id').primaryKey(),
  bidId: text('bid_id').notNull(),
  amount: real('amount'),
  currency: text('currency'),
  submittedAt: text('submitted_at').notNull(),
  awardStatus: text('award_status'),
  outcome: text('outcome').notNull().default('pending'),
  checkedAt: text('checked_at'),
});

export const knowledgeChunks = sqliteTable('knowledge_chunks', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull().references(() => knowledgeSources.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  sourceRef: text('source_ref').notNull(),
  url: text('url').notNull(),
  contentHash: text('content_hash').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_chunks_source').on(table.sourceId)]);

export const schema = { workspaces, serviceProfiles, autonomyPolicies, projects, bidDrafts, bidOutcomes, auditEvents, knowledgeSources, knowledgeChunks };
