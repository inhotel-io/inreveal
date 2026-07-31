import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ActionsHelpModal from './ActionsHelpModal.svelte';

// The six terminal actions ship with terse bulk-bar labels and no explanation of what they mean or what they
// do on apply — this modal is that explanation (docs/superpowers/specs/2026-07-13-face-cleanup-actions-help-modal-design.md).
// Rendered against the REAL en.json (like PersonPicker.spec.ts) rather than a key-echoing t() mock, so a
// missing or renamed i18n key fails the test instead of silently rendering the key.

// Drain bits-ui Modal's deferred body-scroll-lock cleanup before happy-dom tears down `document` (same
// convention as PersonPicker.spec.ts / AdvancedScanModal.spec.ts).
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
});

beforeAll(async () => {
  register('en', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en', initialLocale: 'en' });
  await waitLocale('en');
});

describe('ActionsHelpModal', () => {
  it('titles the modal and frames apply as the point of no return', () => {
    render(ActionsHelpModal, { props: { onClose: vi.fn() } });

    expect(screen.getByText('What do these actions do?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nothing changes until you press Apply. Every flagged face has to end in one of these six states — then this person leaves the cleanup queue for good.',
      ),
    ).toBeInTheDocument();
  });

  // The names are NOT re-declared by the modal — it reuses each button's own bulk-bar key, so a translated
  // heading can never drift from its translated button.
  it('names all six actions, reusing the bulk-bar labels', () => {
    render(ActionsHelpModal, { props: { onClose: vi.fn() } });

    for (const name of [
      'Move to owner',
      'Keep here',
      'Confirm & lock',
      'Move to person…',
      'Unknown person',
      'Not a face',
    ]) {
      expect(screen.getByTestId('help-actions')).toHaveTextContent(name);
    }
  });

  it('explains what each action means', () => {
    render(ActionsHelpModal, { props: { onClose: vi.fn() } });

    expect(screen.getByText(/the default for every flagged face/)).toBeInTheDocument();
    expect(screen.getByText(/the scan got it wrong/)).toBeInTheDocument();
    expect(screen.getByText(/permanent and owner-agnostic/)).toBeInTheDocument();
    expect(screen.getByText(/instead of the one the scan suggested/)).toBeInTheDocument();
    expect(screen.getByText(/a poster, a statue, a reflection/)).toBeInTheDocument();
    // The case that made the review unfinishable: a real face the admin simply cannot name.
    expect(screen.getByText(/you don't know whose it is/)).toBeInTheDocument();
  });

  // The distinctions the current UI never surfaces: a decline only silences THIS suspected owner (hence lock),
  // and detach strips the identity link rather than just unassigning. Both are asserted against the copy.
  it('explains what each action does on apply, including the stay-vs-lock durability difference', () => {
    render(ActionsHelpModal, { props: { onClose: vi.fn() } });

    const effects = screen.getAllByTestId('help-effect');
    expect(effects).toHaveLength(6);
    for (const effect of effects) {
      expect(effect).toHaveTextContent('On apply:');
    }

    expect(screen.getByText(/joins the suspected owner/)).toBeInTheDocument();
    expect(
      screen.getByText(/If a later scan suspects a different person, the face can be flagged again/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no future scan can flag it again, no matter who it comes to resemble/),
    ).toBeInTheDocument();
    expect(screen.getByText(/the next scan can flag the face again/)).toBeInTheDocument();
    expect(screen.getByText(/its identity link is stripped/)).toBeInTheDocument();
    // Unknown parks the face in a cluster of its own, so it can be named later rather than lost.
    expect(screen.getByText(/move into a new unnamed cluster of their own/)).toBeInTheDocument();
  });

  // The two are one keystroke apart in the bulk bar and mean opposite things: "Not a face" retires the crop from
  // recognition for good, "Unknown person" keeps it nameable. The detach copy has to say so, or an admin reaching
  // for the only unassign-shaped action will quietly destroy a real person's faces.
  it('warns that Not a face retires the crop rather than returning it to the pool, and points at Unknown person', () => {
    render(ActionsHelpModal, { props: { onClose: vi.fn() } });

    expect(screen.getByText(/Use Unknown person instead if it IS a real face/)).toBeInTheDocument();
    expect(screen.getByText(/gone from face recognition, not returned to the pool/)).toBeInTheDocument();
  });

  it('tells the admin the resolutions are undoable and that an emptied unnamed person is removed', () => {
    render(ActionsHelpModal, { props: { onClose: vi.fn() } });

    expect(screen.getByTestId('help-footer')).toHaveTextContent(
      'Declines and locks can be undone from the Resolutions page. If moving or detaching leaves an unnamed person with no faces at all, that empty person is removed.',
    );
  });

  it('closes on the close button', async () => {
    const onClose = vi.fn();
    render(ActionsHelpModal, { props: { onClose } });

    await fireEvent.click(screen.getByTestId('help-close'));

    expect(onClose).toHaveBeenCalled();
  });
});
