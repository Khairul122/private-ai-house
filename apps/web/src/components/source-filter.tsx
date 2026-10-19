import { useSearchParams } from 'react-router';
import type { Opportunity } from '../api/api.js';

type SourceKey = 'all' | 'freelancer' | 'projects_co_id';
const SOURCE_OPTIONS: Array<[SourceKey, string]> = [['all', 'Semua sumber'], ['freelancer', 'Freelancer.com'], ['projects_co_id', 'projects.co.id']];
export /** Shared ?source= filter so boards and the projects.co.id card can deep-link into each page. */
function useSourceFilter(): [SourceKey, (next: SourceKey) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get('source');
  const source: SourceKey = value === 'freelancer' || value === 'projects_co_id' ? value : 'all';
  return [source, next => setParams(current => { const copy = new URLSearchParams(current); if (next === 'all') copy.delete('source'); else copy.set('source', next); return copy; }, { replace: true })];
}
export function SourceSelect({ value, onChange, labels = {} }: { value: SourceKey; onChange: (next: SourceKey) => void; labels?: Partial<Record<SourceKey, string>> }) {
  return <label className="form-field"><span>Sumber</span><select value={value} onChange={event => onChange(event.target.value as SourceKey)}>{SOURCE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{labels[key] ?? label}</option>)}</select></label>;
}
export const matchesSource = (source: SourceKey, projectSource: Opportunity['source']) => source === 'all' || (source === 'projects_co_id' ? projectSource === 'projects_co_id' : projectSource !== 'projects_co_id');
export const projectLink = (project: Pick<Opportunity, 'id' | 'source'>) => project.source === 'projects_co_id' ? `/projects-co-id?project=${encodeURIComponent(project.id)}` : `/opportunities?project=${encodeURIComponent(project.id)}`;

export const opportunitySource = (source: Opportunity['source']) => source === 'projects_co_id' ? 'projects.co.id' : source === 'freelancer' ? 'Freelancer.com' : 'Fixture pengujian';
