import { describe, expect, it } from 'vitest';
import { trapFocus } from '../office/OfficeShell.js';
import {
  getAlternativeAgents,
  getAlternativeBoards,
  getAlternativeZones,
  getSecondaryControls,
  isCompactMobile,
  isCompactMode,
  isUltraCompact,
  resolveCompactLayout,
} from './compact-controls.js';
import type { OfficeAgent } from './office-state.js';

describe('compact controls & alternative navigation', () => {
  describe('viewport classification', () => {
    it('classifies compact breakpoints correctly', () => {
      expect(isCompactMode(760)).toBe(true);
      expect(isCompactMode(420)).toBe(true);
      expect(isCompactMode(360)).toBe(true);
      expect(isCompactMode(761)).toBe(false);

      expect(isCompactMobile(420)).toBe(true);
      expect(isCompactMobile(360)).toBe(true);
      expect(isCompactMobile(421)).toBe(false);

      expect(isUltraCompact(360)).toBe(true);
      expect(isUltraCompact(320)).toBe(true);
      expect(isUltraCompact(361)).toBe(false);
    });

    it('resolves layout modes deterministically across all target viewports', () => {
      expect(resolveCompactLayout(320).layoutMode).toBe('ultra-compact');
      expect(resolveCompactLayout(360).layoutMode).toBe('ultra-compact');
      expect(resolveCompactLayout(375).layoutMode).toBe('compact-mobile');
      expect(resolveCompactLayout(420).layoutMode).toBe('compact-mobile');
      expect(resolveCompactLayout(540).layoutMode).toBe('mobile');
      expect(resolveCompactLayout(760).layoutMode).toBe('mobile');
      expect(resolveCompactLayout(960).layoutMode).toBe('tablet');
      expect(resolveCompactLayout(1440).layoutMode).toBe('desktop');
    });

    it('sets flags consistently for compact and ultra compact', () => {
      const ultra = resolveCompactLayout(360);
      expect(ultra.isUltraCompact).toBe(true);
      expect(ultra.isCompactMobile).toBe(true);
      expect(ultra.isMobile).toBe(true);

      const compact = resolveCompactLayout(390);
      expect(compact.isUltraCompact).toBe(false);
      expect(compact.isCompactMobile).toBe(true);
      expect(compact.isMobile).toBe(true);

      const desktop = resolveCompactLayout(1280);
      expect(desktop.isUltraCompact).toBe(false);
      expect(desktop.isCompactMobile).toBe(false);
      expect(desktop.isMobile).toBe(false);
      expect(desktop.isDesktop).toBe(true);
    });
  });

  describe('alternative targets: boards, zones, and agents', () => {
    it('provides alternative targets for all office wall boards', () => {
      const allBoards = getAlternativeBoards();
      expect(allBoards.length).toBeGreaterThanOrEqual(13);

      const expectedIds = [
        'opportunities',
        'pipeline',
        'tasks',
        'calendar',
        'inbox',
        'work',
        'activity',
        'projects-co-id',
        'agents',
        'profile',
        'policy',
        'knowledge',
        'capabilities',
        'operations',
      ];

      for (const id of expectedIds) {
        const found = allBoards.find((b) => b.id === id);
        expect(found, `Board ${id} should be in alternative targets`).toBeDefined();
        expect(found?.route).toMatch(/^\/[a-z0-9-]+/);
        expect(found?.label.length).toBeGreaterThan(0);
      }
    });

    it('filters alternative boards by floor', () => {
      const floor1Boards = getAlternativeBoards(1);
      const floor2Boards = getAlternativeBoards(2);

      expect(floor1Boards.some((b) => b.id === 'operations')).toBe(false);
      expect(floor2Boards.some((b) => b.id === 'operations')).toBe(true);
      expect(floor1Boards.length + floor2Boards.length).toBe(getAlternativeBoards().length);
    });

    it('provides alternative targets for all office zones', () => {
      const zones = getAlternativeZones({ workspace: 4, meeting: 2 });
      expect(zones.length).toBe(5);

      const zoneIds = zones.map((z) => z.id);
      expect(zoneIds).toContain('workspace');
      expect(zoneIds).toContain('meeting');
      expect(zoneIds).toContain('lounge');
      expect(zoneIds).toContain('pantry');
      expect(zoneIds).toContain('lobby');

      expect(zones.find((z) => z.id === 'workspace')?.count).toBe(4);
      expect(zones.find((z) => z.id === 'meeting')?.count).toBe(2);
      expect(zones.find((z) => z.id === 'lounge')?.count).toBe(0);
    });

    it('provides alternative targets for agents including placement status', () => {
      const mockAgents: OfficeAgent[] = [
        {
          id: 'lead-agent',
          name: 'Lead Agent (Hermes)',
          role: 'Orkestrator Utama',
          state: 'idle',
          color: '#10b981',
          room: 'lounge',
          floor: 1,
          reason: 'Menunggu penugasan',
          task: null,
          recentActivity: [],
        },
        {
          id: 'qa-engineer',
          name: 'QA Engineer',
          role: 'Pengujian Mutu',
          state: 'offline',
          color: '#6b7280',
          room: null,
          floor: 1,
          reason: 'Offline',
          task: null,
          recentActivity: [],
        },
      ];

      const targets = getAlternativeAgents(mockAgents);
      expect(targets).toHaveLength(2);

      const lead = targets.find((a) => a.id === 'lead-agent');
      expect(lead?.isPlaced).toBe(true);
      expect(lead?.floor).toBe(1);

      const qa = targets.find((a) => a.id === 'qa-engineer');
      expect(qa?.isPlaced).toBe(false);
    });
  });

  describe('secondary controls for alternative menu', () => {
    it('provides all required secondary controls', () => {
      const controls = getSecondaryControls({
        view: '3d',
        tour: false,
        floor: 1,
        minimapOpen: false,
        reducedMotion: false,
      });

      const controlIds = controls.map((c) => c.id);
      expect(controlIds).toContain('view-3d');
      expect(controlIds).toContain('view-top');
      expect(controlIds).toContain('tour');
      expect(controlIds).toContain('overview');
      expect(controlIds).toContain('toggle-map');
      expect(controlIds).toContain('toggle-floor');
    });

    it('reflects active state for 3D versus top-down view', () => {
      const controls3D = getSecondaryControls({
        view: '3d',
        tour: false,
        floor: 1,
        minimapOpen: false,
        reducedMotion: false,
      });
      expect(controls3D.find((c) => c.id === 'view-3d')?.active).toBe(true);
      expect(controls3D.find((c) => c.id === 'view-top')?.active).toBe(false);

      const controlsTop = getSecondaryControls({
        view: 'top',
        tour: false,
        floor: 1,
        minimapOpen: false,
        reducedMotion: false,
      });
      expect(controlsTop.find((c) => c.id === 'view-3d')?.active).toBe(false);
      expect(controlsTop.find((c) => c.id === 'view-top')?.active).toBe(true);
    });

    it('disables tour control when reducedMotion is enabled', () => {
      const normal = getSecondaryControls({
        view: '3d',
        tour: false,
        floor: 1,
        minimapOpen: false,
        reducedMotion: false,
      });
      expect(normal.find((c) => c.id === 'tour')?.disabled).toBe(false);

      const reduced = getSecondaryControls({
        view: '3d',
        tour: false,
        floor: 1,
        minimapOpen: false,
        reducedMotion: true,
      });
      expect(reduced.find((c) => c.id === 'tour')?.disabled).toBe(true);
      expect(reduced.find((c) => c.id === 'tour')?.ariaLabel).toContain('preferensi kurangi gerakan');
    });

    it('dynamically adapts floor toggle label and destination', () => {
      const floor1 = getSecondaryControls({
        view: '3d',
        tour: false,
        floor: 1,
        minimapOpen: false,
        reducedMotion: false,
      });
      expect(floor1.find((c) => c.id === 'toggle-floor')?.label).toBe('Ke Lantai 2');

      const floor2 = getSecondaryControls({
        view: '3d',
        tour: false,
        floor: 2,
        minimapOpen: false,
        reducedMotion: false,
      });
      expect(floor2.find((c) => c.id === 'toggle-floor')?.label).toBe('Ke Lantai 1');
    });
  });

  describe('target menu focus trap & accessibility', () => {
    it('traps focus forward from last item to first item', () => {
      let focused = 'none';
      const btnFirst = { id: 'tab-boards', checkVisibility: () => true, focus: () => { focused = 'tab-boards'; } };
      const btnClose = { id: 'btn-close', checkVisibility: () => true, focus: () => { focused = 'btn-close'; } };
      const container = {
        querySelectorAll: () => [btnFirst, btnClose],
      };

      Object.defineProperty(globalThis, 'document', {
        value: { activeElement: btnClose },
        configurable: true,
      });

      let prevented = false;
      const event = {
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => { prevented = true; },
      } as unknown as KeyboardEvent;

      trapFocus(container as unknown as HTMLElement, event);
      expect(prevented).toBe(true);
      expect(focused).toBe('tab-boards');
    });

    it('traps focus backward from first item to last item on Shift+Tab', () => {
      let focused = 'none';
      const btnFirst = { id: 'tab-boards', checkVisibility: () => true, focus: () => { focused = 'tab-boards'; } };
      const btnClose = { id: 'btn-close', checkVisibility: () => true, focus: () => { focused = 'btn-close'; } };
      const container = {
        querySelectorAll: () => [btnFirst, btnClose],
      };

      Object.defineProperty(globalThis, 'document', {
        value: { activeElement: btnFirst },
        configurable: true,
      });

      let prevented = false;
      const event = {
        key: 'Tab',
        shiftKey: true,
        preventDefault: () => { prevented = true; },
      } as unknown as KeyboardEvent;

      trapFocus(container as unknown as HTMLElement, event);
      expect(prevented).toBe(true);
      expect(focused).toBe('btn-close');
    });
  });
});
