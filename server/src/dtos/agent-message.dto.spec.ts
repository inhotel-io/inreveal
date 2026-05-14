import { AgentMessageCreateDto, AgentMessageResponseDto } from 'src/dtos/agent-message.dto';
import { AgentMessageRole } from 'src/enum';
import { factory } from 'test/small.factory';
import z from 'zod';

type AgentMessageCreateInput = z.input<typeof AgentMessageCreateDto.schema>;

const parseCreate = (input: AgentMessageCreateInput) => AgentMessageCreateDto.schema.safeParse(input);

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

const makeResponse = (overrides: Partial<AgentMessageResponseDto> = {}): AgentMessageResponseDto => ({
  id: factory.uuid(),
  sessionId: factory.uuid(),
  role: AgentMessageRole.Assistant,
  content: { blocks: [{ type: 'text', text: 'I can help with that.' }] },
  providerMessageId: null,
  toolCallId: null,
  createdAt: new Date('2026-05-14T12:00:00.000Z'),
  ...overrides,
});

describe('AgentMessage DTOs', () => {
  describe(AgentMessageCreateDto.name, () => {
    it('accepts text blocks and trims text', () => {
      const result = parseCreate({ content: { blocks: [{ type: 'text', text: '  Organize my photos.  ' }] } });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content.blocks).toEqual([{ type: 'text', text: 'Organize my photos.' }]);
      }
    });

    it('rejects empty block lists', () => {
      const result = parseCreate({ content: { blocks: [] } });

      expectIssue(result, ['content', 'blocks'], 'Too small');
    });

    it('rejects more than 100 blocks', () => {
      const result = parseCreate({
        content: {
          blocks: Array.from({ length: 101 }, () => ({ type: 'text', text: 'hello' })),
        },
      });

      expectIssue(result, ['content', 'blocks'], 'Too big');
    });

    it('rejects blank text after trim', () => {
      const result = parseCreate({ content: { blocks: [{ type: 'text', text: '   ' }] } });

      expectIssue(result, ['content', 'blocks', 0, 'text'], 'Too small');
    });

    it('rejects text blocks above 8,000 characters', () => {
      const result = parseCreate({ content: { blocks: [{ type: 'text', text: 'x'.repeat(8001) }] } });

      expectIssue(result, ['content', 'blocks', 0, 'text'], 'Too big');
    });

    it('rejects full content JSON above 32 KiB', () => {
      const result = parseCreate({
        content: {
          blocks: Array.from({ length: 5 }, (_, index) => ({
            type: 'text',
            text: `${index}-${'x'.repeat(8000)}`,
          })),
        },
      });

      expectIssue(result, ['content'], 'content must be 32 KiB or less');
    });

    it('rejects unknown block types', () => {
      const result = parseCreate({ content: { blocks: [{ type: 'html', html: '<b>no</b>' }] } as never });

      expectIssue(result, ['content', 'blocks', 0, 'type'], 'Invalid input');
    });

    it.each([
      { type: 'asset', assetId: factory.uuid() },
      { type: 'tool-call', toolCallId: factory.uuid() },
      { type: 'plan', planId: factory.uuid() },
    ])('rejects $type blocks from the public create DTO', (block) => {
      const result = parseCreate({ content: { blocks: [block] } as never });

      expectIssue(result, ['content', 'blocks', 0, 'type'], 'Invalid input');
    });
  });

  describe(AgentMessageResponseDto.name, () => {
    it('encodes persisted structured response blocks', () => {
      const toolCallId = factory.uuid();
      const result = AgentMessageResponseDto.schema.safeEncode(
        makeResponse({
          content: {
            blocks: [
              { type: 'text', text: 'Working on it.' },
              { type: 'tool-call', toolCallId, summary: 'Read matching assets.' },
              { type: 'asset', assetId: factory.uuid(), label: 'IMG_0001.jpg' },
              { type: 'plan', planId: factory.uuid(), label: 'Portugal album plan' },
            ],
          },
          providerMessageId: 'provider-message-1',
          toolCallId,
        }),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createdAt).toBe('2026-05-14T12:00:00.000Z');
      }
    });

    it.each([
      { block: { type: 'tool-call', toolCallId: factory.uuid(), summary: 'x'.repeat(501) }, path: 'summary' },
      { block: { type: 'asset', assetId: factory.uuid(), label: 'x'.repeat(501) }, path: 'label' },
      { block: { type: 'plan', planId: factory.uuid(), label: 'x'.repeat(501) }, path: 'label' },
    ])('bounds optional structured block text fields', ({ block, path }) => {
      const result = AgentMessageResponseDto.schema.safeEncode(makeResponse({ content: { blocks: [block] } as never }));

      expectIssue(result, ['content', 'blocks', 0, path], 'Too big');
    });
  });
});
