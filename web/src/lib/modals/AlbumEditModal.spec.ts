import { type AlbumResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { Settings } from 'luxon';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AlbumEditModal from './AlbumEditModal.svelte';

const handleUpdateAlbumMock = vi.hoisted(() => vi.fn());
vi.mock('$lib/services/album.service', () => ({ handleUpdateAlbum: handleUpdateAlbumMock }));

const originalZone = Settings.defaultZone;

const album = (o: Partial<AlbumResponseDto> = {}): AlbumResponseDto =>
  ({
    id: 'a1',
    albumName: 'Summer',
    description: 'Trip',
    createdAt: '1996-06-15T12:30:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    albumUsers: [],
    ...o,
  }) as never;

const createdAtInput = () => screen.getByTestId('album-edit-created-at') as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: 'Save' });

// `userEvent.type` is unreliable against `datetime-local`, which browsers and happy-dom
// treat as segmented rather than free text. Set the whole value at once — the same
// input+change pair AssetChangeDateModal.spec.ts:57-62 uses on this element.
const setDate = async (value: string) => {
  await fireEvent.input(createdAtInput(), { target: { value } });
  await fireEvent.change(createdAtInput(), { target: { value } });
};

beforeEach(() => {
  // 1996-06-15T12:30Z is 14:30 in Berlin summer time (+02:00). Pinning the zone here
  // rather than via TZ makes the local <-> UTC conversion observable under the
  // config's TZ: 'UTC'.
  Settings.defaultZone = 'Europe/Berlin';
  handleUpdateAlbumMock.mockResolvedValue(true);
});

afterAll(() => {
  Settings.defaultZone = originalZone;
});

describe('AlbumEditModal', () => {
  it('pre-fills the created date in local time', () => {
    render(AlbumEditModal, { props: { album: album(), onClose: vi.fn() } });

    // `datetime-local` inputs normalize their value string per the WHATWG "valid normalized
    // local date and time string" algorithm: the seconds component is dropped when it (and any
    // fractional part) is zero. 1996-06-15T12:30:00.000Z is exactly 14:30:00.000 in Berlin summer
    // time, so seconds/ms are both zero here and the browser (and happy-dom, spec-compliantly)
    // renders "14:30" rather than "14:30:00.000". This is a display-string quirk, not a timezone
    // bug — the historical-offset assertion below is the real proof of correct zone handling.
    expect(createdAtInput().value).toBe('1996-06-15T14:30');
  });

  it('submits the edited date as an ISO string with the historical offset', async () => {
    const onClose = vi.fn();
    render(AlbumEditModal, { props: { album: album(), onClose } });

    await setDate('1996-06-15T09:00:00.000');
    await userEvent.click(saveButton());

    await waitFor(() => expect(handleUpdateAlbumMock).toHaveBeenCalled());
    const [, dto] = handleUpdateAlbumMock.mock.calls[0];
    expect(dto.createdAt).toBe('1996-06-15T09:00:00.000+02:00');
    expect(onClose).toHaveBeenCalled();
  });

  it('omits the created date when it was not touched', async () => {
    render(AlbumEditModal, { props: { album: album(), onClose: vi.fn() } });

    await userEvent.click(saveButton());

    await waitFor(() => expect(handleUpdateAlbumMock).toHaveBeenCalled());
    const [, dto] = handleUpdateAlbumMock.mock.calls[0];
    expect(dto).not.toHaveProperty('createdAt');
    expect(dto.albumName).toBe('Summer');
  });

  it('omits the created date when the input is cleared, and still saves the name', async () => {
    render(AlbumEditModal, { props: { album: album(), onClose: vi.fn() } });

    await setDate('');
    await userEvent.click(saveButton());

    await waitFor(() => expect(handleUpdateAlbumMock).toHaveBeenCalled());
    const [, dto] = handleUpdateAlbumMock.mock.calls[0];
    expect(dto).not.toHaveProperty('createdAt');
    expect(dto.albumName).toBe('Summer');
  });
});
