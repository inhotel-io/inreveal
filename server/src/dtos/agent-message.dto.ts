import { createZodDto } from 'nestjs-zod';
import { AgentMessageRole } from 'src/enum';
import { isoDatetimeToDate } from 'src/validation';
import z from 'zod';

const MAX_CONTENT_BYTES = 32_768;
const text = z.string().trim().min(1).max(8000);
const label = z.string().trim().min(1).max(500).optional();
const jsonByteLength = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');

const AgentMessageRoleSchema = z.enum(AgentMessageRole).meta({ id: 'AgentMessageRole' });

const AgentMessageTextBlockSchema = z
  .object({
    type: z.literal('text').meta({ id: 'AgentMessageTextBlockType' }),
    text,
  })
  .meta({ id: 'AgentMessageTextBlock' });

const AgentMessageToolCallBlockSchema = z
  .object({
    type: z.literal('tool-call').meta({ id: 'AgentMessageToolCallBlockType' }),
    toolCallId: z.uuidv4(),
    summary: label,
  })
  .meta({ id: 'AgentMessageToolCallBlock' });

const AgentMessageAssetBlockSchema = z
  .object({
    type: z.literal('asset').meta({ id: 'AgentMessageAssetBlockType' }),
    assetId: z.uuidv4(),
    label,
  })
  .meta({ id: 'AgentMessageAssetBlock' });

const AgentMessagePlanBlockSchema = z
  .object({
    type: z.literal('plan').meta({ id: 'AgentMessagePlanBlockType' }),
    planId: z.uuidv4(),
    label,
  })
  .meta({ id: 'AgentMessagePlanBlock' });

const AgentMessageBlockSchema = z
  .discriminatedUnion('type', [
    AgentMessageTextBlockSchema,
    AgentMessageToolCallBlockSchema,
    AgentMessageAssetBlockSchema,
    AgentMessagePlanBlockSchema,
  ])
  .meta({ id: 'AgentMessageBlock' });

const AgentMessageContentSchema = z
  .object({
    blocks: z.array(AgentMessageBlockSchema).min(1).max(100),
  })
  .refine((value) => jsonByteLength(value) <= MAX_CONTENT_BYTES, {
    message: 'content must be 32 KiB or less',
  })
  .meta({ id: 'AgentMessageContent' });

const AgentUserMessageContentSchema = z
  .object({
    blocks: z.array(AgentMessageTextBlockSchema).min(1).max(100),
  })
  .refine((value) => jsonByteLength(value) <= MAX_CONTENT_BYTES, {
    message: 'content must be 32 KiB or less',
  })
  .meta({ id: 'AgentUserMessageContent' });

const AgentMessageCreateSchema = z
  .object({
    content: AgentUserMessageContentSchema,
  })
  .meta({ id: 'AgentMessageCreateDto' });

const AgentMessageResponseSchema = z
  .object({
    id: z.uuidv4(),
    sessionId: z.uuidv4(),
    role: AgentMessageRoleSchema,
    content: AgentMessageContentSchema,
    providerMessageId: z.string().nullable(),
    toolCallId: z.uuidv4().nullable(),
    createdAt: isoDatetimeToDate,
  })
  .meta({ id: 'AgentMessageResponseDto' });

export class AgentMessageCreateDto extends createZodDto(AgentMessageCreateSchema) {}
export class AgentMessageResponseDto extends createZodDto(AgentMessageResponseSchema) {}
