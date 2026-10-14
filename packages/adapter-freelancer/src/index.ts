import type { CapabilityStatus } from '@fvh/domain';

export type FreelancerCapability = {
  operation: 'read_projects' | 'read_profile' | 'read_portfolio' | 'read_messages' | 'submit_bid' | 'edit_profile' | 'send_message';
  status: CapabilityStatus;
  evidence: string;
};

export type FreelancerReadVerification = {
  readProfile: boolean;
  readProjects: boolean;
};

export const freelancerCapabilities: FreelancerCapability[] = [
  { operation: 'read_projects', status: 'supported', evidence: 'The official Freelancer Python SDK v0.1 documents active project search at GET /api/projects/0.1/projects/active/; account authorization is checked separately.' },
  { operation: 'read_profile', status: 'supported', evidence: 'The official Freelancer Python SDK v0.1 documents the authenticated profile endpoint GET /api/users/0.1/self/; account authorization is checked separately.' },
  { operation: 'read_portfolio', status: 'unknown', evidence: 'Endpoint contract and scopes require verification in the owner developer account.' },
  { operation: 'read_messages', status: 'unknown', evidence: 'Endpoint contract and scopes require verification in the owner developer account.' },
  { operation: 'submit_bid', status: 'unknown', evidence: 'No endpoint, scope, idempotency, or sandbox parity verified; external writes disabled.' },
  { operation: 'edit_profile', status: 'unknown', evidence: 'No endpoint or authorized sandbox verified; external writes disabled.' },
  { operation: 'send_message', status: 'unknown', evidence: 'No endpoint or authorized sandbox verified; external writes disabled.' },
];

export function getFreelancerCapabilities(verification?: FreelancerReadVerification | null) {
  return freelancerCapabilities.map((capability) => {
    if (capability.operation === 'read_profile' && verification?.readProfile) {
      return { ...capability, status: 'supported' as const, evidence: 'Official SDK contract confirmed and live read-only verification passed for GET /api/users/0.1/self/ with the saved account token.' };
    }
    if (capability.operation === 'read_projects' && verification?.readProjects) {
      return { ...capability, status: 'supported' as const, evidence: 'Official SDK contract confirmed and live read-only verification passed for GET /api/projects/0.1/projects/active/ with the saved account token.' };
    }
    return { ...capability };
  });
}
