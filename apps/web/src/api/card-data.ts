import type { Query } from '@tanstack/react-query';

const CARD_QUERIES: Record<string, string[]> = {
  '/overview': ['dashboard', 'projects', 'autopilot', 'inbox', 'work'],
  '/agents': ['dashboard', 'autopilot', 'profile', 'capabilities', 'business-sync', 'inbox', 'work', 'activity', 'operations', 'knowledge-sync', 'projects-co-id', 'hermes-kanban', 'office-learning'],
  '/tasks': ['pipeline', 'hermes-kanban'],
  '/calendar': ['operations', 'autopilot', 'agenda', 'projects', 'policy', 'dashboard', 'work'],
  '/opportunities': ['projects', 'draft', 'autopilot'],
  '/pipeline': ['pipeline'],
  '/inbox': ['inbox'],
  '/work': ['work', 'profile'],
  '/profile': ['profile'],
  '/policy': ['policy', 'policy-presets', 'autopilot'],
  '/knowledge': ['knowledge', 'knowledge-sync', 'capabilities'],
  '/activity': ['activity'],
  '/capabilities': ['capabilities', 'autopilot', 'activity'],
  '/operations': ['operations', 'operations-qr'],
  '/projects-co-id': ['projects-co-id', 'projects-co-id-drafts', 'policy'],
};

export function isCardQuery(query: Pick<Query, 'queryKey' | 'isActive'>, path: string): boolean {
  return query.isActive() && query.queryKey[1] !== 'office' && (CARD_QUERIES[path]?.includes(String(query.queryKey[0])) ?? false);
}

export type CardDataKind = 'waiting' | 'loading' | 'refreshing' | 'ready' | 'error';

type DataState = { status: string; fetchStatus: string; dataUpdatedAt: number };

export type CardDataSummary = {
  kind: CardDataKind;
  label: string;
  updatedAt: number | null;
};

export function summarizeCardData(states: DataState[]): CardDataSummary {
  if (!states.length) return { kind: 'waiting', label: 'Menunggu sumber data kartu', updatedAt: null };
  const failed = states.filter(state => state.status === 'error').length;
  if (failed) return {
    kind: 'error',
    label: `${failed} sumber gagal dimuat${states.some(state => state.fetchStatus === 'fetching') ? ', mencoba kembali' : ', periksa pesan di kartu'}`,
    updatedAt: null,
  };
  if (states.some(state => state.status === 'pending')) return { kind: 'loading', label: 'Memuat sumber data kartu', updatedAt: null };
  const updatedAt = Math.min(...states.map(state => state.dataUpdatedAt));
  if (states.some(state => state.fetchStatus === 'fetching')) return { kind: 'refreshing', label: 'Memperbarui data kartu', updatedAt: updatedAt || null };
  return updatedAt > 0
    ? { kind: 'ready', label: `Data dibaca pukul ${new Date(updatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`, updatedAt }
    : { kind: 'waiting', label: 'Waktu pembacaan belum tersedia', updatedAt: null };
}
