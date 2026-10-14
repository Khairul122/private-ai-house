import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { OpenCodeCliDraftingAdapter } from '@fvh/adapter-opencode';
import { createDatabase, WorkspaceRepository } from '@fvh/persistence';
import { readCredentialStatus } from './credential-store.js';
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
const credentialStatus = readCredentialStatus(
  resolve(dataDirectory, 'credentials.dpapi.json'),
);

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
const app = createApp({ repository, credentialStatus, spaFallback: hasWebBuild, ...(drafting ? { drafting, draftingMode: 'opencode' as const } : {}) });
if (hasWebBuild) {
  await app.register(fastifyStatic, { root: webBuild, prefix: '/' });
}

const host = process.env.FVH_HOST ?? '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('FVH_HOST must stay on loopback for the local single-user app.');
const port = Number.parseInt(process.env.FVH_PORT ?? '3001', 10);
await app.listen({ host, port });
app.log.info({ host, port, databaseFile }, 'Freelancer Virtual House API is ready');
