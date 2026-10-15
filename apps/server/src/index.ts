import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { FreelancerReadAdapter, FreelancerReadError } from '@fvh/adapter-freelancer';
import { HermesCliDraftingAdapter } from '@fvh/adapter-hermes';
import { createDatabase, WorkspaceRepository } from '@fvh/persistence';
import { deleteLinkedInAccessToken, getFreelancerAccessToken, getLinkedInClientCredentials, readCredentialStatus, storeLinkedInAccessToken } from './credential-store.js';
import { LinkedInOAuthService } from './linkedin-oauth.js';
import { readLinkedInEnvironment } from './linkedin-env.js';
import { readDraftingEnvironment } from './ai-env.js';
import { createApp } from './app.js';

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
      : 'Hermes belum tersedia. Periksa instalasi profile fvh dan jalankan ulang server.';
const webBuild = resolve(projectRoot, 'apps/web/dist');
const hasWebBuild = existsSync(webBuild);
const app = createApp({
  repository,
  getCredentialStatus: () => {
    const stored = readCredentialStatus(credentialStorePath);
    const environment = readLinkedInEnvironment(projectRoot);
    return {
      ...stored,
      linkedinClientConfigured: environment.declared ? Boolean(environment.credentials) : stored.linkedinClientConfigured,
    };
  },
  verifyFreelancer: async () => {
    let adapter: FreelancerReadAdapter;
    try {
      adapter = new FreelancerReadAdapter({ token: await getFreelancerAccessToken(credentialStorePath, credentialScriptPath) });
    } catch {
      return { connected: false, readProfile: false, readProjects: false, reason: 'invalid_token' };
    }
    try {
      await adapter.readOwnProfile();
    } catch (error) {
      const code = error instanceof FreelancerReadError ? error.code : 'verification_unavailable';
      const reason = code === 'invalid_token' ? 'invalid_token' : code === 'scope_denied' ? 'scope_denied' : code === 'rate_limited' ? 'rate_limited' : code === 'invalid_response' ? 'invalid_response' : 'verification_unavailable';
      return { connected: false, readProfile: false, readProjects: false, reason };
    }
    try {
      await adapter.searchActiveProjects('typescript', 1);
      return { connected: true, readProfile: true, readProjects: true, reason: 'verified' };
    } catch (error) {
      const code = error instanceof FreelancerReadError ? error.code : 'projects_unavailable';
      const reason = code === 'scope_denied' ? 'project_scope_denied' : code === 'rate_limited' ? 'rate_limited' : code === 'invalid_response' ? 'invalid_response' : code === 'invalid_token' ? 'invalid_token' : 'projects_unavailable';
      return { connected: true, readProfile: true, readProjects: false, reason };
    }
  },
  readFreelancerProjects: async (query, limit) => {
    const token = await getFreelancerAccessToken(credentialStorePath, credentialScriptPath);
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
