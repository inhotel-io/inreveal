import { cleanup, fireEvent, render } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { tick } from 'svelte';
import { getResizeObserverMock } from '$lib/__mocks__/resize-observer.mock';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import TagFilterRow from '../tag-filter-row.svelte';

const LONG_NAME = 'Events/2024/Italy Summer Trip Rome Colosseum And Vatican Museums';

/**
 * happy-dom reports 0 for both metrics, so overflow is simulated on the prototype — the action reads
 * them during mount, before a test could reach the individual element.
 *
 * Defining on HTMLElement.prototype only *shadows* happy-dom, which defines both as getters on
 * Element.prototype (verified in happy-dom's Element.d.ts). The afterEach delete therefore removes
 * only this shadow and restores happy-dom's own behaviour — it does not clobber it process-wide.
 */
function stubHeights(scrollHeight: number, clientHeight: number) {
  // One defineProperties call, not two defineProperty calls: eslint's
  // unicorn/prefer-object-define-properties is an ERROR here and CI runs bare `pnpm lint`.
  Object.defineProperties(HTMLElement.prototype, {
    scrollHeight: { configurable: true, get: () => scrollHeight },
    clientHeight: { configurable: true, get: () => clientHeight },
  });
}

type RowProps = {
  id: string;
  name: string;
  checked: boolean;
  dimmed?: boolean;
  onToggle: (id: string) => void;
};

function renderRow(props: Partial<RowProps> = {}) {
  const onToggle = props.onToggle ?? vi.fn();
  const componentProps: RowProps = {
    id: props.id ?? 't1',
    name: props.name ?? LONG_NAME,
    checked: props.checked ?? false,
    dimmed: props.dimmed,
    onToggle,
  };
  return {
    onToggle,
    ...render(TestWrapper as Component<{ component: Component<RowProps>; componentProps: RowProps }>, {
      props: { component: TagFilterRow as Component<RowProps>, componentProps },
    }),
  };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', getResizeObserverMock());
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  vi.unstubAllGlobals();
});

