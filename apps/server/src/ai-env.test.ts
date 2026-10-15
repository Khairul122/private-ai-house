import { describe, expect, it } from 'vitest';
import { parseDraftingEnvironment } from './ai-env.js';

describe('parseDraftingEnvironment', () => {
  it('reads only the Hermes switch, explicit consent, binary, and profile from .env', () => {
    expect(parseDraftingEnvironment('FVH_AI_MODE=hermes\nFVH_AI_DATA_CONSENT=true\nFVH_HERMES_BIN=C:/Hermes/hermes.exe\nFVH_HERMES_PROFILE=private-ai-house\nOPENAI_API_KEY=unrelated')).toEqual({
      mode: 'hermes', consent: true, executable: 'C:/Hermes/hermes.exe', profile: 'private-ai-house', valid: true,
    });
  });

  it('defaults to disabled drafting without consent and lets process environment override file settings', () => {
    expect(parseDraftingEnvironment('FVH_AI_MODE=hermes\nFVH_AI_DATA_CONSENT=false')).toMatchObject({ mode: 'hermes', consent: false });
    expect(parseDraftingEnvironment('FVH_AI_MODE=hermes\nFVH_AI_DATA_CONSENT=true', { FVH_AI_MODE: 'fixture' })).toMatchObject({ mode: 'disabled', consent: true });
  });

  it('rejects malformed profile names and ignores unsupported modes', () => {
    expect(parseDraftingEnvironment('FVH_HERMES_PROFILE=fvh; whoami')).toMatchObject({ valid: false });
    expect(parseDraftingEnvironment('FVH_AI_MODE=invalid\nFVH_AI_DATA_CONSENT=true')).toMatchObject({ mode: 'disabled', consent: true, valid: true });
  });
});
