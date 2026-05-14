import { AgentSessionCreateDto } from 'src/dtos/agent-session.dto';
import { AgentApprovalMode, AgentPermissionPreset } from 'src/enum';
import type { AgentPermissionPlanSnapshot } from 'src/types/agent-session.types';
import type z from 'zod';

type AgentSessionCreateInput = z.input<typeof AgentSessionCreateDto.schema>;

const providerCredentialId = '3fe388e4-2078-44d7-b36c-000000000001';
const maxInitialContextBytes = 16_384;

const makePermissionPlan = (): AgentPermissionPlanSnapshot => ({
  read: {
    metadata: true,
    previews: true,
    originals: true,
  },
  providerExposure: {
    metadata: true,
    previews: true,
    originals: true,
    allowOriginalsForExternalProviders: false,
  },
  assetScope: {
    owned: true,
    sharedSpaces: true,
    locked: false,
  },
  writeScope: {
    createAlbum: true,
    addAssets: true,
    updateDetails: true,
    setCover: true,
  },
  limits: {
    maxAssetsPerToolCall: 20,
    maxAssetsPerSession: 100,
    maxPreviewsPerToolCall: 10,
    maxOriginalsPerToolCall: 5,
    expiresInMinutes: 60,
  },
});

const makeCustomCreateInput = (overrides: Partial<AgentSessionCreateInput> = {}): AgentSessionCreateInput => ({
  providerCredentialId,
  model: 'gpt-5',
  permissionPreset: AgentPermissionPreset.Custom,
  approvalMode: AgentApprovalMode.AskOnEscalation,
  permissionPlan: makePermissionPlan(),
  ...overrides,
});

const jsonByteLength = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');

const makeInitialContext = (targetBytes: number) => {
  const emptyContext = { payload: '' };
  const payloadLength = targetBytes - jsonByteLength(emptyContext);

  if (payloadLength < 0) {
    throw new Error('targetBytes is smaller than the empty initial context JSON');
  }

  const context = { payload: 'x'.repeat(payloadLength) };
  expect(jsonByteLength(context)).toBe(targetBytes);
  return context;
};

const expectIssue = (input: AgentSessionCreateInput, path: (string | number)[], message: string) => {
  const result = AgentSessionCreateDto.schema.safeParse(input);

  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }

  expect(result.error.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path,
        message,
      }),
    ]),
  );
};

