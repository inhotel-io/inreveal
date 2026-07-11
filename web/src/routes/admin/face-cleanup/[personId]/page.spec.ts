import {
  applyFaceRepair,
  getFaceRepairClusterFaces,
  getFaceRepairPersonFaces,
  getLatestScan,
  resolveFaces,
  type FaceRepairClusterFacesResponseDto,
  type FaceRepairPersonFacesDto,
} from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

// Mock @immich/sdk before any imports that use it
vi.mock('@immich/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@immich/sdk')>();
  return {
    ...actual,
    getLatestScan: vi.fn(),
    resolveFaces: vi.fn(),
    applyFaceRepair: vi.fn(),
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

describe('+page.svelte (face-cleanup review — Model B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan() as unknown as object);
    vi.mocked(getFaceRepairPersonFaces).mockResolvedValue({
      personId: PERSON_ID,
      flaggedFaces: makeFlaggedFaces(),
    } as unknown as FaceRepairPersonFacesDto);
    vi.mocked(resolveFaces).mockResolvedValue({ moved: 0, declined: 0, locked: 0, detached: 0, skipped: 0 });
    vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(emptyRest());
    vi.mocked(applyFaceRepair).mockResolvedValue({ moved: 0, skipped: 0 });
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
            moveToPerson: [
              { destinationPersonId: OWNER_A_ID, faceIds: ['face-1', 'face-2'] },
              { destinationPersonId: OWNER_B_ID, faceIds: ['face-3'] },
            ],
            stay: [],
            lock: [],
            detach: [],
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
              { destinationPersonId: OWNER_A_ID, faceIds: ['face-2'] },
              { destinationPersonId: OWNER_B_ID, faceIds: ['face-3'] },
            ],
            stay: ['face-1'],
            lock: [],
            detach: [],
          },
        });
      });
    });
  });

  // ---- Rest-of-cluster (legacy `applyFaceRepair` path, retained this slice — see +page.svelte L76-79) ----

  describe('Rest-of-cluster legacy apply path', () => {
    it('Move entire cluster: confirming the modal calls applyFaceRepair with entireCluster: true', async () => {
      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('face-tile')).toHaveLength(3));

      await fireEvent.click(screen.getByTestId('move-entire-btn'));
      await waitFor(() => expect(screen.getByTestId('entire-confirm')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('entire-confirm-cta'));

      await waitFor(() => {
        expect(applyFaceRepair).toHaveBeenCalledWith({
          faceRepairApplyRequestDto: {
            approvedPersonIds: [],
            excludeFaceIds: [],
            manualMove: { personId: PERSON_ID, destinationPersonId: OWNER_A_ID, entireCluster: true },
          },
        });
      });
      expect(screen.queryByTestId('entire-confirm')).not.toBeInTheDocument();
    });

    it('Move selected rest faces calls applyFaceRepair with the selected rest faceIds', async () => {
      vi.mocked(getFaceRepairClusterFaces).mockResolvedValue({
        faces: [{ assetFaceId: 'rest-1' }, { assetFaceId: 'rest-2' }],
        total: 2,
        hasMore: false,
      } as unknown as FaceRepairClusterFacesResponseDto);

      render(Page, { props: { data: makePageData() } });
      await waitFor(() => expect(screen.getAllByTestId('rest-tile')).toHaveLength(2));

      const restTiles = screen.getAllByTestId('rest-tile');
      await fireEvent.click(restTiles[0]);
      await waitFor(() => expect(screen.getByTestId('move-rest-selection-btn')).toBeInTheDocument());

      await fireEvent.click(screen.getByTestId('move-rest-selection-btn'));

      await waitFor(() => {
        expect(applyFaceRepair).toHaveBeenCalledWith({
          faceRepairApplyRequestDto: {
            approvedPersonIds: [],
            excludeFaceIds: [],
            manualMove: { personId: PERSON_ID, destinationPersonId: OWNER_A_ID, faceIds: ['rest-1'] },
          },
        });
      });
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
