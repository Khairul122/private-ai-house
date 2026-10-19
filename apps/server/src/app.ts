import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type {} from '@fastify/static';
import { z } from 'zod';
import type { FreelancerSandboxWriteInput, FreelancerSandboxWriteResult, FreelancerWriteInput, FreelancerWriteResult } from '@fvh/adapter-freelancer';
import { UnavailableDraftingAdapter } from '@fvh/application';
import type { AiDraftingPort } from '@fvh/application';
import type { ProjectOpportunity } from '@fvh/domain';
import { WorkspaceRepository } from '@fvh/persistence';
import type { CredentialStatus, FreelancerVerification } from './lib/credential-store.js';
import type { LinkedInOAuthService } from './services/linkedin-oauth.js';
import type { FreelancerAutopilot } from './services/autopilot.js';
import type { BusinessSync } from './services/business-sync.js';
import { OperationsService } from './services/operations.js';
import type { WhatsAppService } from './services/whatsapp.js';
import type { GoogleCalendarService } from './services/google-calendar.js';
import type { BrowserBiddingService } from './services/browser-bidding.js';
import type { HermesKanban } from './services/hermes-kanban.js';
import type { ProjectsCoIdService } from './services/projects-co-id.js';
import { readProductionWriteChecks } from './controllers/freelancer.js';
import { allowedDevOrigins, type AppContext } from './controllers/shared.js';
import { registerActivityRoutes } from './routes/activity.js';
import { registerAutopilotRoutes } from './routes/autopilot.js';
import { registerBrowserBiddingRoutes } from './routes/browser-bidding.js';
import { registerCapabilitiesRoutes } from './routes/capabilities.js';
import { registerFreelancerRoutes } from './routes/freelancer.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerHermesKanbanRoutes } from './routes/hermes-kanban.js';
import { registerInboxRoutes } from './routes/inbox.js';
import { registerKnowledgeRoutes } from './routes/knowledge.js';
import { registerLinkedInRoutes } from './routes/linkedin.js';
import { registerOperationsRoutes } from './routes/operations.js';
import { registerPolicyRoutes } from './routes/policy.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerProjectsRoutes } from './routes/projects.js';
import { registerProjectsCoIdRoutes } from './routes/projects-co-id.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerWorkRoutes } from './routes/work.js';
import { registerEventsRoutes } from './routes/events.js';
import { LiveEvents, routeTopics } from './lib/live-events.js';

export type AppOptions = {
  projectsCoId?: ProjectsCoIdService;
  hermesKanban?: HermesKanban;
  browserBidding?: BrowserBiddingService;
  operations?: OperationsService;
  whatsapp?: WhatsAppService;
  googleCalendar?: GoogleCalendarService;
  repository?: WorkspaceRepository;
  githubToken?: string;
  getGitHubToken?: () => string | undefined;
  credentialStatus?: CredentialStatus;
  getCredentialStatus?: () => CredentialStatus;
  freelancerSandboxTokenConfigured?: boolean;
  verifyFreelancer?: () => Promise<FreelancerVerification>;
  runFreelancerProductionWrite?: (input: FreelancerWriteInput) => Promise<FreelancerWriteResult>;
  verifyFreelancerSandboxWrite?: (input: FreelancerSandboxWriteInput) => Promise<FreelancerSandboxWriteResult>;
  readFreelancerProjects?: (query: string, limit: number) => Promise<{ projects: ProjectOpportunity[]; skipped: number }>;
  autopilot?: FreelancerAutopilot;
  businessSync?: BusinessSync;
  linkedinOAuth?: Pick<LinkedInOAuthService, 'redirectUri' | 'start' | 'handleCallback' | 'close'>;
  disconnectLinkedIn?: () => Promise<void>;
  syncLinkedIn?: () => Promise<{ sourceId: string; chunks: number }>;
  fetcher?: typeof fetch;
  clock?: () => Date;
  drafting?: AiDraftingPort;
  draftingMode?: 'disabled' | 'fixture' | 'hermes';
  draftingReason?: string;
  publicPortfolio?: (evidence:Parameters<AiDraftingPort['draftBid']>[0]['evidence'])=>Promise<Array<{label:string;url:string}>>;
  spaFallback?: boolean;
  /** Change feed for GET /api/events; index.ts shares it with the workers and the database wrapper. */
  live?: LiveEvents;
};

