import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const tokenKey = 'FVH_FREELANCER_ACCESS_TOKEN';
const sandboxTokenKey = 'FVH_FREELANCER_SANDBOX_ACCESS_TOKEN';

export type FreelancerEnvironment = {
  declared: boolean;
  token: string | null;
  sandboxTokenDeclared: boolean;
  sandboxToken: string | null;
};

export function parseFreelancerEnvironment(content: string, inherited: NodeJS.ProcessEnv = {}): FreelancerEnvironment {
  let values: Record<string, string | undefined>;
  try {
    values = parseEnv(content);
  } catch {
    return { declared: true, token: null, sandboxTokenDeclared: true, sandboxToken: null };
  }

  const declared = Object.hasOwn(values, tokenKey) || Object.hasOwn(inherited, tokenKey);
  const sandboxTokenDeclared = Object.hasOwn(values, sandboxTokenKey) || Object.hasOwn(inherited, sandboxTokenKey);
  if (!declared && !sandboxTokenDeclared) return { declared: false, token: null, sandboxTokenDeclared: false, sandboxToken: null };

  const token = (inherited[tokenKey] ?? values[tokenKey])?.trim();
  const validToken = token && token.length >= 16 && token.length <= 4096 && !/[\0\r\n]/.test(token) ? token : null;
  const sandboxToken = (inherited[sandboxTokenKey] ?? values[sandboxTokenKey])?.trim();
  const validSandboxToken = sandboxToken && sandboxToken.length >= 16 && sandboxToken.length <= 4096 && !/[\0\r\n]/.test(sandboxToken) && sandboxToken !== validToken
    ? sandboxToken
    : null;

  return { declared, token: validToken, sandboxTokenDeclared, sandboxToken: validSandboxToken };
}

export function readFreelancerEnvironment(projectRoot: string, inherited: NodeJS.ProcessEnv = process.env): FreelancerEnvironment {
  const envPath = join(projectRoot, '.env');
  if (!existsSync(envPath)) return parseFreelancerEnvironment('', inherited);
  try {
    return parseFreelancerEnvironment(readFileSync(envPath, 'utf8'), inherited);
  } catch {
    return parseFreelancerEnvironment('', inherited);
  }
}
