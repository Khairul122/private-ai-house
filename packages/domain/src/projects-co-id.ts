import { PROJECTS_CO_ID_DEFAULTS, type AutonomyPolicy, type ProjectOpportunity, type ProjectsCoIdSettings } from './types.js';

export const PROJECTS_CO_ID_FIELDS = [
  { id: 'ai', label: 'AI & Machine Learning', terms: ['AI', 'Machine Learning', 'Chatbot', 'OpenAI', 'LLM'] },
  { id: 'web', label: 'Website & Web App', terms: ['Website', 'Laravel', 'React', 'Next.js', 'WordPress'] },
  { id: 'mobile', label: 'Aplikasi Mobile', terms: ['Android', 'Flutter', 'iOS', 'React Native'] },
  { id: 'backend', label: 'Backend & API', terms: ['API', 'Backend', 'Node.js', 'Golang'] },
  { id: 'data', label: 'Data & Database', terms: ['Python', 'Database', 'MySQL', 'PostgreSQL', 'Scraping'] },
  { id: 'automation', label: 'Bot & Otomasi', terms: ['Bot', 'Automation', 'Otomasi', 'Telegram'] },
  { id: 'design', label: 'UI/UX Design', terms: ['UI/UX', 'Figma', 'Desain'] },
] as const;

/** Stored policies written before the search options existed lack the new keys. */
export function projectsCoIdSettings(policy: Pick<AutonomyPolicy, 'projectsCoId'>): ProjectsCoIdSettings {
  return { ...PROJECTS_CO_ID_DEFAULTS, ...policy.projectsCoId };
}

export function projectsCoIdDraftPolicy(policy: AutonomyPolicy): AutonomyPolicy {
  const settings = projectsCoIdSettings(policy);
  return { ...policy, minPrice: settings.minPrice, maxPrice: settings.maxPrice, dailyBidLimit: settings.dailyBidLimit, weeklyBidLimit: settings.weeklyBidLimit, minimumConfidence: settings.minimumScore / 100 };
}

/** Field terms, own keywords, then profile skills; deduplicated case-insensitively in that order. */
export function projectsCoIdSearchTerms(settings: ProjectsCoIdSettings, profileSkills: string[]): string[] {
  const fieldTerms = PROJECTS_CO_ID_FIELDS.filter(field => settings.fields.includes(field.id)).flatMap(field => field.terms);
  const all = [...fieldTerms, ...settings.keywords, ...(settings.useProfileSkills ? profileSkills : [])].map(term => term.trim()).filter(Boolean);
  const seen = new Set<string>();
  return all.filter(term => !seen.has(term.toLowerCase()) && !!seen.add(term.toLowerCase()));
}

const containsTerm = (haystack: string, term: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(haystack);

/** Field ids whose terms appear in the project's title, description or skills. */
export function projectsCoIdFieldsOf(project: Pick<ProjectOpportunity, 'title' | 'description' | 'skills'>): string[] {
  const haystack = `${project.title}\n${project.description}\n${project.skills.join('\n')}`;
  return PROJECTS_CO_ID_FIELDS.filter(field => field.terms.some(term => containsTerm(haystack, term))).map(field => field.id);
}

export function chooseProjectsCoIdBid(project: ProjectOpportunity, settings: ProjectsCoIdSettings): { amount: number; period: number } | null {
  if (project.source !== 'projects_co_id' || project.projectType !== 'fixed' || project.currency !== 'IDR') return null;
  const amount = Math.max(settings.minPrice, project.budgetMin);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > Math.min(settings.maxPrice, project.budgetMax) || (project.deadlineDays !== null && project.deadlineDays < 1)) return null;
  return { amount, period: project.deadlineDays === null ? 14 : Math.min(project.deadlineDays, 14) };
}
