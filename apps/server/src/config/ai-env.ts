import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

export type DraftingEnvironment = {
  mode: 'disabled' | 'hermes';
  consent: boolean;
  executable: string;
  profile: string;
  valid: boolean;
};

const defaults: DraftingEnvironment = { mode: 'disabled', consent: false, executable: 'hermes', profile: 'private-ai-house', valid: true };

export function parseDraftingEnvironment(content: string, inherited: NodeJS.ProcessEnv = {}): DraftingEnvironment {
  let fileValues: Record<string, string | undefined>;
  try {
    fileValues = parseEnv(content);
  } catch {
    return { ...defaults, valid: false };
  }
  const read = (name: string) => inherited[name] ?? fileValues[name];
  const rawMode = read('FVH_AI_MODE')?.trim().toLowerCase();
  const rawConsent = read('FVH_AI_DATA_CONSENT')?.trim().toLowerCase();
  const rawExecutable = read('FVH_HERMES_BIN')?.trim();
  const rawProfile = read('FVH_HERMES_PROFILE')?.trim();
  const executable = rawExecutable || defaults.executable;
  const profile = rawProfile || defaults.profile;
  const valid = executable.length <= 512 && !/[\0\r\n]/.test(executable)
    && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(profile);
  return {
    mode: rawMode === 'hermes' ? 'hermes' : 'disabled',
    consent: rawConsent === 'true',
    executable,
    profile,
    valid,
  };
}

export function readDraftingEnvironment(projectRoot: string, inherited: NodeJS.ProcessEnv = process.env): DraftingEnvironment {
  const envPath = join(projectRoot, '.env');
  if (!existsSync(envPath)) return parseDraftingEnvironment('', inherited);
  try {
    return parseDraftingEnvironment(readFileSync(envPath, 'utf8'), inherited);
  } catch {
    return { ...defaults, valid: false };
  }
}
