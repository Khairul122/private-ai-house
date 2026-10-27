import { getFreelancerCapabilities } from '@fvh/adapter-freelancer';
import type { FreelancerSandboxWriteOperation, FreelancerWriteOperation } from '@fvh/adapter-freelancer';
import { PROJECTS_CO_ID_AUTO_REASON } from '../models/projects-co-id-types.js';
import { linkedinVerification, type AppContext, type FreelancerProductionWriteCheck } from './shared.js';

const lastFailureNote = (failure: FreelancerProductionWriteCheck['lastFailure']) => !failure ? ''
  : ` Percobaan terakhir pada ${failure.checkedAt} ${failure.statusCode ? `menghasilkan HTTP ${failure.statusCode}` : 'tidak terkonfirmasi'}${failure.errorCode ? ` (${failure.errorCode})` : ''}${failure.errorCode === 'BID_LIMIT_EXCEEDED' ? '; kuota bid akun habis, bukan kemampuan yang hilang' : ''}.`;

export function capabilitiesController({ options, repository, now, draftingMode, state, freelancerSandboxWriteChecks, freelancerProductionWriteChecks, refreshProductionWriteChecks }: AppContext) {
  return {
    capabilities: async () => {
      await refreshProductionWriteChecks();
      const freelancerVerification = state.freelancerVerification;
      const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
      const linkedin = linkedinVerification(credentialStatus, now());
      return {
      projectsCoId: { available: !!options.projectsCoId, autoAvailable: false, reason: PROJECTS_CO_ID_AUTO_REASON },
      marketplace: getFreelancerCapabilities(freelancerVerification).map((capability) => {
        const productionVerification = freelancerProductionWriteChecks.get(capability.operation as FreelancerWriteOperation);
        return {
          ...capability,
          ...(productionVerification ? {
            status: productionVerification.statusCode === 200 ? 'supported' : 'unknown',
            evidence: productionVerification.statusCode === 200
              ? `Permintaan live Freelancer berhasil dengan HTTP 200 pada ${productionVerification.checkedAt}.${productionVerification.resultId ? ` ID hasil: ${productionVerification.resultId}.` : ''}${lastFailureNote(productionVerification.lastFailure)}`
              : `Permintaan live terakhir belum terkonfirmasi${productionVerification.statusCode ? ` (HTTP ${productionVerification.statusCode})` : ''}; capability tetap belum terverifikasi.`,
            productionVerification,
          } : {}),
          ...(freelancerSandboxWriteChecks.has(capability.operation as FreelancerSandboxWriteOperation)
            ? { sandboxVerification: freelancerSandboxWriteChecks.get(capability.operation as FreelancerSandboxWriteOperation) }
            : {}),
        };
      }),
      freelancerCredentials: {
        accessTokenConfigured: credentialStatus?.freelancerAccessTokenConfigured ?? false,
        productionWriteConfigured: credentialStatus?.freelancerAccessTokenConfigured ?? false,
        sandboxWriteTestConfigured: options.freelancerSandboxTokenConfigured ?? false,
        verificationStatus: freelancerVerification?.connected ? 'connected' : freelancerVerification?.reason === 'invalid_token' ? 'invalid' : freelancerVerification ? 'unavailable' : 'unverified',
        readProfile: freelancerVerification?.readProfile ?? false,
        readProjects: freelancerVerification?.readProjects ?? false,
        readPortfolio: freelancerVerification?.readPortfolio ?? false,
        readMessages: freelancerVerification?.readMessages ?? false,
      },
      github: {
        read: 'supported',
        verificationStatus: (await repository.listKnowledgeSources()).some((source) => source.provider === 'github') ? 'supported' : 'unknown',
        scope: 'selected repository Contents: read',
        tokenConfigured: Boolean(options.getGitHubToken?.() ?? options.githubToken),
      },
      linkedin: {
        read: linkedin.authorized ? 'oidc-lite' : 'manual-only',
        clientConfigured: credentialStatus?.linkedinClientConfigured ?? false,
        authorized: linkedin.authorized,
        verificationStatus: linkedin.verificationStatus,
        accessTokenExpiresAt: credentialStatus?.linkedinAccessTokenExpiresAt ?? null,
        redirectUri: options.linkedinOAuth?.redirectUri ?? null,
        reason: 'Hanya profil OIDC ringan yang diminta. Produk OIDC LinkedIn harus disetujui dan URL callback yang ditampilkan harus diterima di Developer Portal; akses profil lengkap tetap tidak tersedia.',
      },
      hermes: {
        draft: 'optional', active: draftingMode === 'hermes', draftsInProgress: state.draftsInProgress + ((await options.autopilot?.getStatus())?.draftsInProgress ?? 0) + (options.projectsCoId?.draftsInProgress ?? 0),
        reason: draftingMode === 'hermes'
          ? 'Data proyek terpilih, fakta profil yang diberikan, dan hingga empat potongan bukti lokal dikirim ke profil Hermes yang dikonfigurasi; kredensial marketplace tidak disertakan.'
          : options.draftingReason ?? 'Hermes belum aktif. Draf AI tidak dibuat sampai profil Hermes dikonfigurasi dan persetujuan pemrosesan data diberikan.',
      },
    };
    },

    // Read-only probes of every integration, with the real HTTP status where one exists.
    checkIntegrations: async () => {
      const checkedAt = now().toISOString();
      type Probe = { ok: boolean; status: number | null; detail: string };
      const probe = async (id: string, label: string, run: () => Promise<Probe>) => {
        const started = Date.now();
        try { return { id, label, ...(await run()), latencyMs: Date.now() - started, checkedAt }; }
        catch (error) { return { id, label, ok: false, status: null, detail: error instanceof Error ? error.message.slice(0, 200) : 'Pemeriksaan gagal.', latencyMs: Date.now() - started, checkedAt }; }
      };
      const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
      return await Promise.all([
        probe('database', 'Database (PostgreSQL)', async () => {
          const [row] = await repository.sql.query<{ projects: number; chunks: number }>('SELECT (SELECT COUNT(*) FROM projects)::int AS projects, (SELECT COUNT(*) FROM knowledge_chunks)::int AS chunks');
          return { ok: true, status: 200, detail: `Query berhasil di schema fvh: ${row?.projects ?? 0} proyek, ${row?.chunks ?? 0} potongan knowledge.` };
        }),
        probe('freelancer', 'Freelancer.com (baca)', async () => {
          if (!credentialStatus?.freelancerAccessTokenConfigured || !options.verifyFreelancer) return { ok: false, status: null, detail: 'Token Freelancer belum dikonfigurasi.' };
          const result = await options.verifyFreelancer();
          const reads = [['profil', result.readProfile], ['proyek', result.readProjects], ['portofolio', result.readPortfolio ?? false], ['pesan', result.readMessages ?? false]].map(([name, ok]) => `${name}: ${ok ? 'ok' : 'gagal'}`).join(', ');
          return { ok: result.connected, status: result.connected ? 200 : null, detail: `${reads}.${result.connected ? '' : ` Alasan: ${result.reason}.`}` };
        }),
        probe('github', 'GitHub (baca repo)', async () => {
          const token = options.getGitHubToken?.() ?? options.githubToken;
          const response = await (options.fetcher ?? fetch)('https://api.github.com/rate_limit', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'freelancer-virtual-house', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(10_000) });
          const body = (await response.json().catch(() => null)) as { resources?: { core?: { remaining?: number; limit?: number } } } | null;
          const core = body?.resources?.core;
          return { ok: response.ok, status: response.status, detail: response.ok ? `${token ? 'Token terdaftar' : 'Tanpa token'}; sisa kuota API ${core?.remaining ?? '?'} dari ${core?.limit ?? '?'}.` : `GitHub menolak permintaan (${response.status}).` };
        }),
        probe('linkedin', 'LinkedIn (OIDC)', async () => {
          const state = linkedinVerification(credentialStatus, now());
          const expiry = credentialStatus?.linkedinAccessTokenExpiresAt;
          return { ok: state.authorized, status: null, detail: state.authorized ? `Token tersimpan, berlaku sampai ${expiry}. Tidak diuji langsung ke LinkedIn.` : state.verificationStatus === 'expired' ? 'Token sudah kedaluwarsa.' : 'Belum terhubung.' };
        }),
        probe('hermes', 'Hermes Agent (draf)', async () => ({ ok: draftingMode === 'hermes', status: null, detail: draftingMode === 'hermes' ? 'Aktif; proposal ditulis lewat profil Hermes lokal.' : options.draftingReason ?? 'Nonaktif.' })),
        probe('autopilot', 'Autopilot', async () => {
          const status = await options.autopilot?.getStatus();
          return { ok: status?.state === 'running', status: null, detail: status ? `${status.state}: ${status.lastMessage}` : 'Autopilot tidak tersedia di server ini.' };
        }),
      ]);
    },
  };
}
