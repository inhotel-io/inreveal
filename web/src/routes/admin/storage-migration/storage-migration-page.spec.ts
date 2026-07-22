import { StorageMigrationDirection } from '@immich/sdk';
import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import StorageMigrationPage from './+page.svelte';

vi.mock('$lib/components/layouts/AdminPageLayout.svelte', async () => {
  const stub = await import('./admin-page-layout.mock.svelte');
  return { default: stub.default };
});

const fileTypeKeys = [
  'originals',
  'thumbnails',
  'previews',
  'full_size',
  'encoded_videos',
  'sidecars',
  'person_thumbnails',
  'profile_images',
];

const estimate = {
  direction: StorageMigrationDirection.ToS3,
  fileCounts: {
    originals: 10,
    thumbnails: 20,
    previews: 30,
    fullsize: 40,
    encodedVideos: 50,
    sidecars: 60,
    personThumbnails: 70,
    profileImages: 80,
    total: 360,
  },
  estimatedSizeBytes: 1536,
};

const status = {
  isActive: false,
  active: 0,
  waiting: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  paused: 0,
};

const renderPage = () =>
  render(StorageMigrationPage, { props: { data: { error: undefined, meta: { title: 'Storage Migration' } } } });

/** The file-type checkboxes and the estimate breakdown share their labels — scope to the section. */
const fileTypeSection = () => {
  const heading = screen.getByText('admin.storage_migration_file_types');
  return within(heading.parentElement as HTMLElement);
};

const fileTypeCheckbox = (key: string) => {
  const label = fileTypeSection().getByText(`admin.storage_migration_file_type_${key}`);
  return label.parentElement?.querySelector('input[type="checkbox"]') as HTMLInputElement;
};

describe('admin storage migration page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sdkMock.getEstimate.mockResolvedValue(estimate);
    sdkMock.getStatus.mockResolvedValue(status);
    sdkMock.start.mockResolvedValue({ batchId: 'batch-1' } as never);
  });

  it('renders a checkbox per file type, all selected by default', async () => {
    renderPage();

    await waitFor(() => expect(sdkMock.getEstimate).toHaveBeenCalled());

    for (const key of fileTypeKeys) {
      expect(fileTypeCheckbox(key)).toBeChecked();
    }
  });

  it('sends only the checked file types when starting a migration', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(sdkMock.getEstimate).toHaveBeenCalled());

    await user.click(fileTypeCheckbox('thumbnails'));

    await user.click(screen.getByRole('button', { name: 'admin.storage_migration_start_heading' }));

    await waitFor(() => expect(sdkMock.start).toHaveBeenCalled());
    expect(sdkMock.start.mock.calls[0][0]).toEqual({
      storageMigrationStartDto: {
        direction: 'toS3',
        deleteSource: false,
        concurrency: 5,
        fileTypes: {
          originals: true,
          thumbnails: false,
          previews: true,
          fullsize: true,
          encodedVideos: true,
          sidecars: true,
          personThumbnails: true,
          profileImages: true,
        },
      },
    });
  });

  it('renders the estimated counts and size', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('360')).toBeInTheDocument());
    expect(screen.getByText('1.5 KiB')).toBeInTheDocument();
  });
});
