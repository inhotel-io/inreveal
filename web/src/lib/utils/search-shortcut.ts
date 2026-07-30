import type { ShortcutOptions } from '$lib/actions/shortcut';

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** True when the element is, or sits inside, something the user can type into. */
export const isEditableTarget = (element: Element | null): boolean =>
  element !== null && element.closest(EDITABLE_SELECTOR) !== null;

/**
 * Descriptors binding `/` to the global search palette.
 *
 * Two of them, because `matchesShortcut` compares modifiers strictly
 * (`Boolean(shortcut.shift) === event.shiftKey`) and several common layouts
 * produce `/` with Shift held — QWERTZ and Spanish use Shift+7, AZERTY Shift+:.
 * A lone `{ key: '/' }` would be dead for all of them. There is no clash with
 * `?`, which arrives as `event.key === '?'` on US layouts.
 */
export const searchShortcuts = (open: () => void): ShortcutOptions[] => {
  const openUnlessEditing = () => {
    // `shouldIgnoreEvent` in @immich/ui only skips a fixed list of input types
    // (textarea, text, date, datetime-local, email, password), so `type="search"`
    // and `type="number"` fields would otherwise swallow a typed `/`.
    if (isEditableTarget(document.activeElement)) {
      return;
    }
    open();
  };

  return [
    { shortcut: { key: '/' }, onShortcut: openUnlessEditing },
    { shortcut: { key: '/', shift: true }, onShortcut: openUnlessEditing },
  ];
};
