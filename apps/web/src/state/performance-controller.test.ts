import { describe, expect, it } from 'vitest';
import { PerformanceController } from './performance-controller.js';

describe('PerformanceController state machine', () => {
  it('initializes in normal status with 60 FPS', () => {
    const controller = new PerformanceController();
    expect(controller.getStatus()).toBe('normal');
    expect(controller.getMetrics().lastFps).toBe(60);
  });

  it('stays normal when FPS fluctuates above 30', () => {
    const controller = new PerformanceController();
    controller.update(58, 500);
    controller.update(45, 1000);
    controller.update(32, 1000);
    expect(controller.getStatus()).toBe('normal');
  });

  it('stays normal if FPS is below 30 for less than 2 seconds', () => {
    const controller = new PerformanceController();
    controller.update(28, 1000);
    expect(controller.getStatus()).toBe('normal');
    controller.update(29, 800); // Total 1800ms
    expect(controller.getStatus()).toBe('normal');

    // FPS recovers momentarily
    controller.update(40, 200);
    expect(controller.getStatus()).toBe('normal');
    expect(controller.getMetrics().belowReducedMs).toBe(0);
  });

  it('transitions to reduced-effects after FPS is below 30 for 2 seconds (2000ms)', () => {
    const controller = new PerformanceController();
    controller.update(28, 1000);
    expect(controller.getStatus()).toBe('normal');
    controller.update(27, 1000); // 2000ms reached
    expect(controller.getStatus()).toBe('reduced-effects');
  });

  it('transitions to fallback-offer after FPS is below 24 for 5 seconds (5000ms)', () => {
    const controller = new PerformanceController();
    // First 2 seconds at 20 FPS -> triggers reduced-effects
    controller.update(20, 1000);
    controller.update(20, 1000);
    expect(controller.getStatus()).toBe('reduced-effects');

    // Another 3 seconds at 20 FPS (total 5000ms below 24)
    controller.update(20, 2000);
    expect(controller.getStatus()).toBe('reduced-effects');
    controller.update(20, 1000);
    expect(controller.getStatus()).toBe('fallback-offer');
  });

  it('enforces hysteresis recovery: does not recover to normal on border FPS (30-34)', () => {
    const controller = new PerformanceController({
      reducedFpsThreshold: 30,
      reducedDurationMs: 2000,
      recoveryFpsThreshold: 35,
      recoveryDurationMs: 3000,
    });

    // Enter reduced-effects
    controller.update(25, 2000);
    expect(controller.getStatus()).toBe('reduced-effects');

    // Hovering at 32 FPS (above 30, but below recovery threshold 35)
    controller.update(32, 2000);
    controller.update(33, 2000);
    expect(controller.getStatus()).toBe('reduced-effects');
    expect(controller.getMetrics().recoveryMs).toBe(0);
  });

  it('recovers to normal only after sustained FPS >= 35 for 3 seconds (3000ms)', () => {
    const controller = new PerformanceController({
      reducedFpsThreshold: 30,
      reducedDurationMs: 2000,
      recoveryFpsThreshold: 35,
      recoveryDurationMs: 3000,
    });

    // Enter reduced-effects
    controller.update(25, 2000);
    expect(controller.getStatus()).toBe('reduced-effects');

    // FPS jumps to 55 for 2 seconds
    controller.update(55, 2000);
    expect(controller.getStatus()).toBe('reduced-effects');

    // Interrupted by a drop to 28 FPS
    controller.update(28, 200);
    expect(controller.getStatus()).toBe('reduced-effects');
    expect(controller.getMetrics().recoveryMs).toBe(0);

    // Sustained high FPS for full 3000ms
    controller.update(50, 1500);
    controller.update(52, 1500);
    expect(controller.getStatus()).toBe('normal');
  });

  it('allows dismissing fallback offer and prevents immediate re-prompt', () => {
    const controller = new PerformanceController();
    // Drive into fallback-offer
    controller.update(20, 2000);
    controller.update(20, 3000);
    expect(controller.getStatus()).toBe('fallback-offer');

    controller.dismissFallbackOffer();
    expect(controller.getStatus()).toBe('reduced-effects');
    expect(controller.getMetrics().fallbackDismissed).toBe(true);

    // Further low frames should not re-trigger fallback-offer while dismissed
    controller.update(20, 6000);
    expect(controller.getStatus()).toBe('reduced-effects');
  });

  it('recovers from fallback-offer to reduced-effects on sustained recovery FPS', () => {
    const controller = new PerformanceController();
    // Drive into fallback-offer
    controller.update(20, 2000);
    controller.update(20, 3000);
    expect(controller.getStatus()).toBe('fallback-offer');

    // Sustained 45 FPS for 3000ms
    controller.update(45, 1500);
    expect(controller.getStatus()).toBe('fallback-offer');
    controller.update(45, 1500);
    expect(controller.getStatus()).toBe('reduced-effects');
  });

  it('resets correctly to initial state', () => {
    const controller = new PerformanceController();
    controller.update(15, 6000);
    expect(controller.getStatus()).toBe('fallback-offer');

    controller.reset();
    expect(controller.getStatus()).toBe('normal');
    expect(controller.getMetrics().belowReducedMs).toBe(0);
    expect(controller.getMetrics().belowFallbackMs).toBe(0);
    expect(controller.getMetrics().recoveryMs).toBe(0);
  });
});
