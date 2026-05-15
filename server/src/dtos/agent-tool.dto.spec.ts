import {
  AgentListAlbumsToolRequestDto,
  AgentReadAlbumToolRequestDto,
  AgentReadAssetMetadataToolRequestDto,
  AgentReadAssetMetadataToolResponseDto,
  AgentReadAssetOriginalsToolRequestDto,
  AgentReadAssetPreviewsToolRequestDto,
  AgentSearchAssetsToolRequestDto,
  AgentToolApprovalDto,
  AgentToolCallParamsDto,
  AgentToolCallResponseDto,
} from 'src/dtos/agent-tool.dto';
import {
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
  AssetType,
  AssetVisibility,
} from 'src/enum';
import { factory } from 'test/small.factory';
import z from 'zod';

type AgentReadAssetMetadataToolRequestInput = z.input<typeof AgentReadAssetMetadataToolRequestDto.schema>;
type AgentSearchAssetsToolRequestInput = z.input<typeof AgentSearchAssetsToolRequestDto.schema>;
type AgentReadAssetPreviewsToolRequestInput = z.input<typeof AgentReadAssetPreviewsToolRequestDto.schema>;
type AgentReadAssetOriginalsToolRequestInput = z.input<typeof AgentReadAssetOriginalsToolRequestDto.schema>;
type AgentReadAlbumToolRequestInput = z.input<typeof AgentReadAlbumToolRequestDto.schema>;
type AgentToolApprovalInput = z.input<typeof AgentToolApprovalDto.schema>;

const parseRequest = (input: AgentReadAssetMetadataToolRequestInput) =>
  AgentReadAssetMetadataToolRequestDto.schema.safeParse(input);
const parseSearchAssetsRequest = (input: AgentSearchAssetsToolRequestInput) =>
  AgentSearchAssetsToolRequestDto.schema.safeParse(input);
const parseReadAssetPreviewsRequest = (input: AgentReadAssetPreviewsToolRequestInput) =>
  AgentReadAssetPreviewsToolRequestDto.schema.safeParse(input);
const parseReadAssetOriginalsRequest = (input: AgentReadAssetOriginalsToolRequestInput) =>
  AgentReadAssetOriginalsToolRequestDto.schema.safeParse(input);
const parseReadAlbumRequest = (input: AgentReadAlbumToolRequestInput) =>
  AgentReadAlbumToolRequestDto.schema.safeParse(input);

const parseApproval = (input: AgentToolApprovalInput) => AgentToolApprovalDto.schema.safeParse(input);

const expectIssue = (
  result: { success: boolean; error?: z.ZodError },
  path: Array<string | number>,
  message: string,
) => {
  expect(result.success).toBe(false);
  expect(result.error?.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path,
        message: expect.stringContaining(message),
      }),
    ]),
  );
};

