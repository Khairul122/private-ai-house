import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OfficeErrorBoundary } from './OfficeErrorBoundary.js';

describe('OfficeErrorBoundary', () => {
  it('renders children when no error has occurred', () => {
    const html = renderToStaticMarkup(
      <OfficeErrorBoundary>
        <div>Normal 3D Scene Running</div>
      </OfficeErrorBoundary>
    );

    expect(html).toContain('Normal 3D Scene Running');
  });

  it('updates state via getDerivedStateFromError', () => {
    const error = new Error('WebGL context crashed');
    const state = OfficeErrorBoundary.getDerivedStateFromError(error);

    expect(state.hasError).toBe(true);
    expect(state.error).toBe(error);
  });

  it('calls onError callback in componentDidCatch', () => {
    const onError = vi.fn();
    const boundary = new OfficeErrorBoundary({ children: <div>child</div>, onError });

    const error = new Error('Test crash');
    const info = { componentStack: 'at VisualOffice' };
    boundary.componentDidCatch(error, info);

    expect(onError).toHaveBeenCalledWith(error, info);
  });

  it('renders custom fallback when state hasError is true', () => {
    const fallback = vi.fn((err: Error, reset: () => void) => (
      <div className="custom-fallback">
        <span>Fallback for {err.message}</span>
        <button type="button" onClick={reset}>Reset</button>
      </div>
    ));

    const boundary = new OfficeErrorBoundary({
      children: <div>child</div>,
      fallback,
    });
    const error = new Error('Pipeline shader error');
    boundary.state = { hasError: true, error };

    const rendered = boundary.render();
    const html = renderToStaticMarkup(rendered as React.ReactElement);

    expect(html).toContain('Fallback for Pipeline shader error');
    expect(fallback).toHaveBeenCalledWith(error, expect.any(Function));
  });

  it('resets error state when reset is called', () => {
    const boundary = new OfficeErrorBoundary({ children: <div>child</div> });
    boundary.state = { hasError: true, error: new Error('Error') };
    const setState = vi.fn();
    boundary.setState = setState as unknown as typeof boundary.setState;

    boundary.reset();

    expect(setState).toHaveBeenCalledWith({ hasError: false, error: null });
  });

  it('renders default fallback markup when no custom fallback is provided and an error is set', () => {
    const boundary = new OfficeErrorBoundary({ children: <div>child</div> });
    const error = new Error('Generic 3D crash');
    boundary.state = { hasError: true, error };

    const rendered = boundary.render();
    const html = renderToStaticMarkup(rendered as React.ReactElement);

    expect(html).toContain('Terjadi kendala pada tampilan visual kantor');
    expect(html).toContain('Generic 3D crash');
  });
});
