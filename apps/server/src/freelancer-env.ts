import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const tokenKey = 'FVH_FREELANCER_ACCESS_TOKEN';

export type FreelancerEnvironment = {
  declared: boolean;
  token: string | null;
};

export function parseFreelancerEnvironment(content: string, inherited: NodeJS.ProcessEnv = {}): FreelancerEnvironment {
  let values: Record<string, string | undefined>;
  try {
    values = parseEnv(content);
  } catch {
    return { declared: true, token: null };
  }

  const declared = Object.hasOwn(values, tokenKey) || Object.hasOwn(inherited, tokenKey);
  if (!declared) return { declared: false, token: null };

  const token = (inherited[tokenKey] ?? values[tokenKey])?.trim();
  if (!token || token.length < 16 || token.length > 4096 || /[\0\r\n]/.test(token)) {
    return { declared: true, token: null };
  }

  return { declared: true, token };
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
