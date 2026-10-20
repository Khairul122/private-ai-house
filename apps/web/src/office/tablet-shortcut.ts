export function isTabletShortcut(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'repeat' | 'isComposing' | 'defaultPrevented'>, onOfficeSurface: boolean) {
  return onOfficeSurface && event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
    && !event.repeat && !event.isComposing && !event.defaultPrevented;
}
