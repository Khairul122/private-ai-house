import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { OpenCodeCliDraftingAdapter } from '@fvh/adapter-opencode';
import { createDatabase, WorkspaceRepository } from '@fvh/persistence';
import { deleteLinkedInAccessToken, getLinkedInClientCredentials, readCredentialStatus, storeLinkedInAccessToken, verifyFreelancerCredential } from './credential-store.js';
import { LinkedInOAuthService } from './linkedin-oauth.js';
import { readLinkedInEnvironment } from './linkedin-env.js';
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
const opencodeEnabled = process.env.FVH_AI_MODE === 'opencode' && process.env.FVH_AI_DATA_CONSENT === 'true';
const providerEnvironment: Record<string, string> = {};
for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'OPENROUTER_API_KEY']) {
  const value = process.env[name];
  if (value) providerEnvironment[name] = value;
}
const drafting = opencodeEnabled ? new OpenCodeCliDraftingAdapter({
  executable: process.env.OPENCODE_BIN ?? 'opencode',
  workspaceRoot: projectRoot,
  ...(process.env.OPENCODE_MODEL ? { model: process.env.OPENCODE_MODEL } : {}),
  providerEnvironment,
}) : undefined;
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
  verifyFreelancer: () => verifyFreelancerCredential(credentialStorePath, credentialScriptPath),
  linkedinOAuth,
  disconnectLinkedIn: () => deleteLinkedInAccessToken(credentialStorePath, credentialScriptPath),
  spaFallback: hasWebBuild,
  ...(drafting ? { drafting, draftingMode: 'opencode' as const } : {}),
});
if (hasWebBuild) {
  await app.register(fastifyStatic, { root: webBuild, prefix: '/' });
}

if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('FVH_HOST must stay on loopback for the local single-user app.');
await app.listen({ host, port });
app.log.info({ host, port, databaseFile }, 'Freelancer Virtual House API is ready');
