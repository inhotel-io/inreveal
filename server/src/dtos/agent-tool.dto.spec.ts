import {
  AgentReadAssetMetadataToolRequestDto,
  AgentReadAssetMetadataToolResponseDto,
  AgentToolApprovalDto,
} from 'src/dtos/agent-tool.dto';
import { AgentToolApprovalDecision, AssetType, AssetVisibility } from 'src/enum';
import { factory } from 'test/small.factory';
import z from 'zod';

type AgentReadAssetMetadataToolRequestInput = z.input<typeof AgentReadAssetMetadataToolRequestDto.schema>;
type AgentToolApprovalInput = z.input<typeof AgentToolApprovalDto.schema>;

const parseRequest = (input: AgentReadAssetMetadataToolRequestInput) =>
  AgentReadAssetMetadataToolRequestDto.schema.safeParse(input);

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

  describe(AgentReadAssetMetadataToolResponseDto.name, () => {
    it('serializes success responses with ISO dates and metadata only', () => {
      const result = AgentReadAssetMetadataToolResponseDto.schema.safeEncode({
        status: 'success',
        toolCallId: factory.uuid(),
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

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('success');
        if (result.data.status !== 'success') {
          return;
        }

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
