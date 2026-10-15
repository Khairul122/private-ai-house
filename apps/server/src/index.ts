import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { FreelancerProductionWriteAdapter, FreelancerReadAdapter, FreelancerReadError, FreelancerSandboxWriteAdapter } from '@fvh/adapter-freelancer';
import { HermesCliDraftingAdapter } from '@fvh/adapter-hermes';
import { createDatabase, WorkspaceRepository } from '@fvh/persistence';
import { deleteLinkedInAccessToken, getFreelancerAccessToken, getLinkedInClientCredentials, readCredentialStatus, storeLinkedInAccessToken } from './credential-store.js';
import { LinkedInOAuthService } from './linkedin-oauth.js';
import { readLinkedInEnvironment } from './linkedin-env.js';
import { readGitHubEnvironment } from './github-env.js';
import { readFreelancerEnvironment } from './freelancer-env.js';
import { readDraftingEnvironment } from './ai-env.js';
import { createApp } from './app.js';
import { FreelancerAutopilot } from './autopilot.js';
import { BusinessSync } from './business-sync.js';

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
const databaseFile = resolve(dataDirectory, 'freelancer-virtual-house.sqlite');
mkdirSync(dirname(databaseFile), { recursive: true });
const credentialStorePath = resolve(dataDirectory, 'credentials.dpapi.json');
const credentialScriptPath = resolve(projectRoot, 'apps/server/src/credential-store.ps1');
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

const repository = new WorkspaceRepository(createDatabase(databaseFile));
const createFreelancerReader = async () => new FreelancerReadAdapter({ token: await getFreelancerToken() });
const businessSync = new BusinessSync({
  repository,
  readOwnBids: async (bidIds) => (await createFreelancerReader()).readOwnBids(bidIds),
  readSelfId: async () => (await (await createFreelancerReader()).readOwnProfile()).id,
  readThreads: async (selfId) => (await createFreelancerReader()).readLatestThreadMessages(selfId, 30),
});
const autopilot = new FreelancerAutopilot({
  repository,
  readProfile: async () => (await createFreelancerReader()).readOwnProfile(),
  readProjects: async (query, limit) => (await createFreelancerReader()).searchActiveProjects(query, limit),
  syncProfileJobs: async (jobIds) => new FreelancerProductionWriteAdapter({ token: await getFreelancerToken() }).run({ operation: 'edit_profile', jobIds }),
  submitBid: async (input) => new FreelancerProductionWriteAdapter({ token: await getFreelancerToken() }).run(input),
});
const draftingConfig = readDraftingEnvironment(projectRoot);
const hermesEnabled = draftingConfig.valid && draftingConfig.mode === 'hermes' && draftingConfig.consent;
const drafting = hermesEnabled ? new HermesCliDraftingAdapter({
  executable: draftingConfig.executable,
  profile: draftingConfig.profile,
  workspaceRoot: projectRoot,
}) : undefined;
const draftingReason = !draftingConfig.valid
  ? 'Konfigurasi Hermes tidak valid. Periksa nama profile dan executable di .env.'
  : draftingConfig.mode !== 'hermes'
    ? 'Mode Hermes belum dipilih. Draf AI tetap nonaktif.'
    : !draftingConfig.consent
      ? 'Hermes sudah dipilih, tetapi persetujuan pengiriman data belum diberikan. Tidak ada draf sintetis yang digunakan.'
      : 'Hermes belum tersedia. Periksa instalasi profile private-ai-house dan jalankan ulang server.';
const webBuild = resolve(projectRoot, 'apps/web/dist');
const hasWebBuild = existsSync(webBuild);
const app = createApp({
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
  autopilot,
  runFreelancerProductionWrite: async (input) => new FreelancerProductionWriteAdapter({ token: await getFreelancerToken() }).run(input),
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
  spaFallback: hasWebBuild,
  draftingReason,
  ...(drafting ? { drafting, draftingMode: 'hermes' as const } : { draftingMode: 'disabled' as const }),
});
if (hasWebBuild) {
  await app.register(fastifyStatic, { root: webBuild, prefix: '/' });
}

if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('FVH_HOST must stay on loopback for the local single-user app.');
await app.listen({ host, port });
app.log.info({ host, port, databaseFile }, 'Freelancer Virtual House API is ready');
void (async () => {
  await app.inject({ method: 'POST', url: '/api/freelancer/verify' });
  await autopilot.start();
  businessSync.start();
})();
