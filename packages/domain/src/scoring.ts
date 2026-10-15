import type { ProjectOpportunity } from './types.js';

export type ScoreFactor = { key: string; label: string; points: number; value: string };

export function scoreProject(project: ProjectOpportunity, specializations: string[]): { score: number; factors: ScoreFactor[] } {
  if (project.status !== 'open') {
    return { score: 0, factors: [{ key: 'availability', label: 'Ketersediaan', points: 0, value: 'expired' }] };
  }

  const selected = specializations.map((item) => item.toLowerCase());
  const matched = project.skills.filter((skill) => selected.includes(skill.toLowerCase()));
  const skills = selected.length === 0 ? 18 : Math.round(35 * Math.min(1, matched.length / Math.min(selected.length, 2)));
  const budget = project.budgetMax > 0 && project.budgetMin >= 0 ? 25 : 0;
  const deadline = project.deadlineDays !== null && project.deadlineDays >= 7 ? 15 : project.deadlineDays !== null && project.deadlineDays >= 3 ? 9 : project.deadlineDays !== null && project.deadlineDays >= 1 ? 4 : 0;
  const brief = Math.round(15 * Math.max(0, Math.min(1, project.briefQuality)));
  const risk = Math.round(10 * (1 - Math.max(0, Math.min(1, project.riskScore))));
  const factors: ScoreFactor[] = [
    { key: 'skills', label: 'Kecocokan spesialisasi', points: skills, value: matched.length ? matched.join(', ') : 'belum cocok' },
    { key: 'budget', label: 'Kejelasan anggaran', points: budget, value: `${project.currency} ${project.budgetMin}–${project.budgetMax}` },
    { key: 'deadline', label: 'Ruang tenggat', points: deadline, value: project.deadlineDays === null ? 'belum dicantumkan' : `${project.deadlineDays} hari` },
    { key: 'brief', label: 'Kualitas brief', points: brief, value: `${Math.round(project.briefQuality * 100)}%` },
    { key: 'risk', label: 'Risiko', points: risk, value: `${Math.round(project.riskScore * 100)}%` },
  ];
  return { score: Math.max(0, Math.min(100, factors.reduce((total, factor) => total + factor.points, 0))), factors };
}
