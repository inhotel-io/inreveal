import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from '$lib/route';
import ReviewFirstLane from './ReviewFirstLane.svelte';
import type { FaceCleanupPerson } from './scan-triage.svelte';

// The review-first lane: a clickable list of clusters the scan could not decide on its own. Each row is an
// <a> to the per-cluster review page (which commits inline); a hover ⋯/dismiss drops one without opening.
// Mocks match the sibling face-cleanup specs (Icon → noop, $t → key passthrough that DROPS {values}).

vi.mock('@immich/ui', async (orig) => {
  const mod = await orig<typeof import('@immich/ui')>();
  const noop = await import('@test-data/mocks/noop-component.svelte');
  return { ...mod, Icon: noop.default };
});
vi.mock('svelte-i18n', async (orig) => {
  const actual = await orig<typeof import('svelte-i18n')>();
  return {
    ...actual,
    t: {
      subscribe: (run: (fn: (k: string, o?: unknown) => string) => void) => {
        run((k: string) => k);
        return () => {};
      },
    },
  };
});
vi.mock('$lib/utils/people-utils', () => ({
  getAdminFaceThumbnailUrl: (id: string) => `/thumb/${id}`,
  getPeopleThumbnailPath: (id: string) => `/people/${id}/thumbnail`,
}));

beforeEach(() =>
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  ),
);
afterEach(() => vi.unstubAllGlobals());

const rev = (over: Partial<FaceCleanupPerson> & Pick<FaceCleanupPerson, 'personId'>): FaceCleanupPerson => ({
  ownerId: 'owner-1',
  personName: null,
  faceCount: 35,
  thumbnailFaceId: 't',
  eligible: 35,
  flagged: 20,
  flaggedFraction: 0.57,
  suspectedOwners: [{ ownerPersonId: 'd', ownerName: 'Pierre', thumbnailFaceId: 'f', count: 20 }],
  recommendation: 'review-first',
  reviewReasons: ['over-cap'],
  ...over,
});
const users = [
  {
    id: 'owner-1',
    name: 'Owner One',
    email: 'o@e.com',
    profileImagePath: '',
    avatarColor: 'primary',
    profileChangedAt: '',
  },
] as never;

describe('ReviewFirstLane', () => {
  it('renders nothing when there is nothing to review', () => {
    render(ReviewFirstLane, { props: { people: [], users, onDismiss: vi.fn() } });
    expect(screen.queryByTestId('review-lane')).not.toBeInTheDocument();
  });

  it('renders each cluster as a row that links to its review page and shows the face count', () => {
    render(ReviewFirstLane, { props: { people: [rev({ personId: 'r1' })], users, onDismiss: vi.fn() } });
    const row = screen.getByTestId('review-row-r1');
    expect(row).toHaveAttribute('href', Route.viewFaceCleanupPerson({ id: 'r1' }));
    expect(row).toHaveTextContent('35');
  });

  it('dismiss button calls onDismiss for that cluster (after confirm)', async () => {
    const onDismiss = vi.fn();
    render(ReviewFirstLane, { props: { people: [rev({ personId: 'r1' })], users, onDismiss } });
    await fireEvent.click(screen.getByTestId('review-dismiss-r1'));
    expect(onDismiss).toHaveBeenCalledWith('r1');
  });

  it('does not call onDismiss when the confirm is declined', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    const onDismiss = vi.fn();
    render(ReviewFirstLane, { props: { people: [rev({ personId: 'r1' })], users, onDismiss } });
    await fireEvent.click(screen.getByTestId('review-dismiss-r1'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('search filters rows by person name or suspected-owner name', async () => {
    render(ReviewFirstLane, {
      props: {
        people: [rev({ personId: 'r1', personName: 'Alice' }), rev({ personId: 'r2', personName: 'Bob' })],
        users,
        onDismiss: vi.fn(),
      },
    });
    await fireEvent.input(screen.getByTestId('review-search'), { target: { value: 'alice' } });
    expect(screen.getByTestId('review-row-r1')).toBeInTheDocument();
    expect(screen.queryByTestId('review-row-r2')).not.toBeInTheDocument();
  });

  it('marks a bad-target row as a weak/uncertain destination', () => {
    render(ReviewFirstLane, {
      props: { people: [rev({ personId: 'r1', reviewReasons: ['bad-target'] })], users, onDismiss: vi.fn() },
    });
    expect(screen.getByTestId('review-row-r1')).toHaveTextContent('admin.face_cleanup_bad_target');
  });
});
