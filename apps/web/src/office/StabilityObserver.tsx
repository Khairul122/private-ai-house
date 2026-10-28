import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { WebglLifecycleController } from './webgl-lifecycle.js';

export function StabilityObserver({ lifecycle }: { lifecycle: WebglLifecycleController }) {
  const stability = useRef({ version: lifecycle.getRecoveryVersion(), cleanFrames: 0 });

  useFrame(({ gl, scene, camera }) => {
    const progress = stability.current;
    if (progress.version !== lifecycle.getRecoveryVersion()) {
      progress.version = lifecycle.getRecoveryVersion();
      progress.cleanFrames = 0;
    }
    const status = lifecycle.getStatus();
    if (!lifecycle.isCurrentCanvas(gl.domElement) || (status !== 'ready' && status !== 'restoring')) {
      progress.cleanFrames = 0;
      return;
    }

    try {
      const context = gl.getContext();
      if (context.isContextLost()) {
        progress.cleanFrames = 0;
        return;
      }
      // Positive priority owns the render; checking before it would certify stale GPU work.
      gl.render(scene, camera);
      const error = context.getError();
      if (error !== context.NO_ERROR) {
        progress.cleanFrames = 0;
        lifecycle.triggerFallback('scene_error', new Error(`WebGL error: ${error}`));
        return;
      }
      if (progress.version !== lifecycle.getRecoveryVersion()) {
        progress.cleanFrames = 0;
        return;
      }
      if (progress.cleanFrames < 2) {
        progress.cleanFrames += 1;
        if (progress.cleanFrames === 2) lifecycle.markStable();
      }
    } catch (error) {
      progress.cleanFrames = 0;
      lifecycle.triggerFallback('scene_error', error);
    }
  }, 1);

  return null;
}
