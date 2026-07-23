import {
  declineFaceRepair,
  getFaceRepairPersonFaces,
  getLatestScan,
  resolveFaces,
  triggerScan,
  type FaceRepairPersonFacesDto,
} from '@immich/sdk';
import { toastManager } from '@immich/ui';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

// Mock @immich/sdk before any imports that use it
vi.mock('@immich/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@immich/sdk')>();
  return {
    ...actual,
    getLatestScan: vi.fn(),
    triggerScan: vi.fn(),
    resolveFaces: vi.fn(),
    getFaceRepairPersonFaces: vi.fn(),
    declineFaceRepair: vi.fn(),
    getPeopleThumbnailPath: (id: string) => `/people/${id}/thumbnail`,
  };
});

vi.mock('@immich/ui', async (original) => {
  const mod = await original<typeof import('@immich/ui')>();
  const noop = await import('@test-data/mocks/noop-component.svelte');
  return {
    ...mod,
    // Stub Icon to a no-op to avoid undefined-path errors in happy-dom
    Icon: noop.default,
    toastManager: {
      primary: vi.fn(),
      success: vi.fn(),
      danger: vi.fn(),
    },
    // Avoid tooltip/context provider issues in tests
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

// Mock $app/navigation to avoid SvelteKit runtime in tests
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
  afterNavigate: vi.fn(),
  beforeNavigate: vi.fn(),
  onNavigate: vi.fn(),
}));

