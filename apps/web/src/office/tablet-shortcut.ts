export function isTabletShortcut(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'repeat' | 'isComposing' | 'defaultPrevented'>, onOfficeSurface: boolean) {
  return onOfficeSurface && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')
    && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
    && !event.repeat && !event.isComposing && !event.defaultPrevented;
}

export interface FocusTrapTarget {
  focus: () => void;
}

export interface FocusTrapOptions<T extends FocusTrapTarget = FocusTrapTarget> {
  items: T[];
  heading?: T | null;
  activeElement: T | null;
  contains: (el: T | null) => boolean;
}

export function handleDrawerFocusTrap<T extends FocusTrapTarget>(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>,
  options: FocusTrapOptions<T>
): void {
  if (event.key !== 'Tab') return;
  const { items, heading, activeElement, contains } = options;
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) {
    event.preventDefault();
    heading?.focus();
    return;
  }
  if (!activeElement || !contains(activeElement)) {
    event.preventDefault();
    first.focus();
    return;
  }
  if (heading && activeElement === heading) {
    event.preventDefault();
    if (event.shiftKey) {
      last.focus();
    } else {
      first.focus();
    }
    return;
  }
  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
