import { BOARDS, ZONES, type BoardId, type ZoneId } from './office-layout.js';
import type { OfficeAgent } from './office-state.js';

export type CompactLayoutMode = 'desktop' | 'tablet' | 'mobile' | 'compact-mobile' | 'ultra-compact';

export type AlternativeBoardCategory = 'pantauan' | 'peluang' | 'klien' | 'tim' | 'sistem';

export interface AlternativeBoardTarget {
  id: BoardId;
  label: string;
  route: string;
  floor: 1 | 2;
  category: AlternativeBoardCategory;
}

export interface AlternativeZoneTarget {
  id: ZoneId;
  label: string;
  count: number;
}

export interface AlternativeAgentTarget {
  id: string;
  name: string;
  role: string;
  state: string;
  color: string;
  floor: 1 | 2;
  isPlaced: boolean;
}

export type SecondaryControlId = 'view-3d' | 'view-top' | 'tour' | 'overview' | 'toggle-map' | 'toggle-floor';

export interface SecondaryControlItem {
  id: SecondaryControlId;
  label: string;
  description: string;
  active: boolean;
  disabled: boolean;
  ariaLabel: string;
}

export function isCompactMode(width: number): boolean {
  return width <= 760;
}

export function isCompactMobile(width: number): boolean {
  return width <= 420;
}

export function isUltraCompact(width: number): boolean {
  return width <= 360;
}

export function resolveCompactLayout(width: number) {
  const isUltra = isUltraCompact(width);
  const isCompactMob = isCompactMobile(width);
  const isMob = isCompactMode(width);
  const isTab = width <= 1100 && width > 760;

  let mode: CompactLayoutMode = 'desktop';
  if (isUltra) mode = 'ultra-compact';
  else if (isCompactMob) mode = 'compact-mobile';
  else if (isMob) mode = 'mobile';
  else if (isTab) mode = 'tablet';

  return {
    width,
    isMobile: isMob,
    isCompactMobile: isCompactMob,
    isUltraCompact: isUltra,
    isTablet: isTab,
    isDesktop: !isMob && !isTab,
    layoutMode: mode,
  };
}

const BOARD_CATEGORY_MAP: Record<BoardId, AlternativeBoardCategory> = {
  activity: 'pantauan',
  opportunities: 'peluang',
  'projects-co-id': 'peluang',
  pipeline: 'peluang',
  tasks: 'peluang',
  inbox: 'klien',
  work: 'klien',
  operations: 'klien',
  calendar: 'klien',
  agents: 'tim',
  profile: 'tim',
  knowledge: 'tim',
  policy: 'sistem',
  capabilities: 'sistem',
};

/**
 * Returns alternative targets for all office wall boards so that
 * any board can be opened or framed on compact screens without
 * having to tap the 3D wall mesh.
 */
export function getAlternativeBoards(floor?: 1 | 2): AlternativeBoardTarget[] {
  return BOARDS.filter((board) => floor === undefined || (board.floor ?? 1) === floor).map((board) => ({
    id: board.id,
    label: board.label,
    route: board.route,
    floor: board.floor ?? 1,
    category: BOARD_CATEGORY_MAP[board.id] ?? 'sistem',
  }));
}

/**
 * Returns alternative targets for all office zones so that
 * any zone can be focused on small screens.
 */
export function getAlternativeZones(agentCountByZone: Record<string, number> = {}): AlternativeZoneTarget[] {
  return ZONES.map((zone) => ({
    id: zone.id,
    label: zone.label,
    count: agentCountByZone[zone.id] ?? 0,
  }));
}

/**
 * Returns alternative targets for all office agents.
 */
export function getAlternativeAgents(agents: OfficeAgent[], floor?: 1 | 2): AlternativeAgentTarget[] {
  return agents
    .filter((agent) => floor === undefined || (agent.floor ?? 1) === floor)
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      state: agent.state,
      color: agent.color,
      floor: agent.floor ?? 1,
      isPlaced: agent.state !== 'offline',
    }));
}

/**
 * Returns available secondary controls for camera view, rotation,
 * and overview targeting to guarantee accessibility on compact screens
 * via the alternative menu.
 */
export function getSecondaryControls(options: {
  view: '3d' | 'top';
  tour: boolean;
  floor: 1 | 2;
  minimapOpen: boolean;
  reducedMotion: boolean;
}): SecondaryControlItem[] {
  return [
    {
      id: 'view-3d',
      label: 'Tampilan 3D',
      description: 'Sudut pandang isometrik 3D kantor',
      active: options.view === '3d',
      disabled: false,
      ariaLabel: 'Ubah ke tampilan 3D isometrik',
    },
    {
      id: 'view-top',
      label: 'Denah Atas',
      description: 'Tampilan tegak lurus dari atas (top-down 2D)',
      active: options.view === 'top',
      disabled: false,
      ariaLabel: 'Ubah ke tampilan denah atas',
    },
    {
      id: 'tour',
      label: options.tour ? 'Hentikan Tur' : 'Tur Otomatis',
      description: 'Putar kamera mengelilingi kantor secara perlahan',
      active: options.tour,
      disabled: options.reducedMotion,
      ariaLabel: options.reducedMotion
        ? 'Tur dinonaktifkan karena preferensi kurangi gerakan'
        : options.tour
          ? 'Hentikan tur otomatis'
          : 'Mulai tur kamera otomatis',
    },
    {
      id: 'overview',
      label: 'Pusatkan Kamera',
      description: 'Kembalikan fokus kamera ke tengah lantai kantor',
      active: false,
      disabled: false,
      ariaLabel: 'Pusatkan kamera ke seluruh kantor',
    },
    {
      id: 'toggle-map',
      label: options.minimapOpen ? 'Tutup Peta' : 'Buka Peta',
      description: 'Tampilkan peta denah lantai untuk navigasi cepat',
      active: options.minimapOpen,
      disabled: false,
      ariaLabel: options.minimapOpen ? 'Tutup denah minimap kantor' : 'Buka denah minimap kantor',
    },
    {
      id: 'toggle-floor',
      label: options.floor === 1 ? 'Ke Lantai 2' : 'Ke Lantai 1',
      description: `Beralih ke lantai ${options.floor === 1 ? 2 : 1}`,
      active: false,
      disabled: false,
      ariaLabel: `Beralih ke lantai ${options.floor === 1 ? 2 : 1}`,
    },
  ];
}
