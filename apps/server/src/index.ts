import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import fastifyStatic from '@fastify/static';
import { FreelancerProductionWriteAdapter, FreelancerReadAdapter, FreelancerReadError, FreelancerSandboxWriteAdapter } from '@fvh/adapter-freelancer';
import { HermesCliDraftingAdapter } from '@fvh/adapter-hermes';
import { OFFICE_ROSTER } from '@fvh/domain';
import { createDatabase, WorkspaceRepository } from '@fvh/persistence';
import { deleteLinkedInAccessToken, getFreelancerAccessToken, getLinkedInAccessToken, getLinkedInClientCredentials, readCredentialStatus, storeLinkedInAccessToken } from './lib/credential-store.js';
import { LinkedInOAuthService } from './services/linkedin-oauth.js';
import { readLinkedInEnvironment } from './config/linkedin-env.js';
import { readGitHubEnvironment } from './config/github-env.js';
import { readFreelancerEnvironment } from './config/freelancer-env.js';
import { readDraftingEnvironment } from './config/ai-env.js';
import { readLinkedInProfile, syncLinkedInProfile } from './lib/linkedin-api.js';
import { createApp } from './app.js';
import { FreelancerAutopilot } from './services/autopilot.js';
import { BusinessSync } from './services/business-sync.js';
import { OperationsService } from './services/operations.js';
import { OperationsRepository } from '@fvh/persistence';
import { DpapiIntegrationVault } from './lib/integration-vault.js';
import { WhatsAppService } from './services/whatsapp.js';
import { GoogleCalendarService } from './services/google-calendar.js';
import { PublicPortfolioResolver } from './services/portfolio.js';
import { readProductionWriteChecks } from './controllers/freelancer.js';
import type { CapabilityStatus } from '@fvh/domain';
import { ProjectsCoIdService } from './services/projects-co-id.js';
import { HermesKanban, hermesKanbanRunner } from './services/hermes-kanban.js';
import { OfficeLearningService } from './services/office-learning.js';
import { announceWrites, LiveEvents } from './lib/live-events.js';

function findProjectRoot(start: string): string {
  let directory = resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(directory, 'pnpm-workspace.yaml'))) return directory;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error('Project root with pnpm-workspace.yaml was not found.');
}

const projectRoot = findProjectRoot(process.cwd());
const dataDirectory = process.env.FVH_DATA_DIR
  ? (isAbsolute(process.env.FVH_DATA_DIR) ? process.env.FVH_DATA_DIR : resolve(projectRoot, process.env.FVH_DATA_DIR))
  : resolve(projectRoot, '.local');
mkdirSync(dataDirectory, { recursive: true });
const credentialStorePath = resolve(dataDirectory, 'credentials.dpapi.json');
const credentialScriptPath = resolve(projectRoot, 'apps/server/src/lib/credential-store.ps1');
const freelancerEnvironment = readFreelancerEnvironment(projectRoot);
async function getFreelancerToken(): Promise<string> {
  if (freelancerEnvironment.declared) {
    if (!freelancerEnvironment.token) throw new Error('Freelancer token in .env is invalid.');
    return freelancerEnvironment.token;
  }
  return getFreelancerAccessToken(credentialStorePath, credentialScriptPath);
}
const host = process.env.FVH_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.FVH_PORT ?? '3001', 10);
const linkedinOAuth = new LinkedInOAuthService({
  getClientCredentials: async () => {
    const environment = readLinkedInEnvironment(projectRoot);
    if (environment.declared) {
      if (!environment.credentials) throw new Error('LinkedIn app is not configured.');
      return environment.credentials;
    }
    return getLinkedInClientCredentials(credentialStorePath, credentialScriptPath);
  },
  redirectUri: process.env.FVH_LINKEDIN_REDIRECT_URI ?? `http://localhost:${port}/api/linkedin/callback`,
  storeAccessToken: (accessToken, expiresAt) => storeLinkedInAccessToken(credentialStorePath, credentialScriptPath, accessToken, expiresAt),
});

