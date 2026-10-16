export type OwnerDirection = 'up' | 'down' | 'left' | 'right';
export type OwnerMoveInput = Record<OwnerDirection, boolean>;

export function createOwnerInput() {
  const sources = new Map<string, OwnerDirection>();
  let enabled = true;
  let active = true;
  let stopVersion = 0;
  return {
    get enabled() { return enabled && active; },
    get stopVersion() { return stopVersion; },
    press(source: string, direction: OwnerDirection) { if (enabled && active) sources.set(source, direction); },
    release(source: string) { sources.delete(source); },
    clear() { sources.clear(); },
    stop() { sources.clear(); stopVersion += 1; },
    setEnabled(value: boolean) { if (enabled !== value) { enabled = value; sources.clear(); stopVersion += 1; } },
    setActive(value: boolean) { if (active !== value) { active = value; sources.clear(); stopVersion += 1; } },
    read(): OwnerMoveInput {
      const input = { up: false, down: false, left: false, right: false };
      if (enabled && active) for (const direction of sources.values()) input[direction] = true;
      return input;
    },
  };
}

export type OwnerInput = ReturnType<typeof createOwnerInput>;

function directionFor(code: string): OwnerDirection | undefined {
  return ({ KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right', ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right' } as const)[code as 'KeyW'];
}

function ownsKeyboard(target: EventTarget | null) {
  return typeof Element !== 'undefined' && target instanceof Element
    && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="tablist"], [role="menu"], details[open]'));
}

export function bindOwnerKeyboard(input: OwnerInput, surface: EventTarget, document: EventTarget & { visibilityState: string }) {
  const onDown = (raw: Event) => {
    const event = raw as KeyboardEvent;
    if (event.key === 'Escape') { input.stop(); return; }
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || ownsKeyboard(event.target)) { input.clear(); return; }
    const direction = directionFor(event.code);
    if (!direction || !input.enabled) return;
    event.preventDefault();
    // A held key must be released before it can restart movement after Stop or blur.
    if (!event.repeat) input.press(`key:${event.code}`, direction);
  };
  const onUp = (event: Event) => input.release(`key:${(event as KeyboardEvent).code}`);
  const onBlur = () => input.setActive(false);
  const onFocus = () => input.setActive(document.visibilityState !== 'hidden');
  const onVisibility = () => { if (document.visibilityState === 'hidden') input.setActive(false); };
  const onFocusIn = (event: Event) => { if (ownsKeyboard(event.target)) input.clear(); };
  surface.addEventListener('keydown', onDown);
  surface.addEventListener('keyup', onUp);
  surface.addEventListener('blur', onBlur);
  surface.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('focusin', onFocusIn);
  return () => {
    surface.removeEventListener('keydown', onDown);
    surface.removeEventListener('keyup', onUp);
    surface.removeEventListener('blur', onBlur);
    surface.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('focusin', onFocusIn);
    input.stop();
  };
}
