import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

export type GitHubEnvironment = { declared: boolean; token: string | null };

export function parseGitHubEnvironment(content: string, inherited: NodeJS.ProcessEnv = {}): GitHubEnvironment {
  let values: Record<string, string | undefined>;
  try {
    values = parseEnv(content);
  } catch {
    return { declared: true, token: null };
  }

  const declared = Object.hasOwn(values, 'GITHUB_TOKEN') || Object.hasOwn(inherited, 'GITHUB_TOKEN');
  const token = (inherited.GITHUB_TOKEN ?? values.GITHUB_TOKEN)?.trim();
  const validToken = token && token.length >= 16 && token.length <= 4096 && !/[\0\r\n]/.test(token) ? token : null;
  return { declared, token: validToken };
}

export function readGitHubEnvironment(projectRoot: string, inherited: NodeJS.ProcessEnv = process.env): GitHubEnvironment {
  const envPath = join(projectRoot, '.env');
  if (!existsSync(envPath)) return parseGitHubEnvironment('', inherited);
  try {
    return parseGitHubEnvironment(readFileSync(envPath, 'utf8'), inherited);
  } catch {
    return parseGitHubEnvironment('', inherited);
  }
}