// R7 ("opens the tooltip immediately on keyboard focus") was removed: @immich/ui's shared
// TooltipProvider sets `ignoreNonKeyboardFocus`, so bits-ui only opens on focus when
// `:focus-visible` matches. @testing-library/dom's fireEvent.focus only dispatches a synthetic
// FocusEvent — it never calls the native `.focus()` method, so document.activeElement is never
// updated and `:focus-visible` never matches under happy-dom. Confirmed with a real `.focus()`
// call in isolation (matches `:focus-visible`) vs. fireEvent.focus (does not) — this is not
// fixable from the component side. Moved to manual verification (Task 4).
describe('TagFilterRow', () => {
  it('R1: renders the complete name in the DOM', () => {
    stubHeights(0, 0);
    const { getByTestId } = renderRow();
    expect(getByTestId('tags-item-t1').textContent).toContain(LONG_NAME);
  });

  it('R2: clamps the label rather than truncating it', () => {
    stubHeights(0, 0);
    const { getByTestId } = renderRow();
    const label = getByTestId('tags-item-t1').querySelector('span');
    expect(label?.className).toContain('line-clamp-2');
    expect(label?.className).not.toContain('truncate');
  });

  it('R3: keeps the e2e handle on the clickable element', async () => {
    stubHeights(0, 0);
    const { getByTestId, onToggle } = renderRow({ id: 't1' });
    await fireEvent.click(getByTestId('tags-item-t1'));
    expect(onToggle).toHaveBeenCalledWith('t1');
  });

  it('R4: attaches a tooltip when the label is clipped', async () => {
    stubHeights(100, 40);
    const { getByTestId } = renderRow();
    await tick();
    expect('tooltipTrigger' in getByTestId('tags-item-t1').dataset).toBe(true);
  });

  it('R5: attaches no tooltip when the label fits', async () => {
    stubHeights(40, 40);
    const { getByTestId } = renderRow();
    await tick();
    expect('tooltipTrigger' in getByTestId('tags-item-t1').dataset).toBe(false);
  });

  it('R6: opens the tooltip on non-touch hover after the 700ms delay', async () => {
    // Only timers — faking requestAnimationFrame too can stall bits-ui/floating-ui during mount.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      stubHeights(100, 40);
      const { getByTestId } = renderRow();
      await tick();
      const row = getByTestId('tags-item-t1');
      expect(row.dataset.state).toBe('closed');

      await fireEvent.pointerEnter(row, { pointerType: 'mouse' });
      vi.advanceTimersByTime(700);
      await tick();

      expect(row.dataset.state).not.toBe('closed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('R8: toggles selection when a clipped row is clicked, and the tooltip stays open', async () => {
    // Only timers — faking requestAnimationFrame too can stall bits-ui/floating-ui during mount.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      stubHeights(100, 40);
      const { getByTestId, onToggle } = renderRow({ id: 't7' });
      await tick();
      const row = getByTestId('tags-item-t7');

      // Open via the hover path proven in R6 — focus-open cannot be exercised under happy-dom
      // (see the note above the describe block explaining R7's removal).
      await fireEvent.pointerEnter(row, { pointerType: 'mouse' });
      vi.advanceTimersByTime(700);
      await tick();
      expect(row.dataset.state).not.toBe('closed');

      await fireEvent.click(row);
      await tick();

      expect(onToggle).toHaveBeenCalledWith('t7');
      // @immich/ui's shared TooltipProvider sets disableCloseOnTriggerClick app-wide, so bits-ui's
      // own onclick handler (which would otherwise close the tooltip) is a no-op here — staying
      // open is correct, not a regression. This proves the {...props} spread in tag-filter-row.svelte
      // still lets selection (onToggle) fire alongside bits-ui's own click handling.
      expect(row.dataset.state).not.toBe('closed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('R9: toggles when the row has no tooltip at all', async () => {
    stubHeights(40, 40);
    const { getByTestId, onToggle } = renderRow({ id: 't9' });
    await tick();

    await fireEvent.click(getByTestId('tags-item-t9'));

    expect(onToggle).toHaveBeenCalledWith('t9');
  });

  it('R10: renders the checked state', () => {
    stubHeights(0, 0);
    const { getByTestId } = renderRow({ checked: true });
    const row = getByTestId('tags-item-t1');
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(row.querySelector('svg')).toBeTruthy();
  });

  it('R11: renders the unchecked state', () => {
    stubHeights(0, 0);
    const { getByTestId } = renderRow({ checked: false });
    const row = getByTestId('tags-item-t1');
    expect(row.getAttribute('aria-pressed')).toBe('false');
    expect(row.querySelector('svg')).toBeNull();
  });

  it('R12: still reveals an unbreakable token that overflows two lines', async () => {
    stubHeights(100, 40);
    const { getByTestId } = renderRow({ name: 'A'.repeat(120) });
    await tick();
    expect('tooltipTrigger' in getByTestId('tags-item-t1').dataset).toBe(true);
  });

  it('R13: renders the dimmed variant', () => {
    stubHeights(0, 0);
    const { getByTestId } = renderRow({ checked: true, dimmed: true });
    const row = getByTestId('tags-item-t1');
    expect(row.className).toContain('opacity-50');
    expect(row.className).toContain('font-medium');
  });

  it('R14: allows mid-word breaks on the label', () => {
    stubHeights(0, 0);
    const { getByTestId } = renderRow();
    const label = getByTestId('tags-item-t1').querySelector('span');
    expect(label?.className).toContain('wrap-break-words');
  });

  // R15 ("describes the open tooltip with the full name") was removed after retrying with the
  // working R6/R8 hover path (not focus): the tooltip does open and its portal content does mount
  // with the correct full-name text (verified via a debug dump of document.body.innerHTML), but
  // bits-ui never threads the content's generated id through to the trigger's aria-describedby —
  // it stays an empty string under happy-dom regardless of extra tick()/microtask flushes. That is
  // the bits-ui/floating-ui-under-happy-dom limitation the brief pre-authorized a fallback for.
  // Moved to manual verification (Task 4): "the open tooltip's content shows the complete tag name".
});
