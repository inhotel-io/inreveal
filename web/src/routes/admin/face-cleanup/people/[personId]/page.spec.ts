import {
  getFaceRepairClusterFaces,
  getFaceRepairPersonMetadata,
  getLatestScan,
  type FaceRepairClusterFacesResponseDto,
  type FaceRepairPersonMetadataResponseDto,
} from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { createManualReviewModel, type ManualReviewModel } from './manual-review.svelte';

// Manual review page (Slice 8, design §6.4 of
// docs/superpowers/specs/2026-07-23-manual-face-review-mode-design.md). Route:
// /admin/face-cleanup/people/[personId]. Person name/ownerId/faceCount come from the slice 3 metadata
// endpoint (getFaceRepairPersonMetadata), fetched from the URL param — never navigation state — so a hard
// refresh or a deep link works. Faces come from getFaceRepairClusterFaces with excludeFaceIds: [] (scan-free).
// Covers plan Step 1's 12 cases (docs/superpowers/plans/2026-07-23-manual-face-review-slice-8.md).
//
// THE VISUAL INVERSION (§6.4): manual defaults every face to `keep`, which is signalled by ABSENCE — a keep
// tile carries no badge, no ribbon. Colour only appears once the admin has acted. Bulk-action UI that WRITES
// a mark lands in slice 9 — this slice renders the grid, selection, and paging only. To exercise "a marked
// tile renders its badge/ribbon" and "load more preserves marks" without that UI, the tests below reach the
// SAME model instance the page created (via a spy on createManualReviewModel that delegates to the real
// implementation) and mark faces directly through it — exactly the seam slice 9's bulk actions will use.

vi.mock('@immich/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@immich/sdk')>();
  return {
    ...actual,
    getFaceRepairPersonMetadata: vi.fn(),
    getFaceRepairClusterFaces: vi.fn(),
    getLatestScan: vi.fn(),
    getPeopleThumbnailPath: (id: string) => `/people/${id}/thumbnail`,
  };
});

vi.mock('@immich/ui', async (original) => {
  const mod = await original<typeof import('@immich/ui')>();
  const noop = await import('@test-data/mocks/noop-component.svelte');
  return {
    ...mod,
    Icon: noop.default,
  };
});

// Mock svelte-i18n: return the key as the translation (matches the sibling face-cleanup specs). Dynamic,
// server-sourced values (person name, owner id, loaded/total counts) are therefore rendered as PLAIN text in
// the template, never solely inside a $t(...) call — otherwise this mock would swallow them and nothing here
// could assert on them (matches the people browser's own `{displayName(person.name)}` / `{people.length} /
// {total}` convention).
vi.mock('svelte-i18n', async (orig) => {
  const actual = await orig<typeof import('svelte-i18n')>();
  return {
    ...actual,
    t: {
      subscribe: (run: (fn: (key: string, opts?: unknown) => string) => void) => {
        run((key: string) => key);
        return () => {};
      },
    },
  };
});

vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
  afterNavigate: vi.fn(),
  beforeNavigate: vi.fn(),
  onNavigate: vi.fn(),
}));

vi.mock('$app/stores', () => ({
  page: {
    subscribe: vi.fn((run) => {
      run({ url: new URL('http://localhost/admin/face-cleanup/people/person-1') });
      return () => {};
    }),
  },
  navigating: {
    subscribe: vi.fn((run) => {
      run(null);
      return () => {};
    }),
  },
  updated: {
    subscribe: vi.fn((run) => {
      run(false);
      return () => {};
    }),
  },
}));

vi.mock('$lib/components/layouts/AdminPageLayout.svelte', async () => {
  const { default: stub } = await import('@test-data/mocks/sidebar.stub.svelte');
  return { default: stub };
});

// Face crops must go through the admin-gated, join-free face-thumbnail route (the same helper the guided
// review page uses) — never the user-scoped /people/:id/thumbnail route, which 404s for people the admin
// does not own.
vi.mock('$lib/utils/people-utils', () => ({
  getAdminFaceThumbnailUrl: (assetFaceId: string) => `/api/admin/face-repair/faces/${assetFaceId}/thumbnail`,
}));

