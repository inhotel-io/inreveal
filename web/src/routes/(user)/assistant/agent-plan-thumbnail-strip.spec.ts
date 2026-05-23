import {
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  type AgentOperationPlanResponseDto,
  type AgentOperationResponseDto,
} from '@immich/sdk';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import {
  AGENT_PLAN_THUMBNAIL_STRIP_MAX_LIMIT,
  buildOperationReviewModel,
  type OperationReviewGroup,
} from './agent-operation-plan-ui';
import AgentPlanThumbnailStrip from './agent-plan-thumbnail-strip.svelte';

const getAssetMediaUrlMock = vi.hoisted(() =>
  vi.fn(({ id, size }: { id: string; size: string }) => `/api/assets/${id}/thumbnail?size=${size}`),
);

vi.mock('$lib/utils', () => ({
  getAssetMediaUrl: getAssetMediaUrlMock,
}));

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_operation_thumbnail_alt: 'Photo preview {index} of {count}',
    assistant_operation_thumbnail_empty: '{count} photos without previews',
    assistant_operation_thumbnail_overflow: '+{count}',
    assistant_operation_thumbnail_overflow_label: '{count} more photos',
    assistant_operation_thumbnail_strip_label: '{count} photo previews',
    assistant_operation_thumbnail_unavailable: 'Preview unavailable',
  };

  return {
    t: readable((key: string, options?: { values?: Record<string, string | number> }) =>
      (messages[key] ?? key)
        .replace('{count}', String(options?.values?.count ?? ''))
        .replace('{index}', String(options?.values?.index ?? '')),
    ),
  };
});

const planId = '00000000-0000-4000-8000-000000000100';
const addId = '00000000-0000-4000-8000-000000000101';

const assetIds = (count: number) =>
  Array.from({ length: count }, (_, index) => `asset-${String(index + 1).padStart(3, '0')}`);

const baseOperation = {
  planId,
  targetId: null,
  temporaryTargetId: null,
  assetIds: [],
  dependencyIds: [],
  riskLevel: AgentOperationRiskLevel.Low,
  enabled: true,
  status: AgentOperationStatus.Proposed,
  result: null,
  error: null,
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
} satisfies Omit<AgentOperationResponseDto, 'id' | 'type' | 'summary' | 'targetKind' | 'payload'>;

const operation = (
  operation: Partial<AgentOperationResponseDto> &
    Pick<AgentOperationResponseDto, 'id' | 'type' | 'summary' | 'targetKind' | 'payload'>,
): AgentOperationResponseDto => ({ ...baseOperation, ...operation });

const plan = (operations: AgentOperationResponseDto[]): AgentOperationPlanResponseDto => ({
  id: planId,
  sessionId: '00000000-0000-4000-8000-000000000001',
  revision: 1,
  status: AgentOperationPlanStatus.Proposed,
  summary: 'Organize Portugal holiday',
  operations,
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
});

const group = (count: number) =>
  buildOperationReviewModel(
    plan([
      operation({
        id: addId,
        type: AgentOperationType.AlbumAddAssets,
        summary: `Add ${count} assets`,
        targetKind: AgentOperationTargetKind.NewAlbum,
        temporaryTargetId: 'album-portugal',
        assetIds: assetIds(count),
        payload: {},
      }),
    ]),
    { [addId]: true },
  ).groups[0];

const groupWithoutRepresentatives = (count: number): OperationReviewGroup => {
  const source = group(count);

  return {
    ...source,
    representativeAssetIds: [],
    thumbnailSummary: {
      totalCount: count,
      representativeAssetIds: [],
      hasMore: count > 0,
    },
  };
};

