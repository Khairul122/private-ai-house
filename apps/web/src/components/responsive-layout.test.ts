import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Responsive layout contracts and CSS breakpoints', () => {
  const cssPath = path.resolve(__dirname, '../styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  it('defines responsive cards for pipeline, audit, and invoice on mobile <=760px', () => {
    // Media query <=760px block exists
    expect(css).toContain('@media (max-width: 760px)');

    // Pipeline card layout on mobile
    expect(css).toMatch(/\.pipeline-row[^{]*\{[^}]*display:\s*flex;\s*flex-direction:\s*column/);
    expect(css).toMatch(/\.pipeline-state[^{]*\{[^}]*display:\s*flex;\s*align-items:\s*center;\s*justify-content:\s*space-between/);

    // Audit card layout on mobile
    expect(css).toMatch(/\.activity-row[^{]*\{[^}]*display:\s*flex;\s*flex-direction:\s*column/);
    expect(css).toMatch(/\.activity-mark[^{]*\{[^}]*display:\s*none/);

    // Invoice card layout on mobile
    expect(css).toMatch(/\.invoice-card[^{]*\{[^}]*display:\s*flex;\s*flex-direction:\s*column/);
    expect(css).toMatch(/\.invoice-action[^{]*\{[^}]*width:\s*100%/);
  });

  it('defines vertical stack for kanban on mobile <=760px and preserves directed horizontal scroll above 760px', () => {
    // Kanban vertical stack on mobile <=760px
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.kanban-board[^{]*\{[^}]*display:\s*flex;\s*flex-direction:\s*column;\s*gap:\s*14px;\s*overflow-x:\s*visible/);
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.kanban-column[^{]*\{[^}]*width:\s*100%;\s*min-height:\s*auto/);

    // Directed horizontal scroll with scroll snapping on desktop / tablet >760px
    expect(css).toMatch(/@media\s*\(min-width:\s*761px\)[\s\S]*?\.kanban-board[^{]*\{[\s\S]*?overflow-x:\s*auto;[\s\S]*?scroll-snap-type:\s*x proximity;[\s\S]*?overscroll-behavior-x:\s*contain/);
    expect(css).toMatch(/@media\s*\(min-width:\s*761px\)[\s\S]*?\.kanban-column[^{]*\{[\s\S]*?scroll-snap-align:\s*start/);
  });

  it('guarantees a minimum width of 280px for progress tracks and meters', () => {
    // Chart tracks and progress bars must have a min-width of at least 280px
    expect(css).toMatch(/\.meter-track,\s*\.meter-row,\s*\.reason-meter,\s*progress[^{]*\{[^}]*min-width:\s*280px/);
  });

  it('defines responsive cards for Knowledge Hub and Capabilities on mobile <=760px', () => {
    expect(css).toMatch(/\.source-row[^{]*\{[^}]*display:\s*flex;\s*flex-direction:\s*column/);
    expect(css).toMatch(/\.source-actions[^{]*\{[^}]*display:\s*flex;\s*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.capability-row[^{]*\{[^}]*display:\s*flex;\s*flex-direction:\s*column/);
  });

  it('provides accessible keyboard focus styles for kanban controls', () => {
    expect(css).toMatch(/\.kanban-move-select:focus[^{]*\{[^}]*outline:\s*2px solid/);
  });
});
