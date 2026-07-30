import type { PersonFaceSuggestionPageResponseDto, PersonResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PersonSuggestionReviewModal from '$lib/modals/PersonSuggestionReviewModal.svelte';
import { handleError } from '$lib/utils/handle-error';

vi.mock('svelte-i18n', () => ({
  t: { subscribe: (run: (f: (k: string) => string) => void) => (run((k) => k), () => {}) },
}));

vi.mock('$lib/utils/handle-error', () => ({ handleError: vi.fn() }));

// The server's documented already-resolved outcome for confirm/reject/ignore is a 400 (requireAccess
// precedence on a CASCADE-deleted face/person — see person.service.ts confirmFaceSuggestion). The modal reads
// `.status` off the caught error the same way the rest of this codebase already does (page.svelte's 409
// checks), so a plain `{ status }`-augmented Error is enough to model it — no @immich/sdk mock needed.
const benignAlreadyResolvedError = () => Object.assign(new Error('Not found or no access'), { status: 400 });
const serverError = () => Object.assign(new Error('Internal Server Error'), { status: 500 });

const person = { id: 'p1', name: 'Alice', updatedAt: '2026-01-01T00:00:00.000Z' } as PersonResponseDto;

function item(id: string) {
  return {
    assetFaceId: id,
    assetId: `asset-${id}`,
    distance: 0.6,
    imageWidth: 100,
    imageHeight: 100,
    boundingBoxX1: 10,
    boundingBoxX2: 40,
    boundingBoxY1: 10,
    boundingBoxY2: 40,
  };
}
const page1: PersonFaceSuggestionPageResponseDto = { total: 2, items: [item('f1'), item('f2')] };

function setup(
  overrides: Partial<{
    loadPage: ReturnType<typeof vi.fn>;
    confirm: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
    ignore: ReturnType<typeof vi.fn>;
    onClose: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const props = {
    person,
    referenceThumbnailUrl: '/api/people/p1/thumbnail',
    loadPage: overrides.loadPage ?? vi.fn().mockResolvedValue(page1),
    confirm: overrides.confirm ?? vi.fn().mockResolvedValue(undefined),
    dismiss: overrides.dismiss ?? vi.fn().mockResolvedValue(undefined),
    ignore: overrides.ignore ?? vi.fn().mockResolvedValue(undefined),
    onClose: overrides.onClose ?? vi.fn(),
  };
  render(PersonSuggestionReviewModal, { props });
  return props;
}

describe('PersonSuggestionReviewModal', () => {
  beforeEach(() => {
    vi.mocked(handleError).mockClear();
  });

  // bits-ui's body-scroll-lock schedules `resetBodyStyle` on a 24ms `window.setTimeout` when a modal unmounts
  // (`body-scroll-lock.svelte.js`, the same-tick destroy/create guard). That callback touches `document.body`,
  // so if it is still pending when vitest tears the environment down it throws an UNHANDLED
  // `ReferenceError: document is not defined` — which fails the whole job even with every test passing.
  //
  // Unmounting EXPLICITLY here is the load-bearing part. @testing-library/svelte registers its auto-cleanup
  // afterEach at import time, so it runs AFTER this hook — meaning a bare sleep here waits BEFORE the unmount
  // that schedules the timer, and drains nothing. It only ever passed by winning a race, and lost that race
  // once this file's scheduling shifted. cleanup() forces the unmount first, then we outwait the 24ms.
  afterEach(async () => {
    cleanup();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('loads page 1 and shows the first candidate + reference + counter', async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByTestId('suggestion-progress')).toHaveTextContent('face_suggestion_progress'),
    );
    expect(screen.getByTestId('suggestion-full-photo')).toBeInTheDocument();
    // Before the full photo has loaded (happy-dom never fires `onload` on its own — nothing here dispatches
    // it), only the placeholder renders. The REAL overlay (`suggestion-highlight`) and its computed geometry
    // are covered by the dedicated test below, once `load` is dispatched explicitly.
    expect(screen.getByTestId('suggestion-highlight-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('suggestion-highlight')).not.toBeInTheDocument();
    // reference image uses getPeopleThumbnailUrl output, NOT an asset media url
    const ref = screen.getByTestId('suggestion-reference') as HTMLImageElement;
    expect(ref.getAttribute('src')).toContain('/api/people/p1/thumbnail');
  });

  it('renders the real highlight overlay (not the placeholder) with geometry computed from the loaded photo', async () => {
    setup();
    await waitFor(() => screen.getByTestId('suggestion-full-photo'));
    const img = screen.getByTestId('suggestion-full-photo') as HTMLImageElement;

    // A 1000x500 natural image rendered into a 400x300 box: scaleToFit picks the narrower-fitting axis
    // (400/1000 = 0.4 vs 300/500 = 0.6, so 0.4 wins), so the photo is horizontally full-bleed (400 wide) and
    // letterboxed top/bottom (200 tall, centered with a 50px offset on each side). happy-dom has no layout
    // engine, so both the "client" size and the "natural" size have to be stubbed explicitly — width/height
    // reflect content attributes (settable directly); naturalWidth/naturalHeight have no public setter.
    img.width = 400;
    img.height = 300;
    Object.defineProperty(img, 'naturalWidth', { value: 1000, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 500, configurable: true });

    await fireEvent.load(img);

    await waitFor(() => expect(screen.getByTestId('suggestion-highlight')).toBeInTheDocument());
    expect(screen.queryByTestId('suggestion-highlight-placeholder')).not.toBeInTheDocument();

    // f1's box is (10,10)-(40,40) in a 100x100 metadata space, i.e. normalized 0.1..0.4 on both axes.
    // Expected pixel geometry, worked out independently of the component's own arithmetic:
    //   contentWidth = 1000 * 0.4 = 400, contentHeight = 500 * 0.4 = 200
    //   offsetX = (400 - 400) / 2 = 0,    offsetY = (300 - 200) / 2 = 50
    //   left = 0.1 * 400 + 0 = 40,   top    = 0.1 * 200 + 50 = 70
    //   width = 0.4 * 400 - 40 = 120, height = 0.4 * 200 + 50 - 70 = 60
    const overlay = screen.getByTestId('suggestion-highlight');
    expect(overlay.style.left).toBe('40px');
    expect(overlay.style.top).toBe('70px');
    expect(overlay.style.width).toBe('120px');
    expect(overlay.style.height).toBe('60px');
  });

  it('Same person calls confirm then advances; last item closes with confirmed count', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    setup({ confirm, onClose });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));

    await userEvent.click(screen.getByTestId('suggestion-same-btn'));
    expect(confirm).toHaveBeenCalledWith('f1');
    await userEvent.click(screen.getByTestId('suggestion-same-btn'));
    expect(confirm).toHaveBeenCalledWith('f2');

    await waitFor(() => expect(onClose).toHaveBeenCalledWith({ confirmed: 2 }));
  });

  it('Different person calls dismiss and advances', async () => {
    const dismiss = vi.fn().mockResolvedValue(undefined);
    setup({ dismiss });
    await waitFor(() => screen.getByTestId('suggestion-different-btn'));
    await userEvent.click(screen.getByTestId('suggestion-different-btn'));
    expect(dismiss).toHaveBeenCalledWith('f1');
  });

  it('Ignore face calls ignore and advances without counting a confirmation', async () => {
    const ignore = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    setup({ ignore, onClose });
    await waitFor(() => screen.getByTestId('suggestion-ignore-btn'));

    await userEvent.click(screen.getByTestId('suggestion-ignore-btn'));
    expect(ignore).toHaveBeenCalledWith('f1');
    await userEvent.click(screen.getByTestId('suggestion-ignore-btn'));

    await waitFor(() => expect(onClose).toHaveBeenCalledWith({ confirmed: 0 }));
  });

  it('Next then Prev step the queue WITHOUT confirm/dismiss; Prev disabled at start', async () => {
    const confirm = vi.fn();
    const dismiss = vi.fn();
    setup({ confirm, dismiss });
    await waitFor(() => screen.getByTestId('suggestion-progress'));

    // at index 0 → Prev disabled
    expect(screen.getByTestId('suggestion-prev-btn')).toBeDisabled();

    await userEvent.click(screen.getByTestId('suggestion-next-btn'));
    expect(screen.getByTestId('suggestion-progress').dataset.current).toBe('2'); // moved to 2 of 2
    await userEvent.click(screen.getByTestId('suggestion-prev-btn'));
    expect(screen.getByTestId('suggestion-progress').dataset.current).toBe('1');

    expect(confirm).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('keyboard: ArrowRight confirms, ArrowLeft dismisses, ArrowDown ignores', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    const dismiss = vi.fn().mockResolvedValue(undefined);
    const ignore = vi.fn().mockResolvedValue(undefined);
    setup({ confirm, dismiss, ignore });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.keyboard('{ArrowRight}'); // f1 → confirm
    expect(confirm).toHaveBeenCalledWith('f1');
    await userEvent.keyboard('{ArrowDown}'); // f2 → ignore
    expect(ignore).toHaveBeenCalledWith('f2');
  });

  it('keyboard: ArrowLeft dismisses', async () => {
    const dismiss = vi.fn().mockResolvedValue(undefined);
    setup({ dismiss });
    await waitFor(() => screen.getByTestId('suggestion-different-btn'));
    await userEvent.keyboard('{ArrowLeft}'); // f1 → dismiss
    expect(dismiss).toHaveBeenCalledWith('f1');
  });

  // edges 9/10/11: a stale row (already resolved server-side — e.g. a concurrent scan/auto-assign, or the
  // face's CASCADE-deleted precedence check) 400s. That is the ONE documented benign-advance outcome — see
  // person.service.ts confirmFaceSuggestion's `claimed === 0` / requireAccess comments.
  it('a stale item (confirm 400s — edges 9/10/11) still advances silently', async () => {
    const confirm = vi.fn().mockRejectedValue(benignAlreadyResolvedError());
    const onClose = vi.fn();
    setup({ confirm, onClose });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.click(screen.getByTestId('suggestion-same-btn')); // f1 already resolved
    await userEvent.click(screen.getByTestId('suggestion-same-btn')); // f2
    await waitFor(() => expect(onClose).toHaveBeenCalledWith({ confirmed: 0 }));
    expect(handleError).not.toHaveBeenCalled();
  });

  it('a stale item (dismiss 400s — edges 9/10/11) still advances silently (symmetry)', async () => {
    const dismiss = vi.fn().mockRejectedValue(benignAlreadyResolvedError());
    const onClose = vi.fn();
    setup({ dismiss, onClose });
    await waitFor(() => screen.getByTestId('suggestion-different-btn'));
    await userEvent.click(screen.getByTestId('suggestion-different-btn')); // f1 already resolved
    await userEvent.click(screen.getByTestId('suggestion-different-btn')); // f2
    await waitFor(() => expect(onClose).toHaveBeenCalledWith({ confirmed: 0 }));
    expect(handleError).not.toHaveBeenCalled();
  });

  it('a stale item (ignore 400s — edges 9/10/11) still advances silently (symmetry)', async () => {
    const ignore = vi.fn().mockRejectedValue(benignAlreadyResolvedError());
    const onClose = vi.fn();
    setup({ ignore, onClose });
    await waitFor(() => screen.getByTestId('suggestion-ignore-btn'));
    await userEvent.click(screen.getByTestId('suggestion-ignore-btn')); // f1 already resolved
    await userEvent.click(screen.getByTestId('suggestion-ignore-btn')); // f2
    await waitFor(() => expect(onClose).toHaveBeenCalledWith({ confirmed: 0 }));
    expect(handleError).not.toHaveBeenCalled();
  });

  it('closes immediately with confirmed:0 when the first page is empty', async () => {
    const onClose = vi.fn();
    setup({ loadPage: vi.fn().mockResolvedValue({ total: 0, items: [] }), onClose });
    await waitFor(() => expect(onClose).toHaveBeenCalledWith({ confirmed: 0 }));
  });

  // D8: the server drains a face's row the moment it's acted on, so a fixed-offset "page 2" walks a moving
  // target and silently drops whatever shifted out from under it. The only stable cursor is the HEAD of the
  // list — every refetch re-reads page 1, and newly-seen rows are appended (not a wholesale replace, so the
  // buffer the user is currently stepping through never reorders or drops what they haven't acted on yet).
  it('re-fetches page 1 (not page 2) as the queue nears its end, and appends only genuinely-new rows', async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({ total: 4, items: [item('f1'), item('f2'), item('f3')] })
      .mockResolvedValueOnce({ total: 4, items: [item('f1'), item('f2'), item('f3'), item('f4')] });
    setup({ loadPage });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.click(screen.getByTestId('suggestion-same-btn')); // advance to index 1 (within PREFETCH of end)
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(2));
    expect(loadPage).toHaveBeenLastCalledWith({ page: 1, size: 50 });

    // f4 was appended (not lost) even though the second response repeated f1-f3.
    await userEvent.click(screen.getByTestId('suggestion-next-btn'));
    await userEvent.click(screen.getByTestId('suggestion-next-btn'));
    expect(screen.getByTestId('suggestion-progress').dataset.current).toBe('4');
  });

  it('a top-up fetch failure once the buffer is exhausted surfaces via handleError and does NOT close', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    // onMount's fetch succeeds (2 items); every top-up refetch triggered by advance() thereafter rejects.
    const loadPage = vi.fn().mockResolvedValueOnce(page1).mockRejectedValue(new Error('network blip'));
    setup({ loadPage, confirm, onClose });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));

    // confirm f1 -> advance to f2. This also triggers a top-up (PREFETCH > buffer size) that fails, but the
    // buffer still has a valid next item (f2), so that failure is swallowed silently, same as before.
    await userEvent.click(screen.getByTestId('suggestion-same-btn'));
    await waitFor(() => expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '2'));
    expect(handleError).not.toHaveBeenCalled();

    // confirm f2 -> buffer is now exhausted; the top-up fetch fails too. Must NOT report a false "complete".
    await userEvent.click(screen.getByTestId('suggestion-same-btn'));
    await waitFor(() => expect(handleError).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    // left on the last valid item, not out-of-bounds
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '2');
  });

  it('shows every face exactly once across a shrinking server list and closes only on an empty fresh fetch', async () => {
    // Models the server draining acted rows: loadPage always returns the next unacted rows off a shared
    // `remaining` queue (regardless of the `page` argument — head-refetch semantics), and `confirm` drains
    // the confirmed id from that queue, same as the server would.
    const TOTAL = 120;
    let remaining = Array.from({ length: TOTAL }, (_, i) => `f${i}`);
    const confirm = vi.fn((id: string) => {
      remaining = remaining.filter((x) => x !== id);
      return Promise.resolve();
    });
    const loadPage = vi.fn(({ size }: { page: number; size: number }) =>
      Promise.resolve({
        total: remaining.length,
        items: remaining.slice(0, size).map((id) => item(id)),
      }),
    );
    const onClose = vi.fn();
    setup({ loadPage, confirm, onClose });

    await waitFor(() => screen.getByTestId('suggestion-same-btn'));

    for (let i = 0; i < TOTAL; i++) {
      // D8 counter-denominator regression: the server's `total` SHRINKS as rows drain server-side while the
      // numerator (`index + 1`) walks the append-only `items` buffer and only grows. Rendering the raw
      // server `total` as the denominator lets the numerator overtake it mid-session (e.g. "74 of 73"). The
      // displayed denominator must stay >= the numerator at every step (waitFor rides out the in-flight
      // top-up refetch settling between clicks).
      await waitFor(() => {
        const progress = screen.getByTestId('suggestion-progress');
        expect(Number(progress.dataset.total)).toBeGreaterThanOrEqual(Number(progress.dataset.current));
      });
      await userEvent.click(screen.getByTestId('suggestion-same-btn'));
    }

    await waitFor(() => expect(onClose).toHaveBeenCalledWith({ confirmed: TOTAL }));
    expect(onClose).toHaveBeenCalledTimes(1);
    const confirmedIds = confirm.mock.calls.map(([id]: [string]) => id);
    expect(confirmedIds).toHaveLength(TOTAL); // every face acted on exactly once — no repeats, none skipped
    expect(new Set(confirmedIds).size).toBe(TOTAL);
    expect(remaining).toHaveLength(0);
  });

  it('surfaces a 500 from an action via handleError, does NOT mark the row acted, and allows retry', async () => {
    const confirm = vi.fn().mockRejectedValueOnce(serverError()).mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    setup({ confirm, onClose });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));

    await userEvent.click(screen.getByTestId('suggestion-same-btn')); // f1 500s
    await waitFor(() => expect(handleError).toHaveBeenCalledTimes(1));
    // still on f1: not marked acted, not advanced
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '1');
    expect(screen.getByTestId('suggestion-same-btn')).not.toBeDisabled(); // busy cleared — retry is possible

    await userEvent.click(screen.getByTestId('suggestion-same-btn')); // retry succeeds
    expect(confirm).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '2'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('advances silently on the benign already-resolved error (no handleError toast)', async () => {
    const confirm = vi.fn().mockRejectedValueOnce(benignAlreadyResolvedError()).mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    setup({ confirm, onClose });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));

    await userEvent.click(screen.getByTestId('suggestion-same-btn')); // f1 already resolved -> advance silently
    await waitFor(() => expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '2'));
    expect(handleError).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('suggestion-same-btn')); // f2 confirms for real
    // Only the real confirm counts — the benign-skip on f1 must not inflate the confirmed count.
    await waitFor(() => expect(onClose).toHaveBeenCalledWith({ confirmed: 1 }));
  });

  it('marks acted rows read-only on back-navigation (no re-invocation of confirm/dismiss/ignore)', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    setup({ confirm });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));

    await userEvent.click(screen.getByTestId('suggestion-same-btn')); // confirm f1, advance to f2
    await waitFor(() => expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '2'));

    await userEvent.click(screen.getByTestId('suggestion-prev-btn')); // back to f1 (already acted)
    await waitFor(() => expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '1'));

    expect(screen.getByTestId('suggestion-same-btn')).toBeDisabled();
    expect(screen.getByTestId('suggestion-different-btn')).toBeDisabled();
    expect(screen.getByTestId('suggestion-ignore-btn')).toBeDisabled();
    expect(screen.getByTestId('suggestion-reviewed-badge')).toBeInTheDocument();

    // Bypass the disabled DOM attribute entirely — this exercises act()'s own internal guard, not just the
    // button's `disabled`.
    await userEvent.keyboard('{ArrowRight}');
    expect(confirm).toHaveBeenCalledTimes(1); // still just the original confirm, no re-invocation
  });

  // happy-dom has no layout engine, so this pins the STRUCTURE that makes the footer reflow, not the reflow
  // itself: the verdict buttons must be free to stack full-width below `sm` and only line up as a row from `sm`
  // up. Without it the row is a single non-wrapping line and the modal's `overflow-hidden` Card clips the
  // primary "Same person" button off-screen on a phone. The layout itself is asserted for real, at a 390px
  // viewport, in e2e/src/specs/web/person-face-suggestions.e2e-spec.ts.
  it('lets the verdict buttons stack below sm and line up from sm up', async () => {
    setup();
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));

    for (const testId of ['suggestion-different-btn', 'suggestion-ignore-btn', 'suggestion-same-btn']) {
      expect(screen.getByTestId(testId), testId).toHaveClass('w-full', 'sm:w-auto');
    }

    const group = screen.getByTestId('suggestion-actions');
    expect(group).toHaveClass('flex-col', 'grow');
    expect(group).toHaveClass('sm:flex-row', 'sm:grow-0');
  });
});
