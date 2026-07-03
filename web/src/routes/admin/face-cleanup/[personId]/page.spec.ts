import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @immich/sdk before any imports that use it
vi.mock('@immich/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@immich/sdk')>();
  return {
    ...actual,
    getLatestScan: vi.fn(),
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

import { goto } from '$app/navigation';
import {
  applyFaceRepair,
  getFaceRepairClusterFaces,
  getFaceRepairPersonFaces,
  getLatestScan,
  type FaceRepairClusterFacesResponseDto,
  type FaceRepairPersonFacesDto,
} from '@immich/sdk';
import Page from './+page.svelte';

// ---- helpers ----

const PERSON_ID = 'person-1';
const OWNER_PERSON_ID = 'owner-p1';

const makeFlaggedFace = (i: number) => ({
  assetFaceId: `face-${i}`,
  suspectedOwnerId: OWNER_PERSON_ID,
});

const makeFlaggedFaces = (count = 3) => Array.from({ length: count }, (_, i) => makeFlaggedFace(i + 1));

const makeRestFaces = (count: number) => Array.from({ length: count }, (_, i) => ({ assetFaceId: `rest-${i + 1}` }));
const restResponse = (faces: { assetFaceId: string }[], total: number, hasMore: boolean) =>
  ({ faces, total, hasMore }) as unknown as FaceRepairClusterFacesResponseDto;

const makeScanPerson = (
  over: Partial<{
    personId: string;
    personName: string | null;
    faceCount: number;
  }> = {},
) => ({
  personId: PERSON_ID,
  ownerId: 'owner-user-1',
  personName: 'Jula',
  faceCount: 10,
  thumbnailFaceId: null,
  eligible: 10,
  flagged: 3,
  flaggedFraction: 0.3,
  suspectedOwners: [{ ownerPersonId: OWNER_PERSON_ID, ownerName: 'Armin', thumbnailFaceId: null, count: 3 }],
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

describe('+page.svelte (face-cleanup review)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan() as unknown as object);
    vi.mocked(getFaceRepairPersonFaces).mockResolvedValue({
      personId: PERSON_ID,
      flaggedFaces: makeFlaggedFaces(3),
    } as unknown as FaceRepairPersonFacesDto);
    vi.mocked(applyFaceRepair).mockResolvedValue({ moved: 0, skipped: 0 });
    vi.mocked(getFaceRepairClusterFaces).mockResolvedValue({
      faces: [],
      total: 0,
      hasMore: false,
    } as unknown as FaceRepairClusterFacesResponseDto);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- decision strip + tiles ----

  it('renders decision strip and one tile per flagged face', async () => {
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      // Decision strip labels
      expect(screen.getByTestId('stays-label')).toBeInTheDocument();
      expect(screen.getByTestId('moves-label')).toBeInTheDocument();
      // One tile per face
      const tiles = screen.getAllByTestId('face-tile');
      expect(tiles).toHaveLength(3);
    });
  });

  // ---- tile toggle: exclude + re-include ----

  it('clicking a tile excludes it; action-bar move count decrements; re-click restores', async () => {
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getAllByTestId('face-tile')).toHaveLength(3);
    });

    // Move btn initially enabled (3 moving, > 0)
    const moveBtn = screen.getByTestId('move-btn');
    expect(moveBtn).not.toBeDisabled();

    // Click first tile → exclude face-1
    const tiles = screen.getAllByTestId('face-tile');
    await fireEvent.click(tiles[0]);

    await waitFor(() => {
      // The tile should be marked excluded
      expect(tiles[0]).toHaveAttribute('data-excluded', 'true');
    });

    // Move button still enabled (2 remaining)
    expect(moveBtn).not.toBeDisabled();

    // Re-click to restore
    await fireEvent.click(tiles[0]);
    await waitFor(() => {
      expect(tiles[0]).toHaveAttribute('data-excluded', 'false');
    });
  });

  // ---- deselect-all → Move disabled ----

  it('deselecting all faces disables the Move button', async () => {
    vi.mocked(getFaceRepairPersonFaces).mockResolvedValue({
      personId: PERSON_ID,
      flaggedFaces: makeFlaggedFaces(2),
    } as unknown as FaceRepairPersonFacesDto);

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getAllByTestId('face-tile')).toHaveLength(2);
    });

    const tiles = screen.getAllByTestId('face-tile');
    await fireEvent.click(tiles[0]);
    await fireEvent.click(tiles[1]);

    await waitFor(() => {
      const moveBtn = screen.getByTestId('move-btn');
      expect(moveBtn).toBeDisabled();
    });
  });

  // ---- Move posts correct payload ----

  it('Move posts approvedPersonIds:[personId] and the exact excludeFaceIds', async () => {
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getAllByTestId('face-tile')).toHaveLength(3);
    });

    // Exclude face-1
    const tiles = screen.getAllByTestId('face-tile');
    await fireEvent.click(tiles[0]);

    await waitFor(() => {
      expect(tiles[0]).toHaveAttribute('data-excluded', 'true');
    });

    // Click Move
    const moveBtn = screen.getByTestId('move-btn');
    await fireEvent.click(moveBtn);

    await waitFor(() => {
      expect(applyFaceRepair).toHaveBeenCalledWith({
        faceRepairApplyRequestDto: {
          approvedPersonIds: [PERSON_ID],
          excludeFaceIds: ['face-1'],
        },
      });
    });
  });

  // ---- Cancel: no request, navigates back ----

  it('Cancel navigates back without making a request', async () => {
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByTestId('cancel-btn')).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByTestId('cancel-btn'));

    expect(applyFaceRepair).not.toHaveBeenCalled();
    expect(goto).toHaveBeenCalledWith('/admin/face-cleanup');
  });

  // ---- apply 409 non-destructive ----

  it('apply 409 shows error non-destructively and keeps state', async () => {
    let resolveApply!: () => void;
    vi.mocked(applyFaceRepair).mockReturnValueOnce(
      new Promise<never>((_, reject) => {
        resolveApply = () => reject(Object.assign(new Error('conflict'), { status: 409 }));
      }),
    );

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getAllByTestId('face-tile')).toHaveLength(3);
    });

    const moveBtn = screen.getByTestId('move-btn');
    await fireEvent.click(moveBtn);

    // In-flight → button disabled
    expect(moveBtn).toBeDisabled();

    resolveApply();

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_review_apply_conflict')).toBeInTheDocument();
    });

    // State preserved: tiles still there
    expect(screen.getAllByTestId('face-tile')).toHaveLength(3);
    // Button re-enabled (not navigated away)
    expect(goto).not.toHaveBeenCalled();
  });

  // ---- stale person: no flagged faces ----

  it('gracefully shows "no flagged faces" state when getFaceRepairPersonFaces returns empty array', async () => {
    vi.mocked(getFaceRepairPersonFaces).mockResolvedValue({
      personId: PERSON_ID,
      flaggedFaces: [],
    } as unknown as FaceRepairPersonFacesDto);

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_review_no_flagged')).toBeInTheDocument();
      expect(screen.getByText('admin.face_cleanup_review_no_flagged_sub')).toBeInTheDocument();
    });

    // No tiles, no action bar
    expect(screen.queryAllByTestId('face-tile')).toHaveLength(0);
    expect(screen.queryByTestId('action-bar')).not.toBeInTheDocument();
  });

  it('renders the Rest section with loaded faces and a Load more when there are more', async () => {
    vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(restResponse(makeRestFaces(2), 5, true));
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => expect(screen.getByTestId('rest-section')).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByTestId('rest-tile')).toHaveLength(2));
    expect(screen.getByTestId('rest-load-more')).toBeInTheDocument();
  });

  it('shows the empty Rest state when the cluster has only flagged faces (E1)', async () => {
    vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(restResponse([], 0, false));
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => expect(screen.getByTestId('rest-empty')).toBeInTheDocument());
    expect(screen.queryAllByTestId('rest-tile')).toHaveLength(0);
  });

  it('selecting a Rest tile counts toward the move (re-enables Move after all flagged are excluded)', async () => {
    vi.mocked(getFaceRepairPersonFaces).mockResolvedValue({
      personId: PERSON_ID,
      flaggedFaces: makeFlaggedFaces(1),
    } as unknown as FaceRepairPersonFacesDto);
    vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(restResponse(makeRestFaces(1), 1, false));
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => expect(screen.getAllByTestId('rest-tile')).toHaveLength(1));

    // Exclude the only flagged face → Move disabled (0 moving).
    await fireEvent.click(screen.getAllByTestId('face-tile')[0]);
    await waitFor(() => expect(screen.getByTestId('move-btn')).toBeDisabled());

    // Select a Rest face → Move enabled again (1 manual moving).
    await fireEvent.click(screen.getAllByTestId('rest-tile')[0]);
    await waitFor(() => expect(screen.getByTestId('move-btn')).not.toBeDisabled());
  });

  it('Select all marks every loaded Rest face selected', async () => {
    vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(restResponse(makeRestFaces(3), 3, false));
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => expect(screen.getAllByTestId('rest-tile')).toHaveLength(3));
    await fireEvent.click(screen.getByTestId('select-all-btn'));

    await waitFor(() => {
      for (const tile of screen.getAllByTestId('rest-tile')) {
        expect(tile).toHaveAttribute('data-selected', 'true');
      }
    });
  });

  it('Move entire cluster opens a confirm and issues an entireCluster apply (even with an empty Rest, E1)', async () => {
    vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(restResponse([], 0, false));
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => expect(screen.getByTestId('move-entire-btn')).toBeInTheDocument());
    await fireEvent.click(screen.getByTestId('move-entire-btn'));
    await waitFor(() => expect(screen.getByTestId('entire-confirm')).toBeInTheDocument());
    await fireEvent.click(screen.getByTestId('entire-confirm-cta'));

    await waitFor(() => {
      expect(applyFaceRepair).toHaveBeenCalledWith({
        faceRepairApplyRequestDto: {
          approvedPersonIds: [],
          excludeFaceIds: [],
          manualMove: { personId: PERSON_ID, destinationPersonId: OWNER_PERSON_ID, entireCluster: true },
        },
      });
    });
  });

  it('Move entire cluster still moves the flagged faces when the Rest load fails (E1 under network failure)', async () => {
    vi.mocked(getFaceRepairClusterFaces).mockRejectedValue(new Error('network'));
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => expect(screen.getByTestId('move-entire-btn')).toBeInTheDocument());
    await fireEvent.click(screen.getByTestId('move-entire-btn'));
    await waitFor(() => expect(screen.getByTestId('entire-confirm')).toBeInTheDocument());
    await fireEvent.click(screen.getByTestId('entire-confirm-cta'));

    await waitFor(() => {
      expect(applyFaceRepair).toHaveBeenCalledWith({
        faceRepairApplyRequestDto: {
          approvedPersonIds: [],
          excludeFaceIds: [],
          manualMove: { personId: PERSON_ID, destinationPersonId: OWNER_PERSON_ID, entireCluster: true },
        },
      });
    });
  });

  it('disables Select all and Move entire cluster when there is no primary owner (E17)', async () => {
    vi.mocked(getLatestScan).mockResolvedValue(
      makeCompletedScan([makeScanPerson({})]) as unknown as object, // overwritten below
    );
    vi.mocked(getLatestScan).mockResolvedValue(
      makeCompletedScan([{ ...makeScanPerson(), suspectedOwners: [] }]) as unknown as object,
    );
    vi.mocked(getFaceRepairClusterFaces).mockResolvedValue(restResponse(makeRestFaces(2), 2, false));
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => expect(screen.getByTestId('move-entire-btn')).toBeDisabled());
    expect(screen.getByTestId('select-all-btn')).toBeDisabled();
  });
});
