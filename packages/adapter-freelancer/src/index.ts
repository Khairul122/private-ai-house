import type { CapabilityStatus } from '@fvh/domain';

export type FreelancerCapability = {
  operation: 'read_projects' | 'read_profile' | 'read_portfolio' | 'read_messages' | 'submit_bid' | 'edit_profile' | 'send_message';
  status: CapabilityStatus;
  evidence: string;
};

export const freelancerCapabilities: FreelancerCapability[] = [
  { operation: 'read_projects', status: 'unknown', evidence: 'Endpoint contract and scopes require verification in the owner developer account.' },
  { operation: 'read_profile', status: 'unknown', evidence: 'Endpoint contract and scopes require verification in the owner developer account.' },
  { operation: 'read_portfolio', status: 'unknown', evidence: 'Endpoint contract and scopes require verification in the owner developer account.' },
  { operation: 'read_messages', status: 'unknown', evidence: 'Endpoint contract and scopes require verification in the owner developer account.' },
  { operation: 'submit_bid', status: 'unknown', evidence: 'No endpoint, scope, idempotency, or sandbox parity verified; external writes disabled.' },
  { operation: 'edit_profile', status: 'unknown', evidence: 'No endpoint or authorized sandbox verified; external writes disabled.' },
  { operation: 'send_message', status: 'unknown', evidence: 'No endpoint or authorized sandbox verified; external writes disabled.' },
];

export function getFreelancerCapabilities() {
  return freelancerCapabilities.map((capability) => ({ ...capability }));
}