describe('AgentSessionCreateDto', () => {
  it('should accept a valid custom session request', () => {
    const result = AgentSessionCreateDto.schema.safeParse(makeCustomCreateInput());

    expect(result.success).toBe(true);
  });

  it('should reject custom preset without permissionPlan', () => {
    expectIssue(
      makeCustomCreateInput({ permissionPlan: undefined }),
      ['permissionPlan'],
      'permissionPlan is required when permissionPreset is custom',
    );
  });

  it('should reject permissionPlan for non-custom presets', () => {
    expectIssue(
      makeCustomCreateInput({ permissionPreset: AgentPermissionPreset.Careful }),
      ['permissionPlan'],
      'permissionPlan is only accepted when permissionPreset is custom',
    );
  });

  it.each([
    {
      name: 'metadata',
      makeInput: () => {
        const permissionPlan = makePermissionPlan();
        permissionPlan.read.metadata = false;
        return makeCustomCreateInput({ permissionPlan });
      },
      path: ['permissionPlan', 'providerExposure', 'metadata'],
      message: 'metadata exposure requires metadata reads',
    },
    {
      name: 'previews',
      makeInput: () => {
        const permissionPlan = makePermissionPlan();
        permissionPlan.read.previews = false;
        permissionPlan.limits.maxPreviewsPerToolCall = 0;
        return makeCustomCreateInput({ permissionPlan });
      },
      path: ['permissionPlan', 'providerExposure', 'previews'],
      message: 'preview exposure requires preview reads',
    },
    {
      name: 'originals',
      makeInput: () => {
        const permissionPlan = makePermissionPlan();
        permissionPlan.read.originals = false;
        permissionPlan.limits.maxOriginalsPerToolCall = 0;
        return makeCustomCreateInput({ permissionPlan });
      },
      path: ['permissionPlan', 'providerExposure', 'originals'],
      message: 'original exposure requires original reads',
    },
  ])('should reject $name provider exposure without corresponding read access', ({ makeInput, path, message }) => {
    expectIssue(makeInput(), path, message);
  });

  it.each([
    {
      name: 'preview',
      makeInput: () => {
        const permissionPlan = makePermissionPlan();
        permissionPlan.read.previews = false;
        permissionPlan.providerExposure.previews = false;
        permissionPlan.limits.maxPreviewsPerToolCall = 1;
        return makeCustomCreateInput({ permissionPlan });
      },
      path: ['permissionPlan', 'limits', 'maxPreviewsPerToolCall'],
      message: 'preview limits require preview reads',
    },
    {
      name: 'original',
      makeInput: () => {
        const permissionPlan = makePermissionPlan();
        permissionPlan.read.originals = false;
        permissionPlan.providerExposure.originals = false;
        permissionPlan.limits.maxOriginalsPerToolCall = 1;
        return makeCustomCreateInput({ permissionPlan });
      },
      path: ['permissionPlan', 'limits', 'maxOriginalsPerToolCall'],
      message: 'original limits require original reads',
    },
  ])('should reject positive $name limits without corresponding read access', ({ makeInput, path, message }) => {
    expectIssue(makeInput(), path, message);
  });

  it('should reject a session asset limit below the per-tool-call asset limit', () => {
    const permissionPlan = makePermissionPlan();
    permissionPlan.limits.maxAssetsPerToolCall = 20;
    permissionPlan.limits.maxAssetsPerSession = 19;

    expectIssue(
      makeCustomCreateInput({ permissionPlan }),
      ['permissionPlan', 'limits', 'maxAssetsPerSession'],
      'session asset limit must be at least the per-tool-call asset limit',
    );
  });

  it.each([
    {
      name: 'preview',
      makeInput: () => {
        const permissionPlan = makePermissionPlan();
        permissionPlan.limits.maxAssetsPerToolCall = 5;
        permissionPlan.limits.maxPreviewsPerToolCall = 6;
        permissionPlan.limits.maxOriginalsPerToolCall = 5;
        return makeCustomCreateInput({ permissionPlan });
      },
      path: ['permissionPlan', 'limits', 'maxPreviewsPerToolCall'],
      message: 'preview limit cannot exceed the per-tool-call asset limit',
    },
    {
      name: 'original',
      makeInput: () => {
        const permissionPlan = makePermissionPlan();
        permissionPlan.limits.maxAssetsPerToolCall = 5;
        permissionPlan.limits.maxPreviewsPerToolCall = 5;
        permissionPlan.limits.maxOriginalsPerToolCall = 6;
        return makeCustomCreateInput({ permissionPlan });
      },
      path: ['permissionPlan', 'limits', 'maxOriginalsPerToolCall'],
      message: 'original limit cannot exceed the per-tool-call asset limit',
    },
  ])('should reject $name per-call limits above the per-tool-call asset limit', ({ makeInput, path, message }) => {
    expectIssue(makeInput(), path, message);
  });

  it('should accept initialContext at exactly 16 KiB JSON', () => {
    const result = AgentSessionCreateDto.schema.safeParse(
      makeCustomCreateInput({ initialContext: makeInitialContext(maxInitialContextBytes) }),
    );

    expect(result.success).toBe(true);
  });

  it('should reject initialContext over 16 KiB JSON', () => {
    expectIssue(
      makeCustomCreateInput({ initialContext: makeInitialContext(maxInitialContextBytes + 1) }),
      ['initialContext'],
      'initialContext must be 16 KiB or less',
    );
  });
});