// Only DATABASE_URL is read here; the other readers parse .env themselves and .env is not loaded into process.env.
const envFile = join(projectRoot, '.env');
const databaseUrl = (process.env.DATABASE_URL ?? (existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')).DATABASE_URL : undefined))?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL belum diatur di .env (connection string Postgres Supabase).');
const live = new LiveEvents();
// Every repository (and OperationsRepository via repository.sql) writes through this one wrapper.
const repository = await WorkspaceRepository.open(announceWrites(await createDatabase(databaseUrl), live));
const createFreelancerReader = async () => new FreelancerReadAdapter({ token: await getFreelancerToken() });
const businessSync = new BusinessSync({
  repository,
  readOwnBids: async (bidIds) => (await createFreelancerReader()).readOwnBids(bidIds),
  readSelfId: async () => (await (await createFreelancerReader()).readOwnProfile()).id,
  readThreads: async (selfId, options) => (await createFreelancerReader()).readUpdatedThreads(selfId, { limit: 30, ...options }),
});
const draftingConfig = readDraftingEnvironment(projectRoot);
const hermesEnabled = draftingConfig.valid && draftingConfig.mode === 'hermes' && draftingConfig.consent;
const drafting = hermesEnabled ? new HermesCliDraftingAdapter({
  executable: draftingConfig.executable,
  profile: draftingConfig.profile,
  workspaceRoot: projectRoot,
  // ComboHermes via 9router takes 40-95 s for a full proposal context; 90 s was cutting real drafts off.
  timeoutMs: 180_000,
}) : undefined;
const portfolio = new PublicPortfolioResolver();
const projectsCoId = new ProjectsCoIdService(repository, drafting ? input => drafting.draftBid(input) : undefined);
const productionWriteChecks = await readProductionWriteChecks(repository);
const bidCapability = (): CapabilityStatus => productionWriteChecks.get('submit_bid')?.statusCode === 200 ? 'supported' : 'unknown';
const autopilot = new FreelancerAutopilot({
  publicPortfolio:(evidence)=>portfolio.select(evidence),
  bidCapability,
  repository,
  readProfile: async () => (await createFreelancerReader()).readOwnProfile(),
  readProjects: async (query, limit) => (await createFreelancerReader()).searchActiveProjects(query, limit),
  readProjectsByJobs: async (jobIds, fromTime, limit) => (await createFreelancerReader()).searchProjectsByJobs(jobIds, fromTime, limit),
  syncProfileJobs: async (jobIds) => new FreelancerProductionWriteAdapter({ token: await getFreelancerToken() }).run({ operation: 'edit_profile', jobIds }),
  submitBid: async (input) => {
    const result = await new FreelancerProductionWriteAdapter({ token: await getFreelancerToken() }).run(input);
    if (input.operation === 'submit_bid' && result.statusCode === 200) productionWriteChecks.set('submit_bid', { statusCode: 200, checkedAt: new Date().toISOString(), ...(result.resultId ? { resultId: result.resultId } : {}) });
    return result;
  },
  ...(drafting ? { draftProposal: (input: Parameters<typeof drafting.draftBid>[0]) => drafting.draftBid(input) } : {}),
});
const draftingReason = !draftingConfig.valid
  ? 'Konfigurasi Hermes tidak valid. Periksa nama profile dan executable di .env.'
  : draftingConfig.mode !== 'hermes'
    ? 'Mode Hermes belum dipilih. Draf AI tetap nonaktif.'
    : !draftingConfig.consent
      ? 'Hermes sudah dipilih, tetapi persetujuan pengiriman data belum diberikan. Tidak ada draf sintetis yang digunakan.'
      : 'Hermes belum tersedia. Periksa instalasi profile private-ai-house dan jalankan ulang server.';
const webBuild = resolve(projectRoot, 'apps/web/dist');
const integrationVault = new DpapiIntegrationVault(dataDirectory,resolve(projectRoot,'apps/server/src/lib/integration-vault.ps1'));
const whatsapp = new WhatsAppService(integrationVault);
const googleCalendar = new GoogleCalendarService(integrationVault,new OperationsRepository(repository.sql));
const operations = new OperationsService({repository,messenger:whatsapp,calendar:googleCalendar,...(drafting?{review:(facts:string[])=>drafting.reviewOperations(facts)}:{})});
const hasWebBuild = existsSync(webBuild);
const hermesKanban = hermesEnabled ? new HermesKanban(hermesKanbanRunner(draftingConfig.executable)) : undefined;
const officeLearning = drafting ? new OfficeLearningService({
  repository, employees: OFFICE_ROSTER,
  discuss: input => drafting.discussOffice(input),
  available: () => hermesEnabled,
  busy: () => {
    const board = hermesKanban?.peek();
    if (!board || Date.now() - Date.parse(board.checkedAt) > 60_000) {
      void hermesKanban?.status();
      return true;
    }
    return drafting.workInProgress > 0 || autopilot.liveState().busy || projectsCoId.busy
      || businessSync.getStatus().step !== null || Object.values(operations.status().jobs).some(job => job.busy)
      || !board.available || board.tasks.some(task => task.status === 'running');
  },
}) : undefined;
if (officeLearning) live.watch(['office-learning'], () => officeLearning.peek());
live.watch(['autopilot', 'capabilities'], () => autopilot.liveState());
live.watch(['business-sync'], () => businessSync.getStatus());
live.watch(['projects-co-id'], () => projectsCoId.liveState());
live.watch(['operations'], () => [operations.status(), whatsapp.status(), googleCalendar.status()]);
// checkedAt moves on every read; only a changed board is news.
if (hermesKanban) live.watch(['hermes-kanban'], () => { const board = hermesKanban.peek(); return board && { ...board, checkedAt: null }; });
const app = await createApp({
  live,
  publicPortfolio:(evidence)=>portfolio.select(evidence),
  operations,whatsapp,googleCalendar,projectsCoId,
  // Cards carry stored app data to the Hermes team, so they follow the same consent as drafting.
  ...(hermesKanban ? { hermesKanban } : {}),
  ...(officeLearning ? { officeLearning } : {}),
  repository,
  getGitHubToken: () => readGitHubEnvironment(projectRoot).token ?? undefined,
  getCredentialStatus: () => {
    const stored = readCredentialStatus(credentialStorePath);
    const environment = readLinkedInEnvironment(projectRoot);
    return {
      ...stored,
      freelancerAccessTokenConfigured: freelancerEnvironment.declared ? Boolean(freelancerEnvironment.token) : stored.freelancerAccessTokenConfigured,
      linkedinClientConfigured: environment.declared ? Boolean(environment.credentials) : stored.linkedinClientConfigured,
    };
  },
  freelancerSandboxTokenConfigured: Boolean(freelancerEnvironment.sandboxToken),
  freelancerBidCapability: bidCapability,
  autopilot,
  businessSync,
  verifyFreelancerSandboxWrite: async (input) => {
    const token = freelancerEnvironment.sandboxToken;
    if (!token) throw new Error('Freelancer sandbox token is not configured.');
    return new FreelancerSandboxWriteAdapter({ token }).run(input);
  },
  verifyFreelancer: async () => {
    let adapter: FreelancerReadAdapter;
    try {
      adapter = new FreelancerReadAdapter({ token: await getFreelancerToken() });
    } catch {
      return { connected: false, readProfile: false, readProjects: false, readPortfolio: false, readMessages: false, profileError: 'invalid_token', projectsError: 'invalid_token', portfolioError: 'invalid_token', messagesError: 'invalid_token', reason: 'invalid_token' };
    }
    const check = async (operation: () => Promise<unknown>): Promise<string | undefined> => {
      try {
        await operation();
        return undefined;
      } catch (error) {
        return error instanceof FreelancerReadError ? error.code : 'verification_unavailable';
      }
    };

    let profileId: string | undefined;
    let profileError: string | undefined;
    try {
      profileId = (await adapter.readOwnProfile()).id;
    } catch (error) {
      profileError = error instanceof FreelancerReadError ? error.code : 'verification_unavailable';
    }
    const [projectsError, portfolioError, messagesError] = await Promise.all([
      check(() => adapter.searchActiveProjects('typescript', 1)),
      profileId ? check(() => adapter.checkOwnPortfolioRead(profileId!)) : Promise.resolve('profile_unavailable'),
      profileId ? check(() => adapter.checkOwnMessageRead(profileId!)) : Promise.resolve('profile_unavailable'),
    ]);
    const readProfile = Boolean(profileId);
    const readProjects = !projectsError;
    const readPortfolio = !portfolioError;
    const readMessages = !messagesError;
    const reason = !readProfile
      ? profileError === 'invalid_token' ? 'invalid_token' : profileError === 'scope_denied' ? 'scope_denied' : profileError === 'rate_limited' ? 'rate_limited' : profileError === 'invalid_response' ? 'invalid_response' : 'verification_unavailable'
      : projectsError === 'scope_denied' ? 'project_scope_denied' : projectsError === 'rate_limited' ? 'rate_limited' : projectsError === 'invalid_response' ? 'invalid_response' : projectsError === 'invalid_token' ? 'invalid_token' : projectsError ? 'projects_unavailable' : 'verified';
    return {
      connected: readProfile,
      readProfile,
      readProjects,
      readPortfolio,
      readMessages,
      ...(profileError ? { profileError } : {}),
      ...(projectsError ? { projectsError } : {}),
      ...(portfolioError ? { portfolioError } : {}),
      ...(messagesError ? { messagesError } : {}),
      reason,
    };
  },
  readFreelancerProjects: async (query, limit) => {
    const token = await getFreelancerToken();
    return new FreelancerReadAdapter({ token }).searchActiveProjects(query, limit);
  },
  linkedinOAuth,
  disconnectLinkedIn: () => deleteLinkedInAccessToken(credentialStorePath, credentialScriptPath),
  syncLinkedIn: async () => syncLinkedInProfile(repository, await readLinkedInProfile(await getLinkedInAccessToken(credentialStorePath, credentialScriptPath))),
  spaFallback: hasWebBuild,
  draftingReason,
  ...(drafting ? { drafting, draftingMode: 'hermes' as const } : { draftingMode: 'disabled' as const }),
});
if (hasWebBuild) {
  await app.register(fastifyStatic, { root: webBuild, prefix: '/' });
}
app.addHook('onClose',async()=>{autopilot.stop();whatsapp.close();await projectsCoId.close();await operations.close();});

if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('FVH_HOST must stay on loopback for the local single-user app.');
await app.listen({ host, port });
app.log.info({ host, port }, 'Freelancer Virtual House API is ready');
// A failing integration (e.g. a dropped Supabase connection) must neither crash the API nor stop the later steps.
const startupStep = (name: string, run: () => unknown) => Promise.resolve().then(run)
  .catch((error: unknown) => console.error(`Langkah start "${name}" gagal: ${error instanceof Error ? error.message : 'tidak diketahui'}`));
void (async () => {
  void hermesKanban?.status(); // warm the ~10 s first read so the office does not wait on it
  await startupStep('freelancer-verify', () => app.inject({ method: 'POST', url: '/api/freelancer/verify' }));
  await startupStep('business-sync', () => businessSync.start());
  await startupStep('projects-co-id', () => projectsCoId.restore());
  await startupStep('google-calendar', () => googleCalendar.restore());
  await startupStep('whatsapp', () => whatsapp.restore());
  await startupStep('operations', () => operations.start());
  void autopilot.start();
  await startupStep('office-learning', () => officeLearning?.start());
})();
