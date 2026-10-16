import type { AutonomyPolicy, CapabilityStatus, PolicyDecision, ProjectOpportunity } from './types.js';
import { matchesProjectKeyword } from './coding-keywords.js';
import { policySchedule } from './policy-schedule.js';

type PolicyInput = {
  policy: AutonomyPolicy;
  project: ProjectOpportunity;
  action: string;
  confidence: number;
  proposedPrice: number;
  dailyUsed: number;
  weeklyUsed: number;
  now: Date;
  capability: CapabilityStatus;
  executionMode?: 'simulated' | 'external';
};

function decision(
  input: PolicyInput,
  allowed: boolean,
  reasonCode: string,
  reason: string,
): PolicyDecision {
  return {
    allowed,
    reasonCode,
    reason,
    policyVersion: input.policy.version,
    simulationOnly: input.executionMode === 'simulated' || input.policy.simulationOnly,
  };
}

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const { policy, project } = input;
  if (policy.state === 'paused') return decision(input, false, 'policy_paused', 'Automasi sedang dijeda.');
  if (policy.state !== 'active') return decision(input, false, 'policy_inactive', 'Kebijakan belum diaktifkan.');
  if (!Number.isFinite(Date.parse(policy.expiresAt)) || Date.parse(policy.expiresAt) <= input.now.getTime()) return decision(input, false, 'policy_expired', 'Masa berlaku kebijakan telah berakhir atau tidak valid.');
  if (!policy.allowedActions.includes(input.action)) return decision(input, false, 'action_not_allowed', 'Jenis tindakan tidak tercakup kebijakan.');
  if ((input.executionMode ?? 'external') === 'external' && input.capability !== 'supported') {
    return decision(input, false, 'capability_unverified', 'Kemampuan API belum terverifikasi; tindakan eksternal dinonaktifkan.');
  }
  if (project.status !== 'open') return decision(input, false, 'project_not_open', 'Peluang tidak lagi terbuka.');
  if (project.deadlineDays === null) {
    if (policy.allowUnknownDeadline !== true) return decision(input, false, 'deadline_unknown', 'Deadline proyek belum dicantumkan; tindakan diblokir sampai waktunya dikonfirmasi.');
  } else if (project.deadlineDays < 1) {
    return decision(input, false, 'deadline_too_close', 'Deadline proyek sudah lewat atau kurang dari satu hari.');
  }
  if (input.confidence < policy.minimumConfidence) return decision(input, false, 'confidence_too_low', 'Keyakinan penilaian di bawah batas kebijakan.');
  if (input.proposedPrice < policy.minPrice || input.proposedPrice > policy.maxPrice) {
    return decision(input, false, 'price_out_of_range', 'Harga usulan berada di luar rentang kebijakan.');
  }
  if (project.riskScore > (policy.maxRiskScore ?? 0.65)) return decision(input, false, 'risk_too_high', 'Risiko proyek melebihi batas kebijakan.');
  if (policy.requireSpecializationMatch !== false && policy.specializations.length > 0 && !project.skills.some((skill) => policy.specializations.some((specialty) => specialty.toLowerCase() === skill.toLowerCase()))) {
    return decision(input, false, 'specialization_mismatch', 'Peluang tidak cocok dengan spesialisasi aktif.');
  }

  const searchable = `${project.title}\n${project.description}\n${project.skills.join(' ')}`.toLowerCase();
  if (policy.keywords.length > 0 && !policy.keywords.some((keyword) => matchesProjectKeyword(searchable, keyword))) {
    return decision(input, false, 'keyword_mismatch', 'Peluang tidak memuat kata kunci kebijakan.');
  }
  if (policy.noNegotiationTerms.some((term) => searchable.includes(term.toLowerCase()))) {
    return decision(input, false, 'non_negotiable_match', 'Brief memuat topik yang dikecualikan kebijakan.');
  }
  if (input.dailyUsed >= policy.dailyBidLimit) return decision(input, false, 'daily_limit_reached', 'Batas bid harian telah tercapai.');
  if (input.weeklyUsed >= policy.weeklyBidLimit) return decision(input, false, 'weekly_limit_reached', 'Batas bid mingguan telah tercapai.');

  try {
    const schedule = policySchedule(policy, input.now);
    if (!schedule.activeDay) return decision(input, false, 'outside_active_days', 'Hari ini berada di luar hari operasi kebijakan.');
    if (!schedule.active) return decision(input, false, 'outside_active_hours', 'Waktu sekarang berada di luar jam operasi kebijakan.');
  } catch {
    return decision(input, false, 'invalid_policy_timezone', 'Zona waktu kebijakan tidak valid.');
  }

  const simulated = input.executionMode === 'simulated' || policy.simulationOnly;
  return decision(input, true, 'allowed', simulated ? 'Lolos untuk simulasi lokal; tidak ada tindakan marketplace.' : 'Lolos pemeriksaan kebijakan.');
}