describe('Agent tool DTOs', () => {
  describe(AgentReadAssetMetadataToolRequestDto.name, () => {
    it('accepts assetIds for a new tool request', () => {
      const assetId = factory.uuid();
      const result = parseRequest({ assetIds: [assetId] });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ assetIds: [assetId] });
      }
    });

    it('accepts toolCallId for approved-call resume', () => {
      const toolCallId = factory.uuid();
      const result = parseRequest({ toolCallId });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ toolCallId });
      }
    });

    it('rejects invalid toolCallId UUIDs', () => {
      const result = parseRequest({ toolCallId: 'not-a-uuid' });

      expectIssue(result, ['toolCallId'], 'Invalid UUID');
    });

    it('accepts exactly 10000 asset ids', () => {
      const result = parseRequest({ assetIds: Array.from({ length: 10_000 }, () => factory.uuid()) });

      expect(result.success).toBe(true);
    });

    it('rejects more than 10000 asset ids', () => {
      const result = parseRequest({ assetIds: Array.from({ length: 10_001 }, () => factory.uuid()) });

      expectIssue(result, ['assetIds'], 'Too big');
    });

    it('rejects requests without assetIds or toolCallId', () => {
      const result = parseRequest({});

      expectIssue(result, [], 'Provide assetIds for a new tool request or toolCallId for an approved request');
    });

    it('rejects requests containing both assetIds and toolCallId', () => {
      const result = parseRequest({ assetIds: [factory.uuid()], toolCallId: factory.uuid() });

      expectIssue(result, [], 'Provide either assetIds or toolCallId, not both');
    });

    it('rejects invalid UUID asset ids', () => {
      const result = parseRequest({ assetIds: ['not-a-uuid'] });

      expectIssue(result, ['assetIds', 0], 'Invalid UUID');
    });

    it('rejects duplicate asset ids', () => {
      const assetId = factory.uuid();
      const result = parseRequest({ assetIds: [assetId, assetId] });

      expectIssue(result, ['assetIds'], 'assetIds must be unique');
    });
  });

  describe(AgentSearchAssetsToolRequestDto.name, () => {
    it('accepts filters and limit for a new tool request', () => {
      const result = parseSearchAssetsRequest({
        filters: {
          type: AssetType.Image,
          isFavorite: true,
          isNotInAlbum: true,
          takenAfter: '2026-05-01T00:00:00.000Z',
          takenBefore: '2026-05-31T23:59:59.999Z',
          city: 'Berlin',
          country: 'Germany',
          tagIds: [factory.uuid()],
        },
        limit: 25,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
        const filters = result.data.filters;
        expect(filters).toEqual(
          expect.objectContaining({
            type: AssetType.Image,
            city: 'Berlin',
            country: 'Germany',
          }),
        );
        expect(filters?.takenAfter).toEqual(new Date('2026-05-01T00:00:00.000Z'));
        expect(filters?.takenBefore).toEqual(new Date('2026-05-31T23:59:59.999Z'));
      }
    });

    it('rejects requests containing both filters/limit and toolCallId', () => {
      const result = parseSearchAssetsRequest({ filters: {}, limit: 10, toolCallId: factory.uuid() });

      expectIssue(result, [], 'Provide either search filters or toolCallId, not both');
    });
  });

  describe.each([
    [AgentReadAssetPreviewsToolRequestDto.name, parseReadAssetPreviewsRequest],
    [AgentReadAssetOriginalsToolRequestDto.name, parseReadAssetOriginalsRequest],
  ])('%s', (_name, parseReadAssetRequest) => {
    it('rejects requests containing both assetIds and toolCallId', () => {
      const result = parseReadAssetRequest({ assetIds: [factory.uuid()], toolCallId: factory.uuid() });

      expectIssue(result, [], 'Provide either assetIds or toolCallId, not both');
    });

    it('rejects duplicate asset ids', () => {
      const assetId = factory.uuid();
      const result = parseReadAssetRequest({ assetIds: [assetId, assetId] });

      expectIssue(result, ['assetIds'], 'assetIds must be unique');
    });
  });

  describe(AgentReadAlbumToolRequestDto.name, () => {
    it('requires albumId or toolCallId', () => {
      const result = parseReadAlbumRequest({});

      expectIssue(result, [], 'Provide albumId for a new tool request or toolCallId for an approved request');
    });

    it('rejects requests containing both albumId and toolCallId', () => {
      const result = parseReadAlbumRequest({ albumId: factory.uuid(), toolCallId: factory.uuid() });

      expectIssue(result, [], 'Provide either albumId or toolCallId, not both');
    });
  });

  describe(AgentToolApprovalDto.name, () => {
    it.each([AgentToolApprovalDecision.Approved, AgentToolApprovalDecision.Denied])(
      'accepts %s approval decisions',
      (decision) => {
        const result = parseApproval({ decision });

        expect(result.success).toBe(true);
      },
    );

    it('accepts denied decisions with a reason', () => {
      const result = parseApproval({ decision: AgentToolApprovalDecision.Denied, reason: 'Too broad.' });

      expect(result.success).toBe(true);
    });

    it('rejects blank denial reason after trim', () => {
      const result = parseApproval({ decision: AgentToolApprovalDecision.Denied, reason: '   ' });

      expectIssue(result, ['reason'], 'Too small');
    });
  });

  describe(AgentToolCallParamsDto.name, () => {
    it('accepts session and tool call params', () => {
      const result = AgentToolCallParamsDto.schema.safeParse({ id: factory.uuid(), toolCallId: factory.uuid() });

      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID params', () => {
      const result = AgentToolCallParamsDto.schema.safeParse({ id: 'not-a-uuid', toolCallId: 'also-not-a-uuid' });

      expectIssue(result, ['id'], 'Invalid UUID');
      expectIssue(result, ['toolCallId'], 'Invalid UUID');
    });
  });

  describe(AgentToolCallResponseDto.name, () => {
    it('serializes tool call dates as ISO strings', () => {
      const result = AgentToolCallResponseDto.schema.safeEncode(makeToolCall());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startedAt).toBe('2026-05-14T12:00:00.000Z');
        expect(result.data.completedAt).toBe('2026-05-14T12:01:00.000Z');
      }
    });
  });

  describe(AgentReadAssetMetadataToolResponseDto.name, () => {
    it('serializes approval-required responses with embedded tool calls only', () => {
      const result = AgentReadAssetMetadataToolResponseDto.schema.safeEncode({
        status: 'approval-required',
        toolCall: makeToolCall({ status: AgentToolCallStatus.PendingApproval, completedAt: null }),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('toolCall');
        expect(result.data).not.toHaveProperty('toolCallId');
        expect(result.data).not.toHaveProperty('requestSummary');
        expect(result.data).not.toHaveProperty('assetCount');
      }
    });

    it('serializes denied responses with a reason and embedded tool call only', () => {
      const result = AgentReadAssetMetadataToolResponseDto.schema.safeEncode({
        status: 'denied',
        reason: 'User denied the request.',
        toolCall: makeToolCall({
          status: AgentToolCallStatus.Denied,
          approvalDecision: AgentToolApprovalDecision.Denied,
          error: 'User denied the request.',
        }),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('reason', 'User denied the request.');
        expect(result.data).toHaveProperty('toolCall');
        expect(result.data).not.toHaveProperty('toolCallId');
        expect(result.data).not.toHaveProperty('decision');
      }
    });

    it('serializes success responses with ISO dates and metadata only', () => {
      const result = AgentReadAssetMetadataToolResponseDto.schema.safeEncode(makeSuccessResponse());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('success');
        if (result.data.status !== 'success') {
          return;
        }

        expect(result.data.toolCall.startedAt).toBe('2026-05-14T12:00:00.000Z');
        expect(result.data).not.toHaveProperty('toolCallId');
        expect(result.data.assets[0]).toEqual(
          expect.objectContaining({
            localDateTime: '2026-05-14T12:00:00.000Z',
            fileCreatedAt: '2026-05-14T11:00:00.000Z',
            fileModifiedAt: '2026-05-14T11:30:00.000Z',
            exifInfo: expect.objectContaining({
              dateTimeOriginal: '2026-05-14T10:00:00.000Z',
            }),
          }),
        );
        expect(result.data.assets[0]).not.toHaveProperty('originalPath');
        expect(result.data.assets[0]).not.toHaveProperty('previewPath');
        expect(result.data.assets[0]).not.toHaveProperty('thumbnailPath');
      }
    });
  });
});