describe('AgentPlanThumbnailStrip', () => {
  beforeEach(() => {
    getAssetMediaUrlMock.mockClear();
  });

  it('renders a bounded thumbnail strip with overflow instead of every affected asset', () => {
    render(AgentPlanThumbnailStrip, {
      props: {
        group: group(20),
        maxVisible: 4,
      },
    });

    const strip = screen.getByTestId('agent-plan-thumbnail-strip');
    const images = within(strip).getAllByTestId('agent-plan-thumbnail-image');

    expect(strip).toHaveAttribute('aria-label', '20 photo previews');
    expect(images).toHaveLength(4);
    expect(images[0].getAttribute('src')).toContain('/api/assets/asset-001/thumbnail');
    expect(images[3].getAttribute('src')).toContain('/api/assets/asset-004/thumbnail');
    expect(within(strip).getByText('+16')).toBeInTheDocument();
    expect(within(strip).queryByAltText('Photo preview 5 of 20')).not.toBeInTheDocument();
    expect(screen.queryByText('asset-005')).not.toBeInTheDocument();
  });

  it('renders a mosaic variant with a larger first thumbnail and bounded overflow', () => {
    render(AgentPlanThumbnailStrip, {
      props: {
        group: group(20),
        variant: 'mosaic',
        maxVisible: 7,
      },
    });

    const strip = screen.getByTestId('agent-plan-thumbnail-strip');
    const tiles = within(strip).getAllByTestId('agent-plan-thumbnail-tile');
    expect(tiles).toHaveLength(7);
    expect(tiles[0]).toHaveClass('sm:col-span-2', 'sm:row-span-2');
    expect(within(strip).getByText('+13')).toBeInTheDocument();
  });

  it('renders a compact no-preview fallback when affected assets have no representative thumbnail IDs', () => {
    render(AgentPlanThumbnailStrip, {
      props: {
        group: groupWithoutRepresentatives(7),
      },
    });

    expect(screen.getByText('7 photos without previews')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-plan-thumbnail-image')).not.toBeInTheDocument();
    expect(screen.queryByText('+7')).not.toBeInTheDocument();
  });

  it('keeps the strip usable when one thumbnail fails to load', async () => {
    render(AgentPlanThumbnailStrip, {
      props: {
        group: group(3),
      },
    });

    const strip = screen.getByTestId('agent-plan-thumbnail-strip');
    const images = within(strip).getAllByTestId('agent-plan-thumbnail-image');

    await fireEvent.error(images[1]);

    expect(within(strip).getAllByTestId('agent-plan-thumbnail-image')).toHaveLength(3);
    expect(within(strip).getByText('Preview unavailable')).toBeInTheDocument();
    expect(within(strip).getByAltText('Photo preview 1 of 3')).toBeInTheDocument();
    expect(within(strip).getByAltText('Photo preview 3 of 3')).toBeInTheDocument();
  });

  it('renders nothing for operations with zero affected photos', () => {
    const { container } = render(AgentPlanThumbnailStrip, {
      props: {
        group: group(0),
      },
    });

    expect(container.children).toHaveLength(0);
  });

  it('does not mount every thumbnail for a 1,000-photo plan', () => {
    render(AgentPlanThumbnailStrip, {
      props: {
        group: group(1000),
        maxVisible: 1000,
      },
    });

    const strip = screen.getByTestId('agent-plan-thumbnail-strip');

    expect(within(strip).getAllByTestId('agent-plan-thumbnail-image')).toHaveLength(
      AGENT_PLAN_THUMBNAIL_STRIP_MAX_LIMIT,
    );
    expect(getAssetMediaUrlMock).toHaveBeenCalledTimes(AGENT_PLAN_THUMBNAIL_STRIP_MAX_LIMIT);
    expect(getAssetMediaUrlMock).toHaveBeenLastCalledWith({ id: 'asset-012', size: 'thumbnail' });
    expect(within(strip).getByText('+988')).toBeInTheDocument();
    expect(screen.queryByText('asset-013')).not.toBeInTheDocument();
    expect(within(strip).queryByAltText('Photo preview 13 of 1000')).not.toBeInTheDocument();
  });

  it('does not expose raw asset IDs as visible text', () => {
    render(AgentPlanThumbnailStrip, {
      props: {
        group: group(3),
      },
    });

    expect(screen.queryByText('asset-001')).not.toBeInTheDocument();
    expect(screen.queryByText('asset-002')).not.toBeInTheDocument();
    expect(screen.queryByText('asset-003')).not.toBeInTheDocument();
  });
});