// Spy on the model factory, delegating to the REAL implementation, so tests can reach the exact instance the
// page created and drive it directly (mark faces, pre-seed a selection) without any bulk-action UI — that UI
// is slice 9's job. The model owns its list and is never re-created (§6.4/§6.5); this spy is what lets a test
// prove that invariant too.
vi.mock('./manual-review.svelte', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./manual-review.svelte')>();
  return {
    ...actual,
    createManualReviewModel: vi.fn((personId: string) => actual.createManualReviewModel(personId)),
  };
});

// ---- helpers ----

const PERSON_ID = 'person-1';
const OWNER_ID = 'owner-1';
const PAGE_SIZE = 48;

const makeMetadata = (
  over: Partial<FaceRepairPersonMetadataResponseDto> = {},
): FaceRepairPersonMetadataResponseDto => ({
  id: PERSON_ID,
  name: 'Jula',
  ownerId: OWNER_ID,
  faceCount: 3,
  thumbnailFaceId: null,
  ...over,
});

const face = (assetFaceId: string) => ({ assetFaceId });

const makeFacesResponse = (faces: { assetFaceId: string }[], total: number): FaceRepairClusterFacesResponseDto => ({
  faces,
  total,
  hasMore: faces.length < total,
});

const makePageData = (personId = PERSON_ID) => ({
  personId,
  meta: { title: 'Review person' },
});

// Retrieves the exact ManualReviewModel instance the page created (see the module mock above), so a test can
// stage marks/selection through the model's own API instead of through not-yet-built bulk-action buttons.
const getVm = (): ManualReviewModel => {
  const calls = vi.mocked(createManualReviewModel).mock.results;
  return calls.at(-1)!.value as ManualReviewModel;
};

