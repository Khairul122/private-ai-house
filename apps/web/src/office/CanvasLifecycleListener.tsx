import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { bindCanvasGestureIsolation, type GestureTracker } from '../state/office-interaction.js';
import type { WebglLifecycleController } from './webgl-lifecycle.js';

export function CanvasLifecycleListener({ lifecycle, tracker }: {
  lifecycle: WebglLifecycleController;
  tracker: GestureTracker;
}) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const detach = lifecycle.attachToCanvas(gl.domElement);
    const unbindGestures = bindCanvasGestureIsolation(gl.domElement, tracker);
    return () => {
      detach();
      unbindGestures();
      // R3F owns renderer and scene disposal; only release our listeners and tracker here.
    };
  }, [gl, lifecycle, tracker]);
  return null;
}
