import { getFaceRepairResolutions, removeFaceRepairResolutions } from '@immich/sdk';
import { toastManager } from '@immich/ui';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

// Slice 7 (unified resolutions manage page): replaces the declines-only manage page. Lists soft-declines AND
// locks, each tagged `kind`, grouped into two undoable sections (Declines / Locks).
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

const DECLINE_ROW = {
  kind: 'decline',
  id: 'decline-1',
  type: 'face',
  assetFaceId: 'face-1',
  suspectedOwnerId: 'owner-1',
  suspectedOwnerName: 'Berta',
  suspectedOwnerThumbnailFaceId: null,
  personId: 'person-1',
  personName: 'Jula',
  personThumbnailFaceId: null,
  createdAt: '2026-07-01T00:00:00.000Z',
};

const LOCK_ROW = {
  kind: 'lock',
  id: 'lock-1',
  type: null,
  assetFaceId: 'face-2',
  suspectedOwnerId: null,
  suspectedOwnerName: null,
  suspectedOwnerThumbnailFaceId: null,
  personId: 'person-2',
  personName: 'Armin',
  personThumbnailFaceId: null,
  createdAt: '2026-07-02T00:00:00.000Z',
};

describe('+page.svelte (face-cleanup resolutions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFaceRepairResolutions).mockResolvedValue({
      resolutions: [DECLINE_ROW, LOCK_ROW],
    } as unknown as Awaited<ReturnType<typeof getFaceRepairResolutions>>);
    vi.mocked(removeFaceRepairResolutions).mockResolvedValue({ removed: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the decline row under the Declines section and the lock row under the Locks section', async () => {
    render(Page, { props: { data: { meta: { title: 'Resolutions' } } } });

    await waitFor(() => {
      expect(screen.getByTestId('declines-section')).toBeInTheDocument();
      expect(screen.getByTestId('locks-section')).toBeInTheDocument();
    });

    const declinesSection = screen.getByTestId('declines-section');
    const locksSection = screen.getByTestId('locks-section');

    const declineRows = within(declinesSection).getAllByTestId('resolution-row');
    expect(declineRows).toHaveLength(1);
    expect(declineRows[0]).toHaveAttribute('data-kind', 'decline');
    expect(within(declineRows[0]).getByText('Jula')).toBeInTheDocument();
    expect(within(declineRows[0]).getByText('Berta')).toBeInTheDocument();

    const lockRows = within(locksSection).getAllByTestId('resolution-row');
    expect(lockRows).toHaveLength(1);
    expect(lockRows[0]).toHaveAttribute('data-kind', 'lock');
    expect(within(lockRows[0]).getByText('admin.face_cleanup_resolutions_locked_to')).toBeInTheDocument();
  });

  it('colors the Declines heading green and the Locks heading violet, matching the review-page state chips', async () => {
    render(Page, { props: { data: { meta: { title: 'Resolutions' } } } });

    await waitFor(() => expect(screen.getByTestId('declines-section')).toBeInTheDocument());

    const declineSwatch = screen.getByTestId('declines-section').querySelector('span');
    const lockSwatch = screen.getByTestId('locks-section').querySelector('span');

    expect(declineSwatch).toHaveStyle({ background: '#16a34a' });
    expect(lockSwatch).toHaveStyle({ background: '#7c3aed' });
  });

  it('undoing a decline row posts removeFaceRepairResolutions with declineIds and refreshes the list', async () => {
    render(Page, { props: { data: { meta: { title: 'Resolutions' } } } });

    await waitFor(() => expect(screen.getAllByTestId('resolution-row')).toHaveLength(2));

    const declineRow = within(screen.getByTestId('declines-section')).getByTestId('resolution-row');
    await fireEvent.click(within(declineRow).getByTestId('undo-button'));

    await waitFor(() => {
      expect(removeFaceRepairResolutions).toHaveBeenCalledWith({
        faceRepairResolutionsRemoveRequestDto: { declineIds: ['decline-1'] },
      });
      expect(toastManager.success).toHaveBeenCalled();
      // refreshes the list after undo
      expect(getFaceRepairResolutions).toHaveBeenCalledTimes(2);
    });
  });

  it('undoing a lock row posts removeFaceRepairResolutions with lockIds', async () => {
    render(Page, { props: { data: { meta: { title: 'Resolutions' } } } });

    await waitFor(() => expect(screen.getAllByTestId('resolution-row')).toHaveLength(2));

    const lockRow = within(screen.getByTestId('locks-section')).getByTestId('resolution-row');
    await fireEvent.click(within(lockRow).getByTestId('undo-button'));

    await waitFor(() => {
      expect(removeFaceRepairResolutions).toHaveBeenCalledWith({
        faceRepairResolutionsRemoveRequestDto: { lockIds: ['lock-1'] },
      });
    });
  });

  it('shows the empty state when there are no resolutions', async () => {
    vi.mocked(getFaceRepairResolutions).mockResolvedValue({ resolutions: [] } as unknown as Awaited<
      ReturnType<typeof getFaceRepairResolutions>
    >);

    render(Page, { props: { data: { meta: { title: 'Resolutions' } } } });

    await waitFor(() => {
      expect(screen.getByText('admin.face_cleanup_resolutions_empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('declines-section')).not.toBeInTheDocument();
  });
});
