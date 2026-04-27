import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { SharedSpaceRole, type SharedSpacePersonResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { DateTime } from 'luxon';
import SpacePersonProfile from './space-person-profile.svelte';

vi.mock('@immich/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@immich/ui')>();
  return {
    ...original,
    toastManager: { primary: vi.fn(), success: vi.fn(), warning: vi.fn() },
  };
});

const makePerson = (overrides: Partial<SharedSpacePersonResponseDto> = {}): SharedSpacePersonResponseDto =>
  ({
    id: 'p1',
    spaceId: 'space-1',
    name: 'Alice Johnson',
    alias: null,
    birthDate: null,
    assetCount: 3,
    faceCount: 4,
    isHidden: false,
    thumbnailPath: '/thumb.jpg',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }) as SharedSpacePersonResponseDto;

function renderProfile({
  person = makePerson(),
  role = SharedSpaceRole.Editor,
  onPersonChange = vi.fn(),
}: {
  person?: SharedSpacePersonResponseDto;
  role?: SharedSpaceRole;
  onPersonChange?: (person: SharedSpacePersonResponseDto) => void;
} = {}) {
  return {
    onPersonChange,
    ...render(SpacePersonProfile, {
      props: {
        spaceId: 'space-1',
        person,
        canEditBirthDate: role === SharedSpaceRole.Owner || role === SharedSpaceRole.Editor,
        onPersonChange,
      },
    }),
  };
}

describe('SpacePersonProfile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows alias as primary name and canonical name as secondary text', () => {
    renderProfile({ person: makePerson({ alias: 'Mom' }) });

    expect(screen.getByRole('heading', { name: 'Mom' })).toBeInTheDocument();
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
  });

  it('saves a non-empty alias through setSpacePersonAlias and notifies parent', async () => {
    const person = makePerson();
    const { onPersonChange } = renderProfile({ person });
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText('spaces_set_alias'));
    await user.type(screen.getByLabelText('spaces_set_alias'), '  Aunt Alice  ');
    await user.click(screen.getByTestId('save-alias-button'));

    await waitFor(() => {
      expect(sdkMock.setSpacePersonAlias).toHaveBeenCalledWith({
        id: 'space-1',
        personId: 'p1',
        sharedSpacePersonAliasDto: { alias: 'Aunt Alice' },
      });
    });
    expect(onPersonChange).toHaveBeenCalledWith({ ...person, alias: 'Aunt Alice' });
  });

  it('clears alias through deleteSpacePersonAlias and notifies parent', async () => {
    const person = makePerson({ alias: 'Mom' });
    const { onPersonChange } = renderProfile({ person });
    const user = userEvent.setup();

    await user.click(screen.getByTestId('clear-alias-button'));

    await waitFor(() => {
      expect(sdkMock.deleteSpacePersonAlias).toHaveBeenCalledWith({ id: 'space-1', personId: 'p1' });
    });
    expect(onPersonChange).toHaveBeenCalledWith({ ...person, alias: null });
  });

  it('allows viewers to save an alias', async () => {
    const person = makePerson();
    const { onPersonChange } = renderProfile({ person, role: SharedSpaceRole.Viewer });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('spaces_set_alias'), 'Friend');
    await user.click(screen.getByTestId('save-alias-button'));

    await waitFor(() => {
      expect(sdkMock.setSpacePersonAlias).toHaveBeenCalledWith({
        id: 'space-1',
        personId: 'p1',
        sharedSpacePersonAliasDto: { alias: 'Friend' },
      });
    });
    expect(onPersonChange).toHaveBeenCalledWith({ ...person, alias: 'Friend' });
  });

  it('shows birthdate using localized date formatting', () => {
    const birthDate = '1990-06-15';
    const expectedDate = DateTime.fromISO(birthDate).toLocaleString({
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    });

    renderProfile({ person: makePerson({ birthDate }) });

    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });

  it('lets editors save and clear birthdate through updateSpacePerson', async () => {
    const person = makePerson({ birthDate: '1990-06-15' });
    const savedPerson = { ...person, birthDate: '1991-07-16' };
    const clearedPerson = { ...savedPerson, birthDate: null };
    sdkMock.updateSpacePerson.mockResolvedValueOnce(savedPerson).mockResolvedValueOnce(clearedPerson);
    const { onPersonChange } = renderProfile({ person, role: SharedSpaceRole.Editor });
    const user = userEvent.setup();

    const birthDateInput = screen.getByLabelText('set_date_of_birth');
    await fireEvent.input(birthDateInput, { target: { value: '1991-07-16' } });
    await fireEvent.blur(birthDateInput);
    await user.click(screen.getByTestId('save-birthdate-button'));

    await waitFor(() => {
      expect(sdkMock.updateSpacePerson).toHaveBeenCalledWith({
        id: 'space-1',
        personId: 'p1',
        sharedSpacePersonUpdateDto: { birthDate: '1991-07-16' },
      });
    });
    expect(onPersonChange).toHaveBeenCalledWith(savedPerson);

    await user.click(screen.getByTestId('clear-birthdate-button'));

    await waitFor(() => {
      expect(sdkMock.updateSpacePerson).toHaveBeenLastCalledWith({
        id: 'space-1',
        personId: 'p1',
        sharedSpacePersonUpdateDto: { birthDate: '' },
      });
    });
    expect(onPersonChange).toHaveBeenLastCalledWith(clearedPerson);
  });

  it('hides birthdate editor from viewers while keeping the display visible', () => {
    const birthDate = '1990-06-15';
    const expectedDate = DateTime.fromISO(birthDate).toLocaleString({
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    });

    renderProfile({ person: makePerson({ birthDate }), role: SharedSpaceRole.Viewer });

    expect(screen.getByText(expectedDate)).toBeInTheDocument();
    expect(screen.queryByLabelText('set_date_of_birth')).not.toBeInTheDocument();
    expect(screen.queryByTestId('save-birthdate-button')).not.toBeInTheDocument();
  });
});