const makeToolCall = (overrides: Partial<AgentToolCallResponseDto> = {}): AgentToolCallResponseDto => ({
  id: factory.uuid(),
  sessionId: factory.uuid(),
  toolName: AgentToolName.ReadAssetMetadata,
  status: AgentToolCallStatus.Completed,
  approvalDecision: AgentToolApprovalDecision.Approved,
  requestSummary: 'Read metadata for 1 asset',
  responseSummary: 'Returned metadata for 1 asset',
  dataClass: AgentToolDataClass.Metadata,
  assetCount: 1,
  albumCount: 0,
  startedAt: new Date('2026-05-14T12:00:00.000Z'),
  completedAt: new Date('2026-05-14T12:01:00.000Z'),
  error: null,
  ...overrides,
});

const makeSuccessResponse = () => ({
  status: 'success' as const,
  toolCall: makeToolCall(),
  assets: [
    {
      id: factory.uuid(),
      ownerId: factory.uuid(),
      type: AssetType.Image,
      originalFileName: 'IMG_0001.jpg',
      localDateTime: new Date('2026-05-14T12:00:00.000Z'),
      fileCreatedAt: new Date('2026-05-14T11:00:00.000Z'),
      fileModifiedAt: new Date('2026-05-14T11:30:00.000Z'),
      isFavorite: true,
      visibility: AssetVisibility.Timeline,
      exifInfo: {
        dateTimeOriginal: new Date('2026-05-14T10:00:00.000Z'),
        city: 'Berlin',
        state: 'Berlin',
        country: 'Germany',
        make: 'Fujifilm',
        model: 'X100V',
        lensModel: '23mm',
        latitude: 52.52,
        longitude: 13.405,
        rating: 5,
      },
      tags: [{ id: factory.uuid(), value: 'travel', color: '#00ff00' }],
    },
  ],
});
