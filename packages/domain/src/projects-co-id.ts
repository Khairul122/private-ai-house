import { PROJECTS_CO_ID_DEFAULTS, type AutonomyPolicy, type ProjectOpportunity, type ProjectsCoIdSettings } from './types.js';

export function projectsCoIdDraftPolicy(policy: AutonomyPolicy): AutonomyPolicy {
  const settings = policy.projectsCoId ?? PROJECTS_CO_ID_DEFAULTS;
  return { ...policy, minPrice: settings.minPrice, maxPrice: settings.maxPrice, dailyBidLimit: settings.dailyBidLimit, weeklyBidLimit: settings.weeklyBidLimit };
}

export function chooseProjectsCoIdBid(project: ProjectOpportunity, settings: ProjectsCoIdSettings): { amount: number; period: number } | null {
  if (project.source !== 'projects_co_id' || project.projectType !== 'fixed' || project.currency !== 'IDR') return null;
  const amount = Math.max(settings.minPrice, project.budgetMin);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > Math.min(settings.maxPrice, project.budgetMax) || (project.deadlineDays !== null && project.deadlineDays < 1)) return null;
  return { amount, period: project.deadlineDays === null ? 14 : Math.min(project.deadlineDays, 14) };
}
