import {
  getFaceRepairClusterFaces,
  getFaceRepairPersonFaces,
  getLatestScan,
  resolveFaces,
  type FaceRepairClusterFacesResponseDto,
  type FaceRepairPersonFacesDto,
} from '@immich/sdk';
import { modalManager, toastManager } from '@immich/ui';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goto } from '$app/navigation';
import Page from './+page.svelte';
import ActionsHelpModal from './ActionsHelpModal.svelte';

// Mock @immich/sdk before any imports that use it
vi.mock('@immich/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@immich/sdk')>();
  return {
    ...actual,
    getLatestScan: vi.fn(),
    resolveFaces: vi.fn(),
    getFaceRepairPersonFaces: vi.fn(),
    getFaceRepairClusterFaces: vi.fn(),
    getPeopleThumbnailPath: (id: string) => `/people/${id}/thumbnail`,
  };
});

vi.mock('@immich/ui', async (original) => {
  const mod = await original<typeof import('@immich/ui')>();
  const noop = await import('@test-data/mocks/noop-component.svelte');
  return {
    ...mod,
    Icon: noop.default,
    toastManager: {
      primary: vi.fn(),
      success: vi.fn(),
      danger: vi.fn(),
    },
    IconButton: mod.Button,
    // The person-picker modal itself is covered end-to-end by PersonPicker.spec.ts; here we only need to
    // verify the bulk action opens it with the right props and routes back whatever it resolves with.
    modalManager: { show: vi.fn() },
  };
});

// Mock svelte-i18n: return the key as the translation
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

// Mock $app/navigation
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
  afterNavigate: vi.fn(),
  beforeNavigate: vi.fn(),
  onNavigate: vi.fn(),
}));