function isSameOrigin(origin: string, protocol: string, host: string | undefined): boolean {
  if (!host) return false;
  try {
    const source = new URL(origin);
    const request = new URL(`${protocol}://${host}`);
    return source.origin === origin && source.origin === request.origin;
  } catch {
    return false;
  }
}

export async function createApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const repository = options.repository ?? await WorkspaceRepository.open();
  const now = options.clock ?? (() => new Date());
  const app = Fastify({ logger: false, bodyLimit: 2_500_000, trustProxy: false });
  const operations = options.operations ?? new OperationsService({ repository });
  const freelancerProductionWriteChecks = await readProductionWriteChecks(repository);
  const live = options.live ?? new LiveEvents();
  const ctx: AppContext = {
    options, repository, now, live,
    drafting: options.drafting ?? new UnavailableDraftingAdapter(),
    draftingMode: options.drafting ? options.draftingMode ?? 'fixture' : 'disabled',
    state: { draftsInProgress: 0, freelancerVerification: null },
    freelancerSandboxWriteChecks: new Map(),
    freelancerProductionWriteChecks,
    refreshProductionWriteChecks: async () => {
      for (const [operation, check] of await readProductionWriteChecks(repository)) freelancerProductionWriteChecks.set(operation, check);
    },
    // Thread project ids are bare Freelancer ids; local project ids are 'freelancer:<id>'.
    threadProjectIds: async () => new Set((await repository.listClientThreads()).map((thread) => thread.projectId).filter((id): id is string => id !== null).map((id) => `freelancer:${id}`)),
  };

  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host;
    try {
      const hostname = host ? new URL(`http://${host}`).hostname : '';
      if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)) return reply.code(403).send({ error: 'Host tidak diizinkan.' });
    } catch {
      return reply.code(403).send({ error: 'Host tidak diizinkan.' });
    }
    const origin = request.headers.origin;
    if (origin && !allowedDevOrigins.has(origin) && !isSameOrigin(origin, request.protocol, request.headers.host)) {
      return reply.code(403).send({ error: 'Origin tidak diizinkan.' });
    }
  });
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173 ws://127.0.0.1:5174 ws://localhost:5174; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    return payload;
  });
  app.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode < 400) live.emit(...routeTopics(request.method, request.url));
  });
  live.watch(['capabilities', 'pipeline'], () => ctx.state.draftsInProgress);

  // Order matters only for hooks: the domain onRequest hooks run after the Host/Origin hook above,
  // and the knowledge onClose hook runs before the repository is closed below.
  registerHealthRoutes(app, ctx);
  registerEventsRoutes(app, live);
  registerAutopilotRoutes(app, ctx);
  registerOperationsRoutes(app, {repository,operations,whatsapp:options.whatsapp,google:options.googleCalendar});
  registerBrowserBiddingRoutes(app,options.browserBidding,repository);
  registerProjectsCoIdRoutes(app, options.projectsCoId);
  registerHermesKanbanRoutes(app, options.hermesKanban, now);
  registerInboxRoutes(app, ctx);
  registerWorkRoutes(app, ctx);
  registerCapabilitiesRoutes(app, ctx);
  registerFreelancerRoutes(app, ctx);
  registerLinkedInRoutes(app, ctx);
  registerProfileRoutes(app, ctx);
  registerPolicyRoutes(app, ctx);
  registerProjectsRoutes(app, ctx);
  registerActivityRoutes(app, ctx);
  registerKnowledgeRoutes(app, ctx);
  registerSettingsRoutes(app, ctx);

  app.setErrorHandler((error, _request, reply) => error instanceof z.ZodError
    ? reply.code(400).send({error:'Data tidak valid.',issues:error.issues.map(issue=>`${issue.path.join('.') || 'body'}: ${issue.message}`)})
    : reply.code(500).send({ error: 'Permintaan tidak dapat diproses.' }));
  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    if (options.spaFallback && ['GET', 'HEAD'].includes(request.method) && pathname !== '/api' && !pathname.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Endpoint tidak ditemukan.' });
  });
  app.addHook('onClose', async () => {
    live.close();
    options.autopilot?.stop();
    options.linkedinOAuth?.close();
    if (!options.repository) await repository.close();
  });
  return app;
}
