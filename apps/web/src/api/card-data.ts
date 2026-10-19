import type { Query } from '@tanstack/react-query';

const CARD_QUERIES: Record<string, string[]> = {
  '/overview': ['dashboard', 'projects', 'pipeline', 'insights', 'autopilot'],
  '/agents': ['dashboard', 'autopilot', 'profile', 'capabilities', 'business-sync', 'inbox', 'work', 'activity', 'operations', 'knowledge-sync', 'browser-bidding', 'projects-co-id', 'hermes-kanban'],
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
  '/capabilities': ['capabilities', 'autopilot', 'browser-bidding', 'activity'],
  '/operations': ['operations', 'operations-qr', 'browser-bidding'],
  '/projects-co-id': ['projects-co-id', 'projects-co-id-drafts', 'policy'],
};

export function isCardQuery(query: Pick<Query, 'queryKey' | 'isActive'>, path: string): boolean {
  return query.isActive() && query.queryKey[1] !== 'office' && (CARD_QUERIES[path]?.includes(String(query.queryKey[0])) ?? false);
}

type DataState = { status: string; fetchStatus: string; dataUpdatedAt: number };

export function describeCardData(states: DataState[]): string {
  if (!states.length) return 'Menunggu data kartu';
  const failed = states.filter(state => state.status === 'error').length;
  if (failed) return `${failed} sumber gagal dimuat${states.some(state => state.fetchStatus === 'fetching') ? ' · mencoba kembali' : ' · periksa pesan di kartu'}`;
  if (states.some(state => state.status === 'pending')) return 'Memuat sumber data kartu…';
  if (states.some(state => state.fetchStatus === 'fetching')) return 'Memperbarui data kartu…';
  const oldest = Math.min(...states.map(state => state.dataUpdatedAt));
  return oldest > 0 ? `Data dibaca ${new Date(oldest).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Waktu pembacaan belum tersedia';
}