// Mock $app/stores
vi.mock('$app/stores', () => ({
  page: {
    subscribe: vi.fn((run) => {
      run({ url: new URL('http://localhost/admin/face-cleanup/person-1') });
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

// Mock AdminPageLayout to a simple pass-through that renders children
vi.mock('$lib/components/layouts/AdminPageLayout.svelte', async () => {
  const { default: stub } = await import('@test-data/mocks/sidebar.stub.svelte');
  return { default: stub };
});

// Mock people-utils thumbnail helper
vi.mock('$lib/utils/people-utils', () => ({
  getPersonFaceThumbnailUrl: (personId: string, faceId: string) => `/api/people/${personId}/faces/${faceId}/thumbnail`,
  getSpacePersonFaceThumbnailUrl: vi.fn(),
}));

// ---- helpers ----

const PERSON_ID = 'person-1';
const OWNER_A_ID = 'owner-a';
const OWNER_B_ID = 'owner-b';

// A mixed cluster: two faces suspect owner A, one suspects owner B (E14) — exercises the per-face grouping
// (W1) all the way through the rendered page and into the resolveFaces call (P4).
const makeFlaggedFaces = () => [
  { assetFaceId: 'face-1', suspectedOwnerId: OWNER_A_ID },
  { assetFaceId: 'face-2', suspectedOwnerId: OWNER_A_ID },
  { assetFaceId: 'face-3', suspectedOwnerId: OWNER_B_ID },
];

const makeScanPerson = (over: Partial<{ personId: string; personName: string | null; faceCount: number }> = {}) => ({
  personId: PERSON_ID,
  ownerId: 'owner-user-1',
  personName: 'Jula',
  faceCount: 10,
  thumbnailFaceId: null,
  eligible: 10,
  flagged: 3,
  flaggedFraction: 0.3,
  suspectedOwners: [
    { ownerPersonId: OWNER_A_ID, ownerName: 'Armin', thumbnailFaceId: null, count: 2 },
    { ownerPersonId: OWNER_B_ID, ownerName: 'Berta', thumbnailFaceId: null, count: 1 },
  ],
  recommendation: 'confident' as const,
  reviewReasons: [] as string[],
  ...over,
});

const makeCompletedScan = (persons = [makeScanPerson()]) => ({
  id: 'scan-1',
  status: 'completed' as const,
  progress: { scanned: 100, total: 100 },
  totals: null,
  persons,
  error: null,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
});

const makePageData = (personId = PERSON_ID) => ({
  personId,
  meta: { title: 'Review person' },
});

const emptyRest = () => ({ faces: [], total: 0, hasMore: false }) as unknown as FaceRepairClusterFacesResponseDto;

// `modalManager.show` is a generic overloaded method (its return type depends on the component passed in),
// so `vi.mocked(modalManager.show)` can't infer a concrete signature at this call site. Cast once to a plain
// mock of the shape the picker's `onClose` actually resolves with (see PersonPicker.svelte).
const showModal = modalManager.show as unknown as ReturnType<
  typeof vi.fn<(...args: unknown[]) => Promise<{ personId: string; name: string; lock?: boolean } | undefined>>
>;

describe('+page.svelte (face-cleanup review — Model B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan() as unknown as object);
    vi.mocked(getFaceRepairPersonFaces).mockResolvedValue({
      personId: PERSON_ID,
      flaggedFaces: makeFlaggedFaces(),
    } as unknown as FaceRepairPersonFacesDto);
    vi.mocked(resolveFaces).mockResolvedValue({
      moved: 0,
      declined: 0,
      locked: 0,
      detached: 0,
      unknown: 0,
      skipped: 0,
    });
    vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(emptyRest());
    showModal.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders one flagged-grid tile per flagged face, defaulting to the owner state', async () => {
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByTestId('flagged-grid')).toBeInTheDocument();
      const tiles = screen.getAllByTestId('face-tile');
      expect(tiles).toHaveLength(3);
      for (const tile of tiles) {
        expect(tile).toHaveAttribute('data-state', 'owner');
      }
    });
  });

  // ---- P1: selection — click toggle, shift-click range, select-all, clear ----

  describe('P1 selection', () => {
    it('click toggles a single tile selected, and toggling again deselects it', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]);
      await waitFor(() => expect(screen.getByTestId('bulk-bar')).toBeInTheDocument());

      await fireEvent.click(tiles[0]);
      await waitFor(() => expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument());
    });

    it('shift-click selects the whole range between the last click and this one', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]);
      await fireEvent.click(tiles[2], { shiftKey: true });

      await waitFor(() => {
        expect(screen.getByTestId('bulk-bar')).toHaveTextContent('3');
      });
    });

    it('Select all selects every tile', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getByTestId('select-all'));

      await waitFor(() => {
        expect(screen.getByTestId('bulk-bar')).toHaveTextContent('3');
      });
    });

    it('Clear empties the selection and swaps the dock back to the summary', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getByTestId('select-all'));
      await waitFor(() => expect(screen.getByTestId('bulk-bar')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('clear'));

      await waitFor(() => {
        expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument();
        expect(screen.getByTestId('tally')).toBeInTheDocument();
      });
    });

    it('Reset returns every tile to the owner state and clears the selection', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getByTestId('select-all'));
      await waitFor(() => expect(screen.getByTestId('bulk-bar')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('reset'));

      await waitFor(() => {
        expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument();
        for (const tile of screen.getAllByTestId('face-tile')) {
          expect(tile).toHaveAttribute('data-state', 'owner');
        }
      });
    });
  });

  // ---- P2: dock swaps summary ↔ bulk bar on selection count ----

  describe('P2 dock swap', () => {
    it('shows the summary (tally + apply-btn) when nothing is selected', async () => {
      render(Page, { props: { data: makePageData() } });

      await waitFor(() => {
        expect(screen.getByTestId('dock')).toBeInTheDocument();
        expect(screen.getByTestId('tally')).toBeInTheDocument();
        expect(screen.getByTestId('apply-btn')).toBeInTheDocument();
        expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument();
      });
    });

    it('swaps to the bulk bar once at least one tile is selected, hiding the summary', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getAllByTestId('face-tile')[0]);

      await waitFor(() => {
        expect(screen.getByTestId('bulk-bar')).toBeInTheDocument();
        expect(screen.queryByTestId('apply-btn')).not.toBeInTheDocument();
      });
    });

    it('swaps back to the summary once the selection is cleared', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getAllByTestId('face-tile')[0]);
      await waitFor(() => expect(screen.getByTestId('bulk-bar')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('clear'));

      await waitFor(() => {
        expect(screen.getByTestId('apply-btn')).toBeInTheDocument();
        expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument();
      });
    });
  });

  // ---- P4: Apply posts { faceRepairResolveRequestDto } matching on-screen state ----

  describe('P4 Apply', () => {
    it('posts resolveFaces with every flagged face grouped by its own suspected owner (default, untouched state)', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getByTestId('apply-btn'));

      await waitFor(() => {
        expect(resolveFaces).toHaveBeenCalledWith({
          faceRepairResolveRequestDto: {
            personId: PERSON_ID,
            // owner-state groups never auto-lock (Slice 3, move-and-lock).
            moveToPerson: [
              { destinationPersonId: OWNER_A_ID, faceIds: ['face-1', 'face-2'], lock: false },
              { destinationPersonId: OWNER_B_ID, faceIds: ['face-3'], lock: false },
            ],
            stay: [],
            lock: [],
            detach: [],
            unknown: [],
          },
        });
      });
    });

    it('never calls resolveFaces with an undefined body', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getByTestId('apply-btn'));

      await waitFor(() => expect(resolveFaces).toHaveBeenCalledTimes(1));
      const [arg] = vi.mocked(resolveFaces).mock.calls[0];
      expect(arg).toBeDefined();
      expect(arg.faceRepairResolveRequestDto).toBeDefined();
    });

    // Regression guard for the onMount-awaits-rejected-promise anti-pattern (advanced-scan notes): the
    // rejection is only produced once the test explicitly triggers it, well after the click — never as an
    // immediately-rejected promise handed to a fire-and-forget onMount await.
    it('shows a conflict message on 409 without navigating away, preserving on-screen state', async () => {
      let rejectApply!: () => void;
      vi.mocked(resolveFaces).mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectApply = () => reject(Object.assign(new Error('conflict'), { status: 409 }));
        }),
      );

      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const applyBtn = screen.getByTestId('apply-btn');
      await fireEvent.click(applyBtn);
      expect(applyBtn).toBeDisabled();

      rejectApply();

      await waitFor(() => {
        expect(screen.getByText('admin.face_cleanup_review_apply_conflict')).toBeInTheDocument();
      });
      expect(screen.getAllByTestId('face-tile')).toHaveLength(3);
    });
  });

  // ---- Slice 2: "Keep here" bulk action (soft-stay) — W1/W2 exercised through the rendered page ----

  describe('Bulk actions — Keep here (stay)', () => {
    it('tags the selected tile stay (green ribbon) and updates the tally, clearing the selection', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]);
      await waitFor(() => expect(screen.getByTestId('bulk-bar')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('bulk-stay'));

      await waitFor(() => {
        // Bulk actions clear the selection, swapping the dock back to the summary.
        expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument();
        expect(screen.getByTestId('tally')).toBeInTheDocument();
      });

      const refreshedTiles = screen.getAllByTestId('face-tile');
      expect(refreshedTiles[0]).toHaveAttribute('data-state', 'stay');
      expect(screen.getByText('admin.face_cleanup_review_tile_stay_ribbon')).toBeInTheDocument();

      // The tally's "Keep" chip now reads 1 and is no longer dimmed (opacity-40 = zero-count).
      const tally = screen.getByTestId('tally');
      const stayLabel = within(tally).getByText('admin.face_cleanup_review_tally_stay');
      const stayChip = stayLabel.parentElement!;
      expect(stayChip).not.toHaveClass('opacity-40');
      expect(stayChip).toHaveTextContent('1');
    });

    it('includes the kept face in `stay` and excludes it from `moveToPerson` on Apply', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]); // face-1, suspected owner-a
      await fireEvent.click(screen.getByTestId('bulk-stay'));

      await fireEvent.click(screen.getByTestId('apply-btn'));

      await waitFor(() => {
        expect(resolveFaces).toHaveBeenCalledWith({
          faceRepairResolveRequestDto: {
            personId: PERSON_ID,
            moveToPerson: [
              { destinationPersonId: OWNER_A_ID, faceIds: ['face-2'], lock: false },
              { destinationPersonId: OWNER_B_ID, faceIds: ['face-3'], lock: false },
            ],
            stay: ['face-1'],
            lock: [],
            detach: [],
            unknown: [],
          },
        });
      });
    });
  });

  // ---- Slice 3: "Confirm / lock" bulk action (owner-agnostic lock) — mirrors the Keep here (stay) wiring ----

  describe('Bulk actions — Confirm / lock', () => {
    it('tags the selected tile lock (violet ribbon) and updates the tally, clearing the selection', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]);
      await waitFor(() => expect(screen.getByTestId('bulk-bar')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('bulk-lock'));

      await waitFor(() => {
        // Bulk actions clear the selection, swapping the dock back to the summary.
        expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument();
        expect(screen.getByTestId('tally')).toBeInTheDocument();
      });

      const refreshedTiles = screen.getAllByTestId('face-tile');
      expect(refreshedTiles[0]).toHaveAttribute('data-state', 'lock');
      expect(screen.getByText('admin.face_cleanup_review_tile_lock_ribbon')).toBeInTheDocument();

      // The tally's "Locked" chip now reads 1 and is no longer dimmed (opacity-40 = zero-count).
      const tally = screen.getByTestId('tally');
      const lockLabel = within(tally).getByText('admin.face_cleanup_review_tally_lock');
      const lockChip = lockLabel.parentElement!;
      expect(lockChip).not.toHaveClass('opacity-40');
      expect(lockChip).toHaveTextContent('1');
    });

    it('includes the locked face in `lock` and excludes it from `moveToPerson` on Apply', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]); // face-1, suspected owner-a
      await fireEvent.click(screen.getByTestId('bulk-lock'));

      await fireEvent.click(screen.getByTestId('apply-btn'));

      await waitFor(() => {
        expect(resolveFaces).toHaveBeenCalledWith({
          faceRepairResolveRequestDto: {
            personId: PERSON_ID,
            moveToPerson: [
              { destinationPersonId: OWNER_A_ID, faceIds: ['face-2'], lock: false },
              { destinationPersonId: OWNER_B_ID, faceIds: ['face-3'], lock: false },
            ],
            stay: [],
            lock: ['face-1'],
            detach: [],
            unknown: [],
          },
        });
      });
    });
  });

  // ---- Slice 4: "Move → person…" bulk action (owner-scoped picker) ----
  // The picker component itself (list/search/create-new/E8) is covered by PersonPicker.spec.ts; here we
  // verify the bulk-bar action opens it with the right props and routes whatever it resolves with into the
  // review model, matching the "Keep here"/"Confirm / lock" wiring above.

  describe('Bulk actions — Move to person (other)', () => {
    it('opens the picker with the owner id, selection count and the scan-suggested owner', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]);
      await waitFor(() => expect(screen.getByTestId('bulk-bar')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('bulk-other'));

      await waitFor(() => {
        expect(showModal).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ ownerId: 'owner-user-1', faceCount: 1, suggestedPersonId: OWNER_A_ID }),
        );
      });
    });

    it('tags the selected tile "other" (amber ribbon) with the chosen destination, and tallies it under "→ other"', async () => {
      showModal.mockResolvedValueOnce({ personId: 'chosen-1', name: 'Chosen Person' });

      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]);
      await waitFor(() => expect(screen.getByTestId('bulk-bar')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('bulk-other'));

      await waitFor(() => {
        expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument();
        expect(screen.getByTestId('tally')).toBeInTheDocument();
      });

      const refreshedTiles = screen.getAllByTestId('face-tile');
      expect(refreshedTiles[0]).toHaveAttribute('data-state', 'other');
      // Scoped to the tile itself: the 'owner'-state tiles reuse the same `..._tile_dest` key, so an
      // unscoped query would match more than one element.
      expect(within(refreshedTiles[0]).getByText('admin.face_cleanup_review_tile_dest')).toBeInTheDocument();

      const tally = screen.getByTestId('tally');
      const otherLabel = within(tally).getByText('admin.face_cleanup_review_tally_other');
      const otherChip = otherLabel.parentElement!;
      expect(otherChip).not.toHaveClass('opacity-40');
      expect(otherChip).toHaveTextContent('1');
    });

    it('groups the chosen destination into its own moveToPerson entry on Apply', async () => {
      showModal.mockResolvedValueOnce({ personId: 'chosen-1', name: 'Chosen Person' });

      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]); // face-1, suspected owner-a
      await fireEvent.click(screen.getByTestId('bulk-other'));
      await waitFor(() => expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('apply-btn'));

      await waitFor(() => {
        expect(resolveFaces).toHaveBeenCalledWith({
          faceRepairResolveRequestDto: {
            personId: PERSON_ID,
            // The mock resolves without `lock` — same as an unchecked picker toggle — so the chosen-person
            // group defaults to lock:false, same as the untouched owner-state groups (Slice 3).
            moveToPerson: [
              { destinationPersonId: 'chosen-1', faceIds: ['face-1'], lock: false },
              { destinationPersonId: OWNER_A_ID, faceIds: ['face-2'], lock: false },
              { destinationPersonId: OWNER_B_ID, faceIds: ['face-3'], lock: false },
            ],
            stay: [],
            lock: [],
            detach: [],
            unknown: [],
          },
        });
      });
    });

    // ---- Slice 3 (move-and-lock): the picker's lock toggle rides through +page.svelte's wiring ----
    it("W1: threads the picker's lock:true onto the chosen-person group only, never onto owner-state groups", async () => {
      showModal.mockResolvedValueOnce({ personId: 'chosen-1', name: 'Chosen Person', lock: true });

      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]); // face-1, suspected owner-a
      await fireEvent.click(screen.getByTestId('bulk-other'));
      await waitFor(() => expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('apply-btn'));

      await waitFor(() => {
        expect(resolveFaces).toHaveBeenCalledWith({
          faceRepairResolveRequestDto: {
            personId: PERSON_ID,
            moveToPerson: [
              { destinationPersonId: 'chosen-1', faceIds: ['face-1'], lock: true },
              { destinationPersonId: OWNER_A_ID, faceIds: ['face-2'], lock: false },
              { destinationPersonId: OWNER_B_ID, faceIds: ['face-3'], lock: false },
            ],
            stay: [],
            lock: [],
            detach: [],
            unknown: [],
          },
        });
      });
    });

    it('leaves the selection untouched if the picker is closed without choosing a destination', async () => {
      showModal.mockResolvedValueOnce(undefined);

      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]);
      await fireEvent.click(screen.getByTestId('bulk-other'));

      await waitFor(() => expect(showModal).toHaveBeenCalled());

      // Selection (and its "owner" state) survives an uncommitted picker — the bulk bar is still showing.
      expect(screen.getByTestId('bulk-bar')).toBeInTheDocument();
      expect(screen.getAllByTestId('face-tile')[0]).toHaveAttribute('data-state', 'owner');
    });
  });

  // ---- Slice 5: "Not a face" bulk action (detach) — mirrors the Keep here (stay) / Confirm-lock wiring ----

  describe('Bulk actions — Not a face (detach)', () => {
    it('tags the selected tile detach (slate ribbon, grayscale) and updates the tally, clearing the selection', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]);
      await waitFor(() => expect(screen.getByTestId('bulk-bar')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('bulk-detach'));

      await waitFor(() => {
        // Bulk actions clear the selection, swapping the dock back to the summary.
        expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument();
        expect(screen.getByTestId('tally')).toBeInTheDocument();
      });

      const refreshedTiles = screen.getAllByTestId('face-tile');
      expect(refreshedTiles[0]).toHaveAttribute('data-state', 'detach');
      expect(screen.getByText('admin.face_cleanup_review_tile_detach_ribbon')).toBeInTheDocument();

      // The tile's thumbnail is grayed out (mockup: filter: grayscale(1) opacity(0.55)). alt="" gives the
      // image role="presentation" (no accessible name), so query it directly rather than via getByRole.
      const image = refreshedTiles[0].querySelector('img');
      expect(image).not.toBeNull();
      expect(image?.getAttribute('style')).toContain('grayscale(1)');
      expect(image?.getAttribute('style')).toContain('opacity(0.55)');

      // The tally's "Detach" chip now reads 1 and is no longer dimmed (opacity-40 = zero-count).
      const tally = screen.getByTestId('tally');
      const detachLabel = within(tally).getByText('admin.face_cleanup_review_tally_detach');
      const detachChip = detachLabel.parentElement!;
      expect(detachChip).not.toHaveClass('opacity-40');
      expect(detachChip).toHaveTextContent('1');
    });

    it('includes the detached face in `detach` and excludes it from `moveToPerson` on Apply', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      const tiles = screen.getAllByTestId('face-tile');
      await fireEvent.click(tiles[0]); // face-1, suspected owner-a
      await fireEvent.click(screen.getByTestId('bulk-detach'));

      // Detaching is irreversible, so Apply routes through the confirmation first.
      await fireEvent.click(screen.getByTestId('apply-btn'));
      await waitFor(() => expect(screen.getByTestId('detach-confirm')).toBeInTheDocument());
      await fireEvent.click(screen.getByTestId('detach-confirm-cta'));

      await waitFor(() => {
        expect(resolveFaces).toHaveBeenCalledWith({
          faceRepairResolveRequestDto: {
            personId: PERSON_ID,
            moveToPerson: [
              { destinationPersonId: OWNER_A_ID, faceIds: ['face-2'], lock: false },
              { destinationPersonId: OWNER_B_ID, faceIds: ['face-3'], lock: false },
            ],
            stay: [],
            lock: [],
            detach: ['face-1'],
            unknown: [],
          },
        });
      });
    });
  });

  // "Not a face" is the only action on this page that cannot be undone — it retires the detected face for good,
  // and nothing in the app brings it back. It also sits one button away from "Unknown person", which means the
  // OPPOSITE thing. These tests pin the guard against that slip.
  describe('Destructive Apply — confirmation before discarding faces', () => {
    const stageDetach = async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));
      await fireEvent.click(screen.getAllByTestId('face-tile')[0]);
      await fireEvent.click(screen.getByTestId('bulk-detach'));
    };

    it('does NOT commit anything when Apply carries a detached face — it asks first', async () => {
      await stageDetach();

      await fireEvent.click(screen.getByTestId('apply-btn'));

      await waitFor(() => expect(screen.getByTestId('detach-confirm')).toBeInTheDocument());
      // The whole point: the destructive resolve has NOT been sent yet.
      expect(resolveFaces).not.toHaveBeenCalled();
      expect(goto).not.toHaveBeenCalled();
    });

    it('cancelling commits nothing and leaves the staged review exactly as it was', async () => {
      await stageDetach();
      await fireEvent.click(screen.getByTestId('apply-btn'));
      await waitFor(() => expect(screen.getByTestId('detach-confirm')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('detach-confirm-cancel'));

      await waitFor(() => expect(screen.queryByTestId('detach-confirm')).not.toBeInTheDocument());
      expect(resolveFaces).not.toHaveBeenCalled();
      // The staged decision survives the cancel — the admin returns to their review, not to a blank slate.
      expect(screen.getAllByTestId('face-tile')[0]).toHaveAttribute('data-state', 'detach');
    });

    it('does NOT ask when nothing is being discarded — a routine Apply goes straight through', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      // Every face stays in the default `owner` state: nothing destructive, so no confirmation. Prompting on
      // every Apply would train the admin to click past the one prompt that matters.
      await fireEvent.click(screen.getByTestId('apply-btn'));

      await waitFor(() => expect(resolveFaces).toHaveBeenCalled());
      expect(screen.queryByTestId('detach-confirm')).not.toBeInTheDocument();
    });

    it('does NOT ask for the Unknown person action — parking a stranger is reversible', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));
      await fireEvent.click(screen.getAllByTestId('face-tile')[0]);
      await fireEvent.click(screen.getByTestId('bulk-unknown'));

      await fireEvent.click(screen.getByTestId('apply-btn'));

      await waitFor(() => expect(resolveFaces).toHaveBeenCalled());
      expect(screen.queryByTestId('detach-confirm')).not.toBeInTheDocument();
    });
  });

  // ---- "Unknown person": a real face the admin cannot name (the case that made the review unfinishable) ----

  describe('Bulk actions — Unknown person', () => {
    it('tags the selected tile unknown WITHOUT graying it out (it is a real face) and updates the tally', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getAllByTestId('face-tile')[0]);
      await waitFor(() => expect(screen.getByTestId('bulk-bar')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('bulk-unknown'));

      await waitFor(() => expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument());

      const refreshedTiles = screen.getAllByTestId('face-tile');
      expect(refreshedTiles[0]).toHaveAttribute('data-state', 'unknown');
      expect(screen.getByText('admin.face_cleanup_review_tile_unknown_ribbon')).toBeInTheDocument();

      // Unlike "Not a face", the crop is NOT desaturated — this face is a real person, just an unnamed one.
      const image = refreshedTiles[0].querySelector('img');
      expect(image?.getAttribute('style') ?? '').not.toContain('grayscale(1)');

      const tally = screen.getByTestId('tally');
      const unknownChip = within(tally).getByText('admin.face_cleanup_review_tally_unknown').parentElement!;
      expect(unknownChip).not.toHaveClass('opacity-40');
      expect(unknownChip).toHaveTextContent('1');
    });

    it('sends the face in `unknown` and excludes it from `moveToPerson` on Apply', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getAllByTestId('face-tile')[0]); // face-1, suspected owner-a
      await fireEvent.click(screen.getByTestId('bulk-unknown'));
      await fireEvent.click(screen.getByTestId('apply-btn'));

      await waitFor(() => {
        expect(resolveFaces).toHaveBeenCalledWith({
          faceRepairResolveRequestDto: {
            personId: PERSON_ID,
            moveToPerson: [
              { destinationPersonId: OWNER_A_ID, faceIds: ['face-2'], lock: false },
              { destinationPersonId: OWNER_B_ID, faceIds: ['face-3'], lock: false },
            ],
            stay: [],
            lock: [],
            detach: [],
            unknown: ['face-1'],
          },
        });
      });
    });
  });

  // ---- Rest-of-cluster (own self-contained flow, now also posting through `resolve` — Slice 6) ----

  describe('Rest-of-cluster via resolve', () => {
    it('Move entire cluster: confirming the modal calls resolveFaces with entireCluster', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getByTestId('move-entire-btn'));
      await waitFor(() => expect(screen.getByTestId('entire-confirm')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('entire-confirm-cta'));

      await waitFor(() => {
        expect(resolveFaces).toHaveBeenCalledWith({
          faceRepairResolveRequestDto: {
            personId: PERSON_ID,
            entireCluster: { destinationPersonId: OWNER_A_ID },
          },
        });
      });
      expect(screen.queryByTestId('entire-confirm')).not.toBeInTheDocument();
    });

    // The rest-of-cluster section used to COMMIT its own independent resolve, which drained the person from the
    // console while every staged flagged decision was silently discarded (and came back on the next scan).
    // Ticking a rest face now only STAGES it into the one terminal Apply.
    it('has no separate rest-move commit button — the rest selection is staged, not committed', async () => {
      vi.mocked(getFaceRepairClusterFaces).mockResolvedValue({
        faces: [{ assetFaceId: 'rest-1' }, { assetFaceId: 'rest-2' }],
        total: 2,
        hasMore: false,
      } as unknown as FaceRepairClusterFacesResponseDto);

      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('rest-tile')).toHaveLength(2));

      await fireEvent.click(screen.getAllByTestId('rest-tile')[0]);

      expect(screen.queryByTestId('move-rest-selection-btn')).not.toBeInTheDocument();
      expect(resolveFaces).not.toHaveBeenCalled();
    });

    it('folds the staged rest faces into the single Apply, in ONE resolve alongside the flagged faces', async () => {
      vi.mocked(getFaceRepairClusterFaces).mockResolvedValue({
        faces: [{ assetFaceId: 'rest-1' }, { assetFaceId: 'rest-2' }],
        total: 2,
        hasMore: false,
      } as unknown as FaceRepairClusterFacesResponseDto);

      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('rest-tile')).toHaveLength(2));

      await fireEvent.click(screen.getAllByTestId('rest-tile')[0]);

      // The dock now tells the admin the added face is part of what Apply will do — it swaps to the
      // "+ N added" label and tallies the addition (this spec's t() echoes keys, so the count itself is
      // asserted on the chip, which renders it literally).
      await waitFor(() => {
        expect(screen.getByTestId('apply-btn')).toHaveTextContent('admin.face_cleanup_review_apply_label_added');
        expect(screen.getByTestId('tally-added')).toHaveTextContent('+1');
      });

      await fireEvent.click(screen.getByTestId('apply-btn'));

      await waitFor(() => expect(resolveFaces).toHaveBeenCalledTimes(1));
      const request = vi.mocked(resolveFaces).mock.calls[0][0].faceRepairResolveRequestDto;
      // face-1/face-2 (flagged, suspecting owner A) and the staged rest face all ride the owner-A group.
      const ownerAGroup = request.moveToPerson?.find((group) => group.destinationPersonId === OWNER_A_ID);
      expect(ownerAGroup?.faceIds.sort()).toEqual(['face-1', 'face-2', 'rest-1'].sort());
      // ...and the mixed cluster's owner-B face still rides its own group — the rest face never lands there.
      const ownerBGroup = request.moveToPerson?.find((group) => group.destinationPersonId === OWNER_B_ID);
      expect(ownerBGroup?.faceIds).toEqual(['face-3']);
    });

    // The bug that ate a whole-cluster move: the server refuses a resolve while a scan is running (409), and
    // the client swallowed it — no banner, nothing moved, and the admin believed it had worked.
    it('surfaces a rejected Move entire cluster instead of swallowing it, and does not navigate away', async () => {
      vi.mocked(resolveFaces).mockRejectedValue({ status: 409 });

      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getByTestId('move-entire-btn'));
      await waitFor(() => expect(screen.getByTestId('entire-confirm')).toBeInTheDocument());
      await fireEvent.click(screen.getByTestId('entire-confirm-cta'));

      await waitFor(() => {
        expect(screen.getByText('admin.face_cleanup_review_apply_conflict')).toBeInTheDocument();
      });
      expect(goto).not.toHaveBeenCalled();
    });

    it('reports what the server actually did after a successful apply', async () => {
      vi.mocked(resolveFaces).mockResolvedValue({
        moved: 2,
        declined: 1,
        locked: 0,
        detached: 0,
        unknown: 0,
        skipped: 0,
      });

      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getByTestId('apply-btn'));

      await waitFor(() => {
        expect(toastManager.primary).toHaveBeenCalledWith(
          expect.stringContaining('admin.face_cleanup_review_apply_summary'),
        );
      });
    });
  });

  // ---- Actions help: two entry points, one modal ----
  // The bulk bar only exists once a face is selected, so the banner (i) is the one a confused admin finds
  // before touching anything; the bulk-bar (i) is the one they reach for mid-task. The modal's own content is
  // covered by ActionsHelpModal.spec.ts — here we only verify both buttons open it.

  describe('Actions help modal', () => {
    it('opens the help modal from the review banner, before anything is selected', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument();
      await fireEvent.click(screen.getByTestId('banner-help'));

      expect(showModal).toHaveBeenCalledWith(ActionsHelpModal, {});
    });

    it('opens the same help modal from the bulk bar once a face is selected', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getAllByTestId('face-tile')[0]);
      await waitFor(() => expect(screen.getByTestId('bulk-bar')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('bulk-help'));

      expect(showModal).toHaveBeenCalledWith(ActionsHelpModal, {});
    });

    it('keeps the selection intact when the help modal is dismissed', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getAllByTestId('face-tile')[0]);
      await waitFor(() => expect(screen.getByTestId('bulk-bar')).toBeInTheDocument());
      await fireEvent.click(screen.getByTestId('bulk-help'));

      // The bar only renders while something is selected, so its survival IS the selection surviving.
      expect(screen.getByTestId('bulk-bar')).toBeInTheDocument();
      expect(screen.getByTestId('bulk-bar')).toHaveTextContent('1');
      expect(screen.getAllByTestId('face-tile')[0]).toHaveAttribute('data-state', 'owner');
    });
  });

  // ---- bonus: existing graceful empty state preserved (design §8.5 P5) ----

  it('gracefully shows "no flagged faces" when getFaceRepairPersonFaces returns empty', async () => {
    vi.mocked(getFaceRepairPersonFaces).mockResolvedValue({
      personId: PERSON_ID,
      flaggedFaces: [],
    } as unknown as FaceRepairPersonFacesDto);

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_review_no_flagged')).toBeInTheDocument();
    });
    expect(screen.queryAllByTestId('face-tile')).toHaveLength(0);
    expect(screen.queryByTestId('dock')).not.toBeInTheDocument();
  });
});
