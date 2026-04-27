import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { mdiHeart, mdiPaw } from '@mdi/js';
import PersonTileWrapper from './person-tile.test-wrapper.svelte';
import type { ManagedPerson } from './people-types';

const basePerson = (overrides: Partial<ManagedPerson> = {}): ManagedPerson => ({
  id: 'person-1',
  displayName: 'Ada Lovelace',
  thumbnailUrl: '/api/people/person-1/thumbnail',
  href: '/people/person-1',
  isHidden: false,
  ...overrides,
});

const hasIconPath = (container: HTMLElement, path: string) =>
  [...container.querySelectorAll('path')].some((element) => element.getAttribute('d') === path);

describe('PersonTile', () => {
  it('renders link, thumbnail title, favorite badge, pet badge, and footer slot', () => {
    const { container } = render(PersonTileWrapper, {
      props: {
        person: basePerson({
          displayName: 'Mochi',
          isFavorite: true,
          type: 'pet',
          species: 'cat',
        }),
        showFooter: true,
      },
    });

    expect(screen.getByRole('link')).toHaveAttribute('href', '/people/person-1');
    expect(screen.getByTitle('Mochi')).toHaveAttribute('src', '/api/people/person-1/thumbnail');
    expect(hasIconPath(container, mdiHeart)).toBe(true);
    expect(hasIconPath(container, mdiPaw)).toBe(true);
    expect(screen.getByTitle('cat')).toBeInTheDocument();
    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });

  it('renders action menu slot only on hover when provided', async () => {
    render(PersonTileWrapper, {
      props: {
        person: basePerson(),
        showActionMenu: true,
      },
    });

    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();

    await fireEvent.mouseEnter(screen.getByRole('group'));

    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();

    await fireEvent.mouseLeave(screen.getByRole('group'));

    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('does not render action menu slot when actions are disabled', async () => {
    render(PersonTileWrapper, {
      props: {
        person: basePerson(),
        showActionMenu: false,
      },
    });

    await fireEvent.mouseEnter(screen.getByRole('group'));

    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('does not render favorite or pet badges when person does not qualify', () => {
    const { container } = render(PersonTileWrapper, {
      props: {
        person: basePerson(),
        showFooter: true,
      },
    });

    expect(hasIconPath(container, mdiHeart)).toBe(false);
    expect(hasIconPath(container, mdiPaw)).toBe(false);
  });
});
