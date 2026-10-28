import type { AgentState } from './office-state.js';

export type WorkstationPodConfig = {
  width: 2.45;
  depth: 1.05;
  height: 0.75;
  dividerHeight: 0.2;
  chairRadius: 0.38;
  monitorWidth: 0.75;
  monitorTop: 1.45;
};

export type TechCampusTheme = {
  slate: '#334155';
  charcoal: '#1e293b';
  white: '#f8fafc';
  emerald: '#10b981';
  standby: '#0f172a';
  workstation: WorkstationPodConfig;
};

export const TECH_CAMPUS_THEME: TechCampusTheme = {
  slate: '#334155',
  charcoal: '#1e293b',
  white: '#f8fafc',
  emerald: '#10b981',
  standby: '#0f172a',
  workstation: {
    width: 2.45,
    depth: 1.05,
    height: 0.75,
    dividerHeight: 0.2,
    chairRadius: 0.38,
    monitorWidth: 0.75,
    monitorTop: 1.45,
  },
};

export function monitorEmissive(state: AgentState | undefined): { color: string; intensity: number } {
  return state === 'working' || state === 'reviewing'
    ? { color: TECH_CAMPUS_THEME.emerald, intensity: 0.65 }
    : { color: TECH_CAMPUS_THEME.standby, intensity: 0 };
}
