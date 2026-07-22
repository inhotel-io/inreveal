import '@testing-library/jest-dom';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { TakeoutMediaItem } from '$lib/utils/google-takeout-parser';
import { scanTakeoutFiles } from '$lib/utils/google-takeout-scanner';
import { uploadTakeoutItem } from '$lib/utils/google-takeout-uploader';
import ImportWizard from '../import-wizard.svelte';

vi.mock('$lib/utils/google-takeout-scanner', () => ({
  scanTakeoutFiles: vi.fn(),
}));

vi.mock('$lib/utils/google-takeout-uploader', () => ({
  uploadTakeoutItem: vi.fn(),
  createImportAlbums: vi.fn(),
}));

describe('ImportWizard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders step indicator', () => {
    const { getByTestId } = render(ImportWizard);
    // Step indicator renders step-0 through step-3
    expect(getByTestId('step-0')).toBeInTheDocument();
    expect(getByTestId('step-3')).toBeInTheDocument();
  });

  it('renders files step initially', () => {
    const { getByTestId } = render(ImportWizard);
    expect(getByTestId('drop-zone')).toBeInTheDocument();
  });

  it('imports name-only Takeout items', async () => {
    const user = userEvent.setup();
    const file = new File(['bytes'], 'IMG_001.jpg', { lastModified: 1_609_459_200_000 });
    const item: TakeoutMediaItem = {
      path: 'Takeout/Google Photos/Trip/IMG_001.jpg',
      name: 'IMG_001.jpg',
      size: file.size,
      lastModified: file.lastModified,
      getFile: () => Promise.resolve(file),
      metadata: undefined,
      albumName: undefined,
    };
    vi.mocked(scanTakeoutFiles).mockResolvedValue({
      items: [item],
      albums: [],
      stats: {
        totalMedia: 1,
        withLocation: 0,
        withDate: 0,
        favorites: 0,
        archived: 0,
        dateRange: undefined,
      },
    });
    vi.mocked(uploadTakeoutItem).mockResolvedValue({ assetId: 'asset-1', status: 'imported' });

    const { container, getByTestId } = render(ImportWizard);

    const zipInput = container.querySelector('input[type="file"][accept=".zip"]') as HTMLInputElement;
    await fireEvent.change(zipInput, {
      target: { files: [new File(['zip'], 'takeout.zip', { type: 'application/zip' })] },
    });
    await user.click(getByTestId('next-button'));

    await waitFor(() => expect(getByTestId('import-button')).toBeInTheDocument());
    await user.click(getByTestId('import-button'));

    await waitFor(() => expect(uploadTakeoutItem).toHaveBeenCalledOnce());
    expect(vi.mocked(uploadTakeoutItem).mock.calls[0][0]).toMatchObject({
      path: 'Takeout/Google Photos/Trip/IMG_001.jpg',
      name: 'IMG_001.jpg',
      size: file.size,
      lastModified: file.lastModified,
    });
  });

  it('reactively renders imported/skipped/error counters as items are processed', async () => {
    const user = userEvent.setup();
    const makeItem = (name: string): TakeoutMediaItem => ({
      path: `Takeout/Google Photos/Trip/${name}`,
      name,
      size: 5,
      lastModified: 1_609_459_200_000,
      getFile: () => Promise.resolve(new File(['bytes'], name)),
      metadata: undefined,
      albumName: undefined,
    });
    vi.mocked(scanTakeoutFiles).mockResolvedValue({
      items: [makeItem('IMG_001.jpg'), makeItem('IMG_002.jpg'), makeItem('IMG_003.jpg')],
      albums: [],
      stats: {
        totalMedia: 3,
        withLocation: 0,
        withDate: 0,
        favorites: 0,
        archived: 0,
        dateRange: undefined,
      },
    });
    vi.mocked(uploadTakeoutItem)
      .mockResolvedValueOnce({ assetId: 'asset-1', status: 'imported' })
      .mockResolvedValueOnce({ assetId: 'asset-2', status: 'duplicate' })
      .mockResolvedValueOnce({ assetId: '', status: 'error', error: 'boom' });

    const { container, getByTestId, getByText } = render(ImportWizard);

    const zipInput = container.querySelector('input[type="file"][accept=".zip"]') as HTMLInputElement;
    await fireEvent.change(zipInput, {
      target: { files: [new File(['zip'], 'takeout.zip', { type: 'application/zip' })] },
    });
    await user.click(getByTestId('next-button'));

    await waitFor(() => expect(getByTestId('import-button')).toBeInTheDocument());
    await user.click(getByTestId('import-button'));

    // The counters live in the progress step and must update as the manager mutates importProgress.
    await waitFor(() => expect(getByText('import_complete')).toBeInTheDocument());

    const counters = container.querySelectorAll('.grid .text-lg');
    // imported, skipped, errors, albumsCreated
    expect([...counters].map((element) => element.textContent)).toEqual(['1', '1', '1', '0']);
  });
});
