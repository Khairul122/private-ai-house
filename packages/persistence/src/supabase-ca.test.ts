import { describe, expect, it } from 'vitest';
import { X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { SUPABASE_ROOT_CA_2021 } from './supabase-ca.js';

describe('Supabase pooler CA', () => {
  it('bundles the private Supabase root used by the session pooler', () => {
    const cert = new X509Certificate(SUPABASE_ROOT_CA_2021);
    expect(cert.ca).toBe(true);
    expect(cert.subject).toContain('Supabase Root 2021 CA');
    expect(cert.subject).toBe(cert.issuer);
    expect(new Date(cert.validTo).getUTCFullYear()).toBeGreaterThanOrEqual(2031);
    // Node's bundled roots do not include it, which is why the pooler failed before.
    expect(rootCertificates).not.toContain(SUPABASE_ROOT_CA_2021);
  });
});
