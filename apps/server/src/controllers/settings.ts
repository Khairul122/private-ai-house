import { linkedinVerification, type AppContext } from './shared.js';

export function settingsController({ options, repository, now, state, freelancerProductionWriteChecks, refreshProductionWriteChecks }: AppContext) {
  return {
    get: async () => {
      await refreshProductionWriteChecks();
      const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
      const linkedinStatus = linkedinVerification(credentialStatus, now());
      const writeOperations = Object.fromEntries((['submit_bid', 'edit_profile', 'send_message'] as const).map((operation) => [
        operation,
        freelancerProductionWriteChecks.get(operation)?.statusCode === 200 ? 'supported' : 'unknown',
      ]));
      const writeValues = Object.values(writeOperations);
      const writes = writeValues.every((status) => status === 'supported') ? 'supported' : writeValues.some((status) => status === 'supported') ? 'partial' : 'unknown';
      return {
        workspace: { id: 'workspace_local', name: 'Freelancer Virtual House', accountMode: 'single-user lokal' },
        fields: ['Fullstack Engineer', 'Backend Engineer', 'Android Engineer', 'iOS Engineer', 'Frontend Engineer', 'DevOps Engineer', 'QA Engineer', 'UI/UX Designer', 'Data Engineer', 'Technical Writer'],
        profile: await repository.getProfile(),
        capabilities: {
          freelancer: {
            connection: state.freelancerVerification?.connected ? 'connected' : state.freelancerVerification?.reason === 'invalid_token' ? 'invalid' : state.freelancerVerification ? 'unavailable' : 'unverified',
            readProjects: state.freelancerVerification?.readProjects ? 'supported' : 'unknown',
            readProfile: state.freelancerVerification?.readProfile ? 'supported' : 'unknown',
            readPortfolio: state.freelancerVerification?.readPortfolio ? 'supported' : state.freelancerVerification?.portfolioError === 'scope_denied' ? 'unsupported' : 'unknown',
            readMessages: state.freelancerVerification?.readMessages ? 'supported' : state.freelancerVerification?.messagesError === 'scope_denied' ? 'unsupported' : 'unknown',
            writes,
            writeOperations,
          },
          github: 'read-only',
          linkedin: { read: linkedinStatus.authorized ? 'oidc-lite' : 'manual-only', clientConfigured: credentialStatus?.linkedinClientConfigured ?? false, authorized: linkedinStatus.authorized, verificationStatus: linkedinStatus.verificationStatus },
          hermes: 'optional',
        },
        externalWrites: (await repository.getPolicy()).state === 'active' && !(await repository.getPolicy()).simulationOnly,
      };
    },
  };
}
