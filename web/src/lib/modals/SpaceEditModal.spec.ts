import { UserAvatarColor, type SharedSpaceResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
// userEvent (not fireEvent) for the submit button: it dispatches the full pointer/click sequence
// that actually triggers form submission in happy-dom. PersonEditBirthDateModal.spec does the same.
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SpaceEditModal from './SpaceEditModal.svelte';

const updateSpaceDetailsMock = vi.hoisted(() => vi.fn());
vi.mock('$lib/services/space.service', () => ({ updateSpaceDetails: updateSpaceDetailsMock }));

const space = (o: Partial<SharedSpaceResponseDto> = {}): SharedSpaceResponseDto =>
  ({
    id: 's1',
    name: 'Family Trip',
    description: 'Our holiday photos',
    color: UserAvatarColor.Blue,
    ...o,
  }) as never;

// Queries pinned to data-testid, not labels: @immich/ui's Field/Label wiring uses
// aria-labelledby, which happy-dom does not reliably associate (PersonEditBirthDateModal.spec
// resorts to a raw document.querySelector for the same reason).
const nameInput = () => screen.getByTestId('space-edit-name') as HTMLInputElement;
const descriptionInput = () => screen.getByTestId('space-edit-description') as HTMLTextAreaElement;
// "Save" is capitalised because FormModal's submitText comes from @immich/ui's OWN translation
// service (dist/services/translation.svelte.js → `save: 'Save'`), not svelte-i18n — so it is real
// English here, unlike the raw i18n keys ('spaces_edit', 'name') that svelte-i18n yields in tests.
const saveButton = () => screen.getByRole('button', { name: 'Save' });

beforeEach(() => {
  vi.clearAllMocks();
  updateSpaceDetailsMock.mockResolvedValue(true);
});

describe('SpaceEditModal', () => {
  it('prefills every field from the space', () => {
    render(SpaceEditModal, { space: space(), onClose: vi.fn() });

    expect(nameInput()).toHaveValue('Family Trip');
    expect(descriptionInput()).toHaveValue('Our holiday photos');
    expect(screen.getByTestId('color-swatch-blue')).toBeInTheDocument();
  });

  it('treats a null description as an empty field rather than the string "null"', () => {
    render(SpaceEditModal, { space: space({ description: null }), onClose: vi.fn() });

    expect(descriptionInput()).toHaveValue('');
  });

  it('saves the edited name and closes with true', async () => {
    const onClose = vi.fn();
    render(SpaceEditModal, { space: space(), onClose });

    await fireEvent.input(nameInput(), { target: { value: 'Renamed Trip' } });
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(updateSpaceDetailsMock).toHaveBeenCalledWith('s1', {
        name: 'Renamed Trip',
        description: 'Our holiday photos',
        color: UserAvatarColor.Blue,
      });
    });
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it('trims surrounding whitespace from the name before sending', async () => {
    render(SpaceEditModal, { space: space(), onClose: vi.fn() });

    await fireEvent.input(nameInput(), { target: { value: '  Padded Name  ' } });
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(updateSpaceDetailsMock).toHaveBeenCalledWith('s1', expect.objectContaining({ name: 'Padded Name' }));
    });
  });

  it('sends an emptied description as an empty string, not undefined', async () => {
    render(SpaceEditModal, { space: space(), onClose: vi.fn() });

    await fireEvent.input(descriptionInput(), { target: { value: '' } });
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(updateSpaceDetailsMock).toHaveBeenCalledWith('s1', expect.objectContaining({ description: '' }));
    });
  });

  it('sends the selected color', async () => {
    render(SpaceEditModal, { space: space(), onClose: vi.fn() });

    // Targeted by data-testid, not aria-label: the ColorPicker's labels are raw lowercase
    // enum values, a pre-existing a11y wart this component does not own.
    await fireEvent.click(screen.getByTestId('color-swatch-green'));
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(updateSpaceDetailsMock).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ color: UserAvatarColor.Green }),
      );
    });
  });

  it('submits unchanged values without error', async () => {
    const onClose = vi.fn();
    render(SpaceEditModal, { space: space(), onClose });

    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(updateSpaceDetailsMock).toHaveBeenCalledWith('s1', {
        name: 'Family Trip',
        description: 'Our holiday photos',
        color: UserAvatarColor.Blue,
      });
    });
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it('disables save for an empty name', async () => {
    render(SpaceEditModal, { space: space(), onClose: vi.fn() });

    await fireEvent.input(nameInput(), { target: { value: '' } });

    expect(saveButton()).toBeDisabled();
  });

  it('disables save for a whitespace-only name, which native `required` would let through', async () => {
    render(SpaceEditModal, { space: space(), onClose: vi.fn() });

    await fireEvent.input(nameInput(), { target: { value: '   ' } });

    expect(saveButton()).toBeDisabled();
  });

  it('re-enables save once a valid name is restored', async () => {
    render(SpaceEditModal, { space: space(), onClose: vi.fn() });

    await fireEvent.input(nameInput(), { target: { value: '' } });
    expect(saveButton()).toBeDisabled();

    await fireEvent.input(nameInput(), { target: { value: 'Back' } });
    expect(saveButton()).not.toBeDisabled();
  });

  it('caps the inputs at the server bounds so an over-length value cannot be submitted', () => {
    render(SpaceEditModal, { space: space(), onClose: vi.fn() });

    expect(nameInput()).toHaveAttribute('maxlength', '100');
    expect(descriptionInput()).toHaveAttribute('maxlength', '500');
  });

  it('selects the existing name on first focus so typing replaces it', async () => {
    render(SpaceEditModal, { space: space(), onClose: vi.fn() });

    const input = nameInput();
    await fireEvent.focus(input);

    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Family Trip'.length);
  });

  it('stays open when the save fails', async () => {
    updateSpaceDetailsMock.mockResolvedValue(false);
    const onClose = vi.fn();
    render(SpaceEditModal, { space: space(), onClose });

    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(updateSpaceDetailsMock).toHaveBeenCalled();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
