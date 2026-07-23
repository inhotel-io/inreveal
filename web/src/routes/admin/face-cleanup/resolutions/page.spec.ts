import { getFaceRepairResolutions, removeFaceRepairResolutions } from '@immich/sdk';
import { toastManager } from '@immich/ui';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

// Unified resolutions manage page: NEGATIVE verdicts only ("this face is not that person"), from BOTH
// engines, with a source filter. Human placements are not listed here (undone in context on the review page).
vi.mock('@immich/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@immich/sdk')>();
  return {
    ...actual,
    getFaceRepairResolutions: vi.fn(),
    removeFaceRepairResolutions: vi.fn(),
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

// Mock svelte-i18n: return the key as the translation (matches the sibling face-cleanup specs).
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
      run({ url: new URL('http://localhost/admin/face-cleanup/resolutions') });
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

// ---- fixtures ----

const CLEANUP_ROW = {
  id: 'verdict-1',
  assetFaceId: 'face-1',
  status: 'rejected',
  source: 'cleanup',
  personId: 'person-1',
  personName: 'Berta',
  personThumbnailFaceId: null,
  spacePersonId: null,
  spacePersonName: null,
  spaceName: null,
  actorId: 'admin-1',
  actorName: 'Admin',
  createdAt: '2026-07-01T00:00:00.000Z',
};

const SUGGESTION_ROW = {
  id: 'verdict-2',
  assetFaceId: 'face-2',
  status: 'ignored',
  source: 'suggestion',
  personId: 'person-2',
  personName: 'Armin',
  personThumbnailFaceId: null,
  spacePersonId: null,
  spacePersonName: null,
  spaceName: null,
  actorId: 'user-1',
  actorName: 'Jula',
  createdAt: '2026-07-02T00:00:00.000Z',
};

// A verdict recorded against a shared-space person, never a personal person — must render with the space
// named (D15 1.4a).
const SPACE_PERSON_ROW = {
  id: 'verdict-3',
  assetFaceId: 'face-3',
  status: 'rejected',
  source: 'cleanup',
  personId: null,
  personName: null,
  personThumbnailFaceId: null,
  spacePersonId: 'space-person-1',
  spacePersonName: 'Casper',
  spaceName: 'Family Trip',
  actorId: 'admin-1',
  actorName: 'Admin',
  createdAt: '2026-07-03T00:00:00.000Z',
};

// A fully-orphaned verdict: the suspected owner AND its identity were both GC'd/degraded away after the
// verdict was recorded (personId + spacePersonId both SET NULL, no identity survives either) — the row must
// still render as a valid row (falling back to "unnamed"), never throw (D15 1.4b).
const ORPHANED_ROW = {
  id: 'verdict-4',
  assetFaceId: 'face-4',
  status: 'ignored',
  source: 'suggestion',
  personId: null,
  personName: null,
  personThumbnailFaceId: null,
  spacePersonId: null,
  spacePersonName: null,
  spaceName: null,
  actorId: null,
  actorName: null,
  createdAt: '2026-07-04T00:00:00.000Z',
};

describe('+page.svelte (face-cleanup resolutions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFaceRepairResolutions).mockResolvedValue({
      resolutions: [CLEANUP_ROW, SUGGESTION_ROW],
    } as unknown as Awaited<ReturnType<typeof getFaceRepairResolutions>>);
    vi.mocked(removeFaceRepairResolutions).mockResolvedValue({ removed: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists verdicts from both engines with their source and target', async () => {
    render(Page, { props: { data: { meta: { title: 'Resolutions' } } } });

    await waitFor(() => expect(screen.getAllByTestId('resolution-row')).toHaveLength(2));

    const rows = screen.getAllByTestId('resolution-row');
    expect(rows.map((r) => r.dataset.source).sort()).toEqual(['cleanup', 'suggestion']);
    // Every row renders a "not <target>" label (both rows here).
    expect(screen.getAllByText('admin.face_cleanup_resolutions_not_person')).toHaveLength(2);
    // No locks section survives.
    expect(screen.queryByTestId('locks-section')).not.toBeInTheDocument();
  });

  it('renders a space-person verdict with its space named, and a fully-orphaned verdict as a valid row', async () => {
    vi.mocked(getFaceRepairResolutions).mockResolvedValue({
      resolutions: [SPACE_PERSON_ROW, ORPHANED_ROW],
    } as unknown as Awaited<ReturnType<typeof getFaceRepairResolutions>>);

    render(Page, { props: { data: { meta: { title: 'Resolutions' } } } });

    await waitFor(() => expect(screen.getAllByTestId('resolution-row')).toHaveLength(2));

    const rows = screen.getAllByTestId('resolution-row');
    const spacePersonRow = rows.find((r) => r.dataset.source === 'cleanup')!;
    const orphanedRow = rows.find((r) => r.dataset.source === 'suggestion')!;

    // (a) space-person row: target name resolves to the space person, and the space is named alongside it.
    expect(within(spacePersonRow).getByText('admin.face_cleanup_resolutions_not_person')).toBeInTheDocument();
    expect(within(spacePersonRow).getByText('admin.face_cleanup_resolutions_in_space')).toBeInTheDocument();

    // (b) fully-orphaned row: no crash, renders as a valid row falling back to "unnamed".
    expect(within(orphanedRow).getByText('admin.face_cleanup_resolutions_not_person')).toBeInTheDocument();
  });

  it('filters by source', async () => {
    render(Page, { props: { data: { meta: { title: 'Resolutions' } } } });

    await waitFor(() => expect(screen.getAllByTestId('resolution-row')).toHaveLength(2));

    const cleanupFilter = screen.getAllByTestId('source-filter-option').find((el) => el.dataset.value === 'cleanup')!;
    await fireEvent.click(cleanupFilter);

    await waitFor(() => {
      const rows = screen.getAllByTestId('resolution-row');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveAttribute('data-source', 'cleanup');
    });
  });

  it('undoing a row posts removeFaceRepairResolutions with verdictIds and refreshes', async () => {
    render(Page, { props: { data: { meta: { title: 'Resolutions' } } } });

    await waitFor(() => expect(screen.getAllByTestId('resolution-row')).toHaveLength(2));

    const firstRow = screen.getAllByTestId('resolution-row')[0];
    await fireEvent.click(within(firstRow).getByTestId('undo-button'));

    await waitFor(() => {
      expect(removeFaceRepairResolutions).toHaveBeenCalledWith({
        faceRepairResolutionsRemoveRequestDto: {
          verdictIds: [firstRow.dataset.source === 'cleanup' ? 'verdict-1' : 'verdict-2'],
        },
      });
      expect(toastManager.success).toHaveBeenCalled();
      expect(getFaceRepairResolutions).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the empty state when there are no verdicts', async () => {
    vi.mocked(getFaceRepairResolutions).mockResolvedValue({ resolutions: [] } as unknown as Awaited<
      ReturnType<typeof getFaceRepairResolutions>
    >);

    render(Page, { props: { data: { meta: { title: 'Resolutions' } } } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_resolutions_empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('resolution-row')).not.toBeInTheDocument();
  });

  // ---- D17: a failed INITIAL load must not render as the reassuring "no verdicts" empty state ----

  it('shows a load-error state (not the empty state) when the initial fetch fails, and Retry re-fetches', async () => {
    vi.mocked(getFaceRepairResolutions).mockRejectedValueOnce(new Error('network down'));

    render(Page, { props: { data: { meta: { title: 'Resolutions' } } } });

    await waitFor(() => {
      expect(screen.getByTestId('load-error-banner')).toBeInTheDocument();
    });
    expect(screen.queryByText('admin.face_cleanup_resolutions_empty')).not.toBeInTheDocument();

    vi.mocked(getFaceRepairResolutions).mockResolvedValueOnce({
      resolutions: [CLEANUP_ROW, SUGGESTION_ROW],
    } as unknown as Awaited<ReturnType<typeof getFaceRepairResolutions>>);
    await fireEvent.click(screen.getByTestId('load-error-retry'));

    await waitFor(() => {
      expect(screen.getAllByTestId('resolution-row')).toHaveLength(2);
      expect(screen.queryByTestId('load-error-banner')).not.toBeInTheDocument();
    });
  });
});