// Mock $app/stores to avoid SvelteKit runtime in tests
vi.mock('$app/stores', () => ({
  page: {
    subscribe: vi.fn((run) => {
      run({ url: new URL('http://localhost/admin/face-cleanup') });
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

// ---- helpers ----

const makeScanPerson = (
  over: Partial<{
    personId: string;
    ownerId: string;
    personName: string | null;
    faceCount: number;
    recommendation: 'confident' | 'review-first';
    reviewReasons: string[];
    flagged: number;
    flaggedFraction: number;
  }> = {},
) => ({
  personId: 'p1',
  ownerId: 'owner1',
  personName: null,
  faceCount: 50,
  thumbnailFaceId: null,
  eligible: 50,
  flagged: 30,
  flaggedFraction: 0.6,
  suspectedOwners: [{ ownerPersonId: 'owner-person', ownerName: 'Alice', thumbnailFaceId: null, count: 30 }],
  recommendation: 'confident' as const,
  reviewReasons: [] as string[],
  ...over,
});

const makeTotals = () => ({
  eligibleFaces: 1000,
  flaggedFaces: 200,
  toRepair: 50,
  reviewOnlyFaces: 150,
  reviewOnlyPersons: 10,
  affectedPersons: 12,
  reviewOnlyByReason: { overCap: 5, badTarget: 3, unAttributable: 2 },
});

const makeCompletedScan = (persons = [makeScanPerson()]) => ({
  id: 'scan-1',
  status: 'completed' as const,
  progress: { scanned: 1000, total: 1000 },
  totals: makeTotals(),
  persons,
  error: null,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
});

const makePageData = () => ({ users: [], meta: { title: 'Face cleanup' } });

describe('+page.svelte (face cleanup)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(getLatestScan).mockResolvedValue(null as unknown as object);
    vi.mocked(triggerScan).mockResolvedValue({ scanId: 'new-scan' });
    vi.mocked(getFaceRepairPersonFaces).mockResolvedValue({
      personId: 'c1',
      flaggedFaces: [{ assetFaceId: 'f1', suspectedOwnerId: 'owner-person' }],
    } as unknown as FaceRepairPersonFacesDto);
    vi.mocked(resolveFaces).mockResolvedValue({
      moved: 1,
      declined: 0,
      locked: 0,
      detached: 0,
      unknown: 0,
      skipped: 0,
    });
    vi.mocked(declineFaceRepair).mockResolvedValue({ created: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // ---- empty states ----

  it('shows "no scan" empty state when no scan has run', async () => {
    vi.mocked(getLatestScan).mockResolvedValue(null as unknown as object);
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_empty_no_scan')).toBeInTheDocument();
    });
  });

  it('shows "nothing to clean up" when completed scan has 0 flagged persons', async () => {
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan([]) as unknown as object);
    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_empty_clean')).toBeInTheDocument();
    });
  });

  // ---- scan states ----

  it('shows progress when scan is running', async () => {
    vi.mocked(getLatestScan).mockResolvedValue({
      id: 'scan-1',
      status: 'running',
      progress: { scanned: 400, total: 1000 },
      totals: null,
      persons: [],
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      createdAt: new Date().toISOString(),
    } as unknown as object);

    render(Page, { props: { data: makePageData() } });

    // Flush microtasks from onMount (the getLatestScan promise)
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.getByText('admin.face_cleanup_scan_running')).toBeInTheDocument();
    // Progress numbers are shown; use a regex match to be locale-flexible
    expect(screen.getByText(/400/)).toBeInTheDocument();
  });

  it('polls while scan is running and stops when completed', async () => {
    const runningScan = {
      id: 'scan-1',
      status: 'running',
      progress: { scanned: 500, total: 1000 },
      totals: null,
      persons: [],
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      createdAt: new Date().toISOString(),
    };
    const completedScan = makeCompletedScan([makeScanPerson()]);
    vi.mocked(getLatestScan)
      .mockResolvedValueOnce(runningScan as unknown as object)
      .mockResolvedValueOnce(runningScan as unknown as object)
      .mockResolvedValue(completedScan as unknown as object);

    render(Page, { props: { data: makePageData() } });

    // Initial load shows running
    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_scan_running')).toBeInTheDocument();
    });

    // Advance timer to trigger polls
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() => {
      // After polls complete, shows completed content
      expect(vi.mocked(getLatestScan).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows error state when scan failed', async () => {
    vi.mocked(getLatestScan).mockResolvedValue({
      id: 'scan-1',
      status: 'failed',
      progress: null,
      totals: null,
      persons: [],
      error: 'Some error occurred',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    } as unknown as object);

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_scan_failed')).toBeInTheDocument();
      expect(screen.getByText('Some error occurred')).toBeInTheDocument();
      expect(screen.getByText('admin.face_cleanup_retry_scan')).toBeInTheDocument();
    });
  });

  // ---- post-scan guidance ----
  // The console never told the admin what to do, nor that the confident clusters arrive pre-selected (making
  // its biggest button a bulk action over every one of them). The checklist's own copy and state matrix are
  // covered by ScanChecklist.spec.ts; here we only verify the page feeds it real scan state and wires its CTA.

  describe('What-to-do-now checklist', () => {
    it('renders after a scan, counting the review-first and confident clusters', async () => {
      const persons = [
        makeScanPerson({ personId: 'c1', recommendation: 'confident' }),
        makeScanPerson({ personId: 'c2', recommendation: 'confident' }),
        makeScanPerson({ personId: 'r1', recommendation: 'review-first', reviewReasons: ['named'] }),
      ];
      vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan(persons) as unknown as object);

      render(Page, { props: { data: makePageData() } });

      await waitFor(() => expect(screen.getByTestId('scan-checklist')).toBeInTheDocument());

      // 1 review-first, none opened yet; 2 confident, and those 2 are what the page has pre-selected.
      expect(screen.getByTestId('step-review')).toHaveAttribute('data-done', 'false');
      expect(screen.getByTestId('step-confident')).toHaveAttribute('data-inactive', 'false');
      expect(screen.getByTestId('step-apply')).toHaveAttribute('data-inactive', 'false');
    });

    it('is not rendered when the scan found nothing to clean up', async () => {
      vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan([]) as unknown as object);

      render(Page, { props: { data: makePageData() } });

      await waitFor(() => expect(screen.getByText('admin.face_cleanup_empty_clean')).toBeInTheDocument());
      expect(screen.queryByTestId('scan-checklist')).not.toBeInTheDocument();
    });
  });

  // ---- grouping ----

  it('renders review-first group before confident group regardless of input order', async () => {
    const persons = [
      makeScanPerson({ personId: 'c1', recommendation: 'confident' }),
      makeScanPerson({ personId: 'r1', recommendation: 'review-first', reviewReasons: ['named'] }),
    ];
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan(persons) as unknown as object);

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_group_review')).toBeInTheDocument();
      expect(screen.getByText('admin.face_cleanup_group_confident')).toBeInTheDocument();
    });

    const reviewHeader = screen.getByText('admin.face_cleanup_group_review');
    const confidentHeader = screen.getByText('admin.face_cleanup_group_confident');

    // review-first group should appear before confident group in DOM order
    expect(reviewHeader.compareDocumentPosition(confidentHeader)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  // ---- owner column ----

  it('renders the owning user name in the owner column (not a broken person thumbnail)', async () => {
    const owner = {
      id: 'owner1',
      name: 'Alice Owner',
      email: 'alice@example.com',
      profileImagePath: '',
      avatarColor: 'primary',
      profileChangedAt: new Date().toISOString(),
    };
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan([makeScanPerson()]) as unknown as object);

    render(Page, { props: { data: { users: [owner], meta: { title: 'Face cleanup' } } } });

    await waitFor(() => {
      expect(screen.getByText('Alice Owner')).toBeInTheDocument();
    });
  });

  // ---- checkbox state ----

  it('confident rows render pre-checked; review-first checkboxes render disabled', async () => {
    const persons = [
      makeScanPerson({ personId: 'c1', recommendation: 'confident' }),
      makeScanPerson({ personId: 'r1', recommendation: 'review-first', reviewReasons: ['named'] }),
    ];
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan(persons) as unknown as object);

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_group_confident')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // Find which is disabled (review-first) and which is checked (confident)
    const disabled = checkboxes.filter((cb) => cb.disabled);
    const checked = checkboxes.filter((cb) => cb.checked);

    expect(disabled).toHaveLength(1);
    expect(checked).toHaveLength(1);
  });

  // ---- selection count + Clear ----

  it('selection count reflects checkbox state and Clear empties it', async () => {
    const persons = [
      makeScanPerson({ personId: 'c1', recommendation: 'confident' }),
      makeScanPerson({
        personId: 'c2',
        recommendation: 'confident',
        ownerId: 'owner2',
        flagged: 20,
        flaggedFraction: 0.4,
      }),
    ];
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan(persons) as unknown as object);

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      // 2 selected initially
      expect(screen.getByText('admin.face_cleanup_selected')).toBeInTheDocument();
    });

    // Click Clear
    const clearBtn = screen.getByText('admin.face_cleanup_clear');
    await fireEvent.click(clearBtn);

    // After clear, selectedCount should be 0 — button should be disabled
    await waitFor(() => {
      const applyBtn = screen.getByText('admin.face_cleanup_apply');
      expect(applyBtn.closest('button')).toBeDisabled();
    });
  });

  // ---- bulk apply ----

  it('bulk-approve resolves each checked person, grouping its flagged faces by suspectedOwnerId', async () => {
    const persons = [makeScanPerson({ personId: 'c1', recommendation: 'confident' })];
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan(persons) as unknown as object);
    vi.mocked(getFaceRepairPersonFaces).mockResolvedValue({
      personId: 'c1',
      flaggedFaces: [
        { assetFaceId: 'f1', suspectedOwnerId: 'owner-a' },
        { assetFaceId: 'f2', suspectedOwnerId: 'owner-b' },
        { assetFaceId: 'f3', suspectedOwnerId: 'owner-a' },
      ],
    } as unknown as FaceRepairPersonFacesDto);

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_apply')).toBeInTheDocument();
    });

    const applyBtn = screen.getByText('admin.face_cleanup_apply');
    await fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(getFaceRepairPersonFaces).toHaveBeenCalledWith({ personId: 'c1' });
      expect(resolveFaces).toHaveBeenCalledWith({
        faceRepairResolveRequestDto: {
          personId: 'c1',
          moveToPerson: [
            { destinationPersonId: 'owner-a', faceIds: ['f1', 'f3'] },
            { destinationPersonId: 'owner-b', faceIds: ['f2'] },
          ],
        },
      });
    });
  });

  it('bulk-approve skips a selected person with zero flagged faces (no resolveFaces call, no error)', async () => {
    const persons = [
      makeScanPerson({ personId: 'c1', recommendation: 'confident' }),
      makeScanPerson({ personId: 'c2', recommendation: 'confident', ownerId: 'owner2' }),
    ];
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan(persons) as unknown as object);
    vi.mocked(getFaceRepairPersonFaces).mockImplementation((({ personId }: { personId: string }) =>
      Promise.resolve(
        personId === 'c1'
          ? { personId, flaggedFaces: [{ assetFaceId: 'f1', suspectedOwnerId: 'owner-a' }] }
          : { personId, flaggedFaces: [] },
      )) as typeof getFaceRepairPersonFaces);

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_apply')).toBeInTheDocument();
    });

    const applyBtn = screen.getByText('admin.face_cleanup_apply');
    await fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(resolveFaces).toHaveBeenCalledTimes(1);
      expect(resolveFaces).toHaveBeenCalledWith({
        faceRepairResolveRequestDto: {
          personId: 'c1',
          moveToPerson: [{ destinationPersonId: 'owner-a', faceIds: ['f1'] }],
        },
      });
      expect(toastManager.success).toHaveBeenCalled();
    });
  });

  // ---- apply 409 non-destructive ----

  it('apply 409 shows error non-destructively, keeps selection, no double-submit', async () => {
    const persons = [makeScanPerson({ personId: 'c1', recommendation: 'confident' })];
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan(persons) as unknown as object);

    let resolveApply!: () => void;
    vi.mocked(resolveFaces).mockReturnValueOnce(
      new Promise<never>((_, reject) => {
        resolveApply = () => reject(Object.assign(new Error('conflict'), { status: 409 }));
      }),
    );

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_apply')).toBeInTheDocument();
    });

    const applyBtn = screen.getByText('admin.face_cleanup_apply');

    // Start the apply (button becomes disabled while in-flight)
    await fireEvent.click(applyBtn);

    // While in-flight, button should be disabled (no double-submit)
    expect(applyBtn.closest('button')).toBeDisabled();

    // Resolve with 409
    resolveApply();

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_apply_conflict')).toBeInTheDocument();
    });

    // Button re-enabled with selection still intact
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes.some((cb) => cb.checked)).toBe(true);
  });

  // ---- Re-scan button ----

  it('clicking Re-scan calls triggerScan and starts polling', async () => {
    vi.mocked(getLatestScan).mockResolvedValue(null as unknown as object);
    vi.mocked(triggerScan).mockResolvedValue({ scanId: 'new-scan-id' });

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_rescan')).toBeInTheDocument();
    });

    const rescanBtn = screen.getByText('admin.face_cleanup_rescan');
    await fireEvent.click(rescanBtn);

    await waitFor(() => {
      expect(triggerScan).toHaveBeenCalled();
    });
  });

  // ---- stat strip ----

  it('renders stat strip with totals when scan is completed', async () => {
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan([makeScanPerson()]) as unknown as object);

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_stat_eligible')).toBeInTheDocument();
      expect(screen.getByText('admin.face_cleanup_stat_flagged')).toBeInTheDocument();
      expect(screen.getByText('admin.face_cleanup_stat_repaired')).toBeInTheDocument();
      expect(screen.getByText('admin.face_cleanup_stat_needs_decision')).toBeInTheDocument();
      expect(screen.getByText('admin.face_cleanup_stat_unattributable')).toBeInTheDocument();
    });
  });

  // ---- filters ----

  it('filter buttons are rendered when scan has results', async () => {
    const persons = [
      makeScanPerson({ personId: 'c1', recommendation: 'confident' }),
      makeScanPerson({ personId: 'r1', recommendation: 'review-first', reviewReasons: ['named'] }),
    ];
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan(persons) as unknown as object);

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText(/admin\.face_cleanup_filter_all/)).toBeInTheDocument();
      expect(screen.getByText(/admin\.face_cleanup_filter_review_first/)).toBeInTheDocument();
      expect(screen.getByText(/admin\.face_cleanup_filter_confident/)).toBeInTheDocument();
    });
  });

  // ---- dismiss (P2, E11) ----

  it('Dismiss reflects the server-removed person after a refetch, not just a client-side filter', async () => {
    const persons = [makeScanPerson({ personId: 'p1', recommendation: 'confident' })];
    // First call (onMount) sees the person; the server call itself drains the latest scan (covered by the
    // service-layer M9 medium test), so the SECOND call (the post-dismiss refetch this page must trigger)
    // returns a snapshot that already omits it.
    vi.mocked(getLatestScan)
      .mockResolvedValueOnce(makeCompletedScan(persons) as unknown as object)
      .mockResolvedValueOnce(makeCompletedScan([]) as unknown as object);
    vi.mocked(declineFaceRepair).mockResolvedValue({ created: 1 });
    vi.stubGlobal('confirm', () => true);

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByTestId('dismiss-btn')).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByTestId('dismiss-btn'));

    await waitFor(() => {
      expect(declineFaceRepair).toHaveBeenCalledWith({
        faceRepairDeclineRequestDto: { persons: [{ personId: 'p1', suspectedOwnerIds: ['owner-person'] }] },
      });
    });

    // Driven by the server response: the page refetches getLatestScan after the dismiss resolves, and the
    // dismissed person is gone because the SERVER already drained it, not because of a client-only filter.
    await waitFor(() => {
      expect(getLatestScan).toHaveBeenCalledTimes(2);
      expect(screen.getByText('admin.face_cleanup_empty_clean')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('dismiss-btn')).not.toBeInTheDocument();
  });

  // ---- D17: a failed INITIAL load must not render as the reassuring "no scan yet" empty state ----

  it('shows a load-error state (not the empty state) when the initial scan fetch fails, and Retry re-fetches', async () => {
    vi.mocked(getLatestScan).mockRejectedValueOnce(new Error('network down'));

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByTestId('load-error-banner')).toBeInTheDocument();
    });
    expect(screen.queryByText('admin.face_cleanup_empty_no_scan')).not.toBeInTheDocument();

    vi.mocked(getLatestScan).mockResolvedValueOnce(null as unknown as object);
    await fireEvent.click(screen.getByTestId('load-error-retry'));

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_empty_no_scan')).toBeInTheDocument();
      expect(screen.queryByTestId('load-error-banner')).not.toBeInTheDocument();
    });
  });

  it('does NOT show the load-error state for a transient poll failure once the initial load succeeded', async () => {
    const runningScan = {
      id: 'scan-1',
      status: 'running',
      progress: { scanned: 500, total: 1000 },
      totals: null,
      persons: [],
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      createdAt: new Date().toISOString(),
    };
    vi.mocked(getLatestScan)
      .mockResolvedValueOnce(runningScan as unknown as object) // initial load: succeeds
      .mockRejectedValueOnce(new Error('blip')); // first poll: transient failure

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => expect(screen.getByText('admin.face_cleanup_scan_running')).toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() => expect(getLatestScan).toHaveBeenCalledTimes(2));
    // Still showing the running-scan state, not a load-error banner, despite the poll blip.
    expect(screen.getByText('admin.face_cleanup_scan_running')).toBeInTheDocument();
    expect(screen.queryByTestId('load-error-banner')).not.toBeInTheDocument();
  });

  // ---- D8/D17: bulk-apply must refetch even when one of several selected persons fails (partial failure) ----

  it('refetches the scan even when one of several selected persons fails to apply (partial failure)', async () => {
    const persons = [
      makeScanPerson({ personId: 'c1', recommendation: 'confident' }),
      makeScanPerson({ personId: 'c2', recommendation: 'confident', ownerId: 'owner2' }),
    ];
    vi.mocked(getLatestScan).mockResolvedValue(makeCompletedScan(persons) as unknown as object);
    vi.mocked(getFaceRepairPersonFaces).mockImplementation((({ personId }: { personId: string }) =>
      Promise.resolve({
        personId,
        flaggedFaces: [{ assetFaceId: `f-${personId}`, suspectedOwnerId: 'owner-a' }],
      })) as typeof getFaceRepairPersonFaces);
    vi.mocked(resolveFaces).mockImplementation((({
      faceRepairResolveRequestDto,
    }: {
      faceRepairResolveRequestDto: { personId: string };
    }) =>
      faceRepairResolveRequestDto.personId === 'c2'
        ? Promise.reject(Object.assign(new Error('boom'), { status: 500 }))
        : Promise.resolve({
            moved: 1,
            declined: 0,
            locked: 0,
            detached: 0,
            unknown: 0,
            skipped: 0,
          })) as typeof resolveFaces);

    render(Page, { props: { data: makePageData() } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_apply')).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByText('admin.face_cleanup_apply'));

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_apply_error')).toBeInTheDocument();
    });
    // The table still refreshes on a partial failure — today's code skips the refetch entirely on any throw.
    expect(getLatestScan).toHaveBeenCalledTimes(2);
  });
});