describe('+page.svelte (manual face-review page)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFaceRepairPersonMetadata).mockResolvedValue(makeMetadata());
    vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(makeFacesResponse([face('f1'), face('f2'), face('f3')], 3));
    vi.mocked(getLatestScan).mockResolvedValue({} as unknown as object);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- 1. loads all cluster faces with no scan in existence ----
  it('loads every cluster face with excludeFaceIds: [] (scan-free) and renders one tile per face', async () => {
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(getFaceRepairClusterFaces).toHaveBeenCalledWith({
        personId: PERSON_ID,
        faceRepairClusterFacesRequestDto: { excludeFaceIds: [], page: 0, size: PAGE_SIZE },
      });
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('face-tile')).toHaveLength(3);
    });
  });

  // ---- 2. header shows person name, owner, and showing N of M ----
  it('header shows the person name, owner id, and a loaded/total count', async () => {
    vi.mocked(getFaceRepairPersonMetadata).mockResolvedValue(makeMetadata({ name: 'Jula', ownerId: OWNER_ID }));
    vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(makeFacesResponse([face('f1'), face('f2')], 5));

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByTestId('manual-review-heading')).toHaveTextContent('Jula');
    });
    expect(screen.getByTestId('manual-review-owner')).toHaveTextContent(OWNER_ID);
    expect(screen.getByTestId('manual-review-showing')).toHaveTextContent('2');
    expect(screen.getByTestId('manual-review-showing')).toHaveTextContent('5');
  });

  // ---- 3. unnamed person renders the fallback heading, never an empty title ----
  it('renders the fallback heading for an unnamed person instead of an empty title', async () => {
    vi.mocked(getFaceRepairPersonMetadata).mockResolvedValue(makeMetadata({ name: '' }));

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      const heading = screen.getByTestId('manual-review-heading');
      expect(heading.textContent?.trim()).not.toBe('');
      expect(heading).toHaveTextContent('admin.face_cleanup_unnamed');
    });
  });

  // ---- 4. hard refresh / deep link: metadata resolves from the URL param, not navigation state ----
  it('fetches metadata using the personId from the URL param (page data), not any navigation state', async () => {
    const deepLinkedId = 'deep-linked-person';
    vi.mocked(getFaceRepairPersonMetadata).mockResolvedValue(makeMetadata({ id: deepLinkedId, name: 'Deep Link' }));
    vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(makeFacesResponse([], 0));

    render(Page, { props: { data: makePageData(deepLinkedId) } });

    await waitFor(() => {
      expect(getFaceRepairPersonMetadata).toHaveBeenCalledWith({ personId: deepLinkedId });
    });
    expect(screen.getByTestId('manual-review-heading')).toHaveTextContent('Deep Link');
  });

  // ---- 5. `keep` tiles are clean: no badge, no ribbon (§6.4's visual inversion) ----
  it('renders every untouched tile as a clean crop — no state badge, no ribbon', async () => {
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

    for (const tile of screen.getAllByTestId('face-tile')) {
      expect(tile).toHaveAttribute('data-state', 'keep');
    }
    expect(document.querySelector('[data-state-icon]')).toBeNull();
    expect(screen.queryByText('admin.face_cleanup_review_tile_lock_ribbon')).not.toBeInTheDocument();
    expect(screen.queryByText('admin.face_cleanup_review_tile_detach_ribbon')).not.toBeInTheDocument();
    expect(screen.queryByText('admin.face_cleanup_review_tile_unknown_ribbon')).not.toBeInTheDocument();
  });

  // ---- 6. marked tiles carry badge + ribbon, using the shared STATE_COLOR/STATE_ICON tokens ----
  it('renders a badge and ribbon on every non-keep tile, one per state', async () => {
    render(Page, { props: { data: makePageData() } });
    await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

    const vm = getVm();
    vm.toggle('f1');
    vm.applyToSelection('lock');
    vm.toggle('f2');
    vm.applyToSelection('unknown');
    vm.toggle('f3');
    vm.applyToSelection('detach');

    const tileFor = (id: string) => document.querySelector(`[data-testid="face-tile"][data-faceid="${id}"]`)!;

    await waitFor(() => {
      expect(tileFor('f1')).toHaveAttribute('data-state', 'lock');
      expect(tileFor('f2')).toHaveAttribute('data-state', 'unknown');
      expect(tileFor('f3')).toHaveAttribute('data-state', 'detach');
    });

    expect(tileFor('f1').querySelector('[data-state-icon="lock"]')).not.toBeNull();
    expect(tileFor('f2').querySelector('[data-state-icon="unknown"]')).not.toBeNull();
    expect(tileFor('f3').querySelector('[data-state-icon="detach"]')).not.toBeNull();

    expect(tileFor('f1')).toHaveTextContent('admin.face_cleanup_review_tile_lock_ribbon');
    expect(tileFor('f2')).toHaveTextContent('admin.face_cleanup_review_tile_unknown_ribbon');
    expect(tileFor('f3')).toHaveTextContent('admin.face_cleanup_review_tile_detach_ribbon');

    // detach keeps the guided grayscale/opacity crop treatment
    const image = tileFor('f3').querySelector('img');
    expect(image?.getAttribute('style')).toContain('grayscale(1)');
    expect(image?.getAttribute('style')).toContain('opacity(0.55)');
  });

  // ---- 7. selection: click selects, shift-click selects a range, clear works ----
  describe('selection', () => {
    it('click toggles a single tile selected, and clicking again deselects it', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]);
      expect(tiles[0]).toHaveAttribute('data-selected', 'true');

      await fireEvent.click(tiles[0]);
      expect(tiles[0]).toHaveAttribute('data-selected', 'false');
    });

    it('shift-click selects every tile in the range, inclusive', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]);
      await fireEvent.click(tiles[2], { shiftKey: true });

      expect(tiles[0]).toHaveAttribute('data-selected', 'true');
      expect(tiles[1]).toHaveAttribute('data-selected', 'true');
      expect(tiles[2]).toHaveAttribute('data-selected', 'true');
    });

    it('Clear selection empties the selection', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]);
      await fireEvent.click(tiles[1]);
      expect(tiles[0]).toHaveAttribute('data-selected', 'true');

      await fireEvent.click(screen.getByTestId('manual-review-clear-selection'));

      for (const tile of screen.getAllByTestId('face-tile')) {
        expect(tile).toHaveAttribute('data-selected', 'false');
      }
    });
  });

  // ---- 8. "Select all loaded (N)" selects exactly the loaded faces; label reports LOADED, never total ----
  describe('select all loaded', () => {
    it('selects exactly the currently loaded faces', async () => {
      vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(makeFacesResponse([face('f1'), face('f2')], 1204));

      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(2));

      await fireEvent.click(screen.getByTestId('manual-review-select-all-loaded'));

      for (const tile of screen.getAllByTestId('face-tile')) {
        expect(tile).toHaveAttribute('data-selected', 'true');
      }
    });

    it('label reports the LOADED count, not total, when total is larger — the honesty requirement', async () => {
      vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(makeFacesResponse([face('f1'), face('f2')], 1204));

      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(2));

      const button = screen.getByTestId('manual-review-select-all-loaded');
      expect(button).toHaveTextContent('2');
      expect(button).not.toHaveTextContent('1204');
    });
  });

  // ---- 9. Load more APPENDS via appendFaces and PRESERVES staged marks AND selection (the most important
  //      test in this slice — the regression guard for the guided page's $derived defect) ----
  it('Load more appends the next page and preserves both staged marks and the current selection', async () => {
    vi.mocked(getFaceRepairClusterFaces)
      .mockResolvedValueOnce(makeFacesResponse([face('f1'), face('f2')], 4))
      .mockResolvedValueOnce(makeFacesResponse([face('f3'), face('f4')], 4));

    render(Page, { props: { data: makePageData() } });
    await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(2));

    const vm = getVm();
    // Stage a mark on f1 (clears its own selection) and separately select f2 without marking it.
    vm.toggle('f1');
    vm.applyToSelection('lock');
    vm.toggle('f2');

    await waitFor(() => {
      const tile = document.querySelector('[data-testid="face-tile"][data-faceid="f1"]')!;
      expect(tile).toHaveAttribute('data-state', 'lock');
    });

    await fireEvent.click(screen.getByTestId('manual-review-load-more'));

    await waitFor(() => {
      expect(getFaceRepairClusterFaces).toHaveBeenCalledWith({
        personId: PERSON_ID,
        faceRepairClusterFacesRequestDto: { excludeFaceIds: [], page: 1, size: PAGE_SIZE },
      });
    });
    await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(4));

    const tileFor = (id: string) => document.querySelector(`[data-testid="face-tile"][data-faceid="${id}"]`)!;
    // Marks survived the append.
    expect(tileFor('f1')).toHaveAttribute('data-state', 'lock');
    // Selection survived the append.
    expect(tileFor('f2')).toHaveAttribute('data-selected', 'true');
    // The newly appended faces default to keep and are unselected.
    expect(tileFor('f3')).toHaveAttribute('data-state', 'keep');
    expect(tileFor('f4')).toHaveAttribute('data-state', 'keep');
    expect(tileFor('f3')).toHaveAttribute('data-selected', 'false');
  });

  // ---- 10. zero-face person renders the dashed empty treatment ----
  it('renders the empty state when the person has zero faces', async () => {
    vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(makeFacesResponse([], 0));
    vi.mocked(getFaceRepairPersonMetadata).mockResolvedValue(makeMetadata({ faceCount: 0, thumbnailFaceId: null }));

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByTestId('manual-review-empty')).toBeInTheDocument();
    });
    expect(screen.queryAllByTestId('face-tile')).toHaveLength(0);
    expect(screen.queryByTestId('manual-review-load-error')).not.toBeInTheDocument();
  });

  // ---- 11. load error is DISTINCT from empty (D17 on the guided page conflated them) ----
  it('renders a load-error state with Retry, distinct from the empty state; Retry re-fetches', async () => {
    vi.mocked(getFaceRepairPersonMetadata).mockRejectedValueOnce(new Error('network down'));

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByTestId('manual-review-load-error')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('manual-review-empty')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('face-tile')).toHaveLength(0);

    vi.mocked(getFaceRepairPersonMetadata).mockResolvedValueOnce(makeMetadata());
    await fireEvent.click(screen.getByTestId('manual-review-load-error-retry'));

    await waitFor(() => {
      expect(screen.getAllByTestId('face-tile')).toHaveLength(3);
      expect(screen.queryByTestId('manual-review-load-error')).not.toBeInTheDocument();
    });
  });

  // ---- 12. a person the scan DID flag shows NO flagged badging — manual ignores scan state entirely (§7) ----
  it('never reads scan state and shows no flagged affordance, even for a person the scan flagged', async () => {
    vi.mocked(getLatestScan).mockResolvedValue({
      id: 'scan-1',
      status: 'completed',
      persons: [{ personId: PERSON_ID, flagged: 3 }],
    } as unknown as object);

    render(Page, { props: { data: makePageData() } });
    await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

    // Manual mode never calls the scan endpoint at all.
    expect(getLatestScan).not.toHaveBeenCalled();
    // Every tile defaults to keep — no flagged/badge affordance exists for an untouched face.
    for (const tile of screen.getAllByTestId('face-tile')) {
      expect(tile).toHaveAttribute('data-state', 'keep');
    }
    expect(document.querySelector('[data-state-icon]')).toBeNull();
    expect(screen.queryByText(/flagged/i)).not.toBeInTheDocument();
  });
});
