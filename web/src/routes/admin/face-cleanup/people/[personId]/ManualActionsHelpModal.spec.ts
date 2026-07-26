import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ManualActionsHelpModal from './ManualActionsHelpModal.svelte';
import { MANUAL_STATE_COLOR, MANUAL_STATE_ICON } from './manual-review.svelte';

// Manual's OWN help modal (design §6.4: "manual's action set is different (no owner, no stay; plus keep and
// Unmark), so it gets its own modal"; Slice 10 plan Part B). Guided's ActionsHelpModal.spec.ts asserts its
// component NAMES ALL SIX of guided's actions and is load-bearing — left untouched. This is manual's parallel,
// scoped to manual's own five buttons plus the implicit `keep` default.
//
// Rendered against the REAL en.json (same convention as ActionsHelpModal.spec.ts and PersonPicker.spec.ts)
// rather than a key-echoing t() mock, so a missing or misspelled i18n key fails the test instead of silently
// rendering the raw key.

// Drain bits-ui Modal's deferred body-scroll-lock cleanup before happy-dom tears down `document` (same
// convention as ActionsHelpModal.spec.ts / PersonPicker.spec.ts / AdvancedScanModal.spec.ts).
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
});

beforeAll(async () => {
  register('en', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en', initialLocale: 'en' });
  await waitLocale('en');
});

describe('ManualActionsHelpModal', () => {
  it('titles the modal the same question guided asks', () => {
    render(ManualActionsHelpModal, { props: { onClose: vi.fn() } });

    expect(screen.getByText('What do these actions do?')).toBeInTheDocument();
  });

  // ---- names exactly this mode's six actions (Keep is a default, not a button, but is still named) ----
  it('names exactly this mode’s six actions: Keep (default), Move to…, Lock, Unknown, Not a face, Unmark', () => {
    render(ManualActionsHelpModal, { props: { onClose: vi.fn() } });

    const actions = screen.getByTestId('manual-help-actions');
    expect(actions).toHaveTextContent('Keep');
    // "(default)" — Keep has no button of its own; the modal is the only place this label is spelled out.
    expect(screen.getByTestId('manual-help-keep-default')).toHaveTextContent('default');
    expect(actions).toHaveTextContent('Move to…');
    expect(actions).toHaveTextContent('Lock');
    expect(actions).toHaveTextContent('Unknown');
    expect(actions).toHaveTextContent('Not a face');
    expect(actions).toHaveTextContent('Unmark');

    // Exactly six rows — no `owner`/`stay` (guided-only, both require a suspected owner manual doesn't have).
    expect(actions.querySelectorAll('[data-testid^="manual-help-row-"]')).toHaveLength(6);
    expect(screen.queryByText('→ Owner')).not.toBeInTheDocument();
    expect(screen.queryByText('Keep here')).not.toBeInTheDocument();
  });

  // ---- Keep writes nothing — the single most confusing thing coming from guided, where every face is
  //      always stamped with one of six outcomes ----
  it('explains that Keep writes nothing, unlike guided where every face is always stamped', () => {
    render(ManualActionsHelpModal, { props: { onClose: vi.fn() } });

    expect(screen.getByText(/Unlike guided review, most faces here are expected to stay Keep/)).toBeInTheDocument();
    expect(screen.getByText(/you never have to select it/)).toBeInTheDocument();

    const keepRow = screen.getByTestId('manual-help-row-keep');
    const keepEffect = within(keepRow).getByTestId('help-effect');
    expect(keepEffect).toHaveTextContent('On apply:');
    expect(keepEffect).toHaveTextContent(/nothing\. A kept face is never included in the Apply request/);
  });

  // ---- Not a face is the irreversible one, and sits beside Unknown, which means the opposite ----
  it('warns Not a face is irreversible and points at Unknown as the opposite case', () => {
    render(ManualActionsHelpModal, { props: { onClose: vi.fn() } });

    const detachRow = screen.getByTestId('manual-help-row-detach');
    expect(within(detachRow).getByText(/a poster, a statue, a reflection/)).toBeInTheDocument();
    expect(within(detachRow).getByText(/gone from face recognition, not returned to the pool/)).toBeInTheDocument();
    expect(within(detachRow).getByText(/Use Unknown person instead if it IS a real face/)).toBeInTheDocument();

    const unknownRow = screen.getByTestId('manual-help-row-unknown');
    expect(within(unknownRow).getByText(/you don't know whose it is/)).toBeInTheDocument();
  });

  // ---- each action's swatch matches the tile's STATE_COLOR/STATE_ICON (guided's own stated rationale for
  //      the modal, kept true here: an explanation ties back to the button AND the tile it describes) ----
  it.each([
    ['move', MANUAL_STATE_COLOR.move, MANUAL_STATE_ICON.move],
    ['lock', MANUAL_STATE_COLOR.lock, MANUAL_STATE_ICON.lock],
    ['unknown', MANUAL_STATE_COLOR.unknown, MANUAL_STATE_ICON.unknown],
    ['detach', MANUAL_STATE_COLOR.detach, MANUAL_STATE_ICON.detach],
  ] as const)('%s renders a swatch and icon matching MANUAL_STATE_COLOR/MANUAL_STATE_ICON', (state, color, _) => {
    render(ManualActionsHelpModal, { props: { onClose: vi.fn() } });

    const row = screen.getByTestId(`manual-help-row-${state}`);
    const swatch = within(row).getByTestId('manual-help-swatch');
    expect(swatch).toHaveAttribute('style', expect.stringContaining(color));
    expect(within(row).queryByTestId('manual-help-no-swatch')).not.toBeInTheDocument();
  });

  // ---- `keep` shows NO colour swatch — signalled by absence, exactly like the tile carries no badge/ribbon
  //      (§6.4) — and `unmark` (which only ever returns a face to that same uncoloured `keep` state) matches ----
  it.each(['keep', 'unmark'] as const)('%s shows NO colour swatch — signalled by absence, like the tile', (state) => {
    render(ManualActionsHelpModal, { props: { onClose: vi.fn() } });

    const row = screen.getByTestId(`manual-help-row-${state}`);
    expect(within(row).queryByTestId('manual-help-swatch')).not.toBeInTheDocument();
    expect(within(row).getByTestId('manual-help-no-swatch')).toBeInTheDocument();
  });

  it('every action explains its effect on apply', () => {
    render(ManualActionsHelpModal, { props: { onClose: vi.fn() } });

    const effects = screen.getAllByTestId('help-effect');
    expect(effects).toHaveLength(6);
    for (const effect of effects) {
      expect(effect).toHaveTextContent('On apply:');
    }
  });

  it('tells the admin locks are undoable and an emptied unnamed person is removed', () => {
    render(ManualActionsHelpModal, { props: { onClose: vi.fn() } });

    expect(screen.getByTestId('help-footer')).toHaveTextContent(
      'Locks can be undone from the Resolutions page. If moving or detaching leaves an unnamed person with no faces at all, that empty person is removed.',
    );
  });

  it('closes on the close button', async () => {
    const onClose = vi.fn();
    render(ManualActionsHelpModal, { props: { onClose } });

    await fireEvent.click(screen.getByTestId('help-close'));

    expect(onClose).toHaveBeenCalled();
  });
});
