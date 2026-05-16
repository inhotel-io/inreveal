import {
  AgentApprovalMode,
  AgentPermissionPreset,
  AgentProviderType,
  AgentSessionStatus,
  type AgentSessionResponseDto,
} from '@immich/sdk';
import {
  ASSISTANT_SESSION_QUERY_PARAM,
  filterAgentSessionsForSidebar,
  filterSidebarSessions,
  getAgentSessionStatusBadge,
  getAgentSessionStatusLabelKey,
  getAgentSessionTitle,
  getInitialSelectedSessionId,
  getSessionPreviewTitle,
  getSessionSidebarStatusLabelKey,
  selectInitialAgentSessionId,
  shouldShowSessionStatusBadge,
  sortAgentSessionsForSidebar,
  sortSessionsForSidebar,
} from './agent-session-workspace-ui';

const session = (overrides: Partial<AgentSessionResponseDto> = {}): AgentSessionResponseDto => {
  const id = overrides.id ?? 'session-1';
  const providerCredentialId = overrides.providerCredentialId ?? 'credential-1';

  return {
    id,
    status: AgentSessionStatus.Created,
    providerCredentialId,
    approvalMode: AgentApprovalMode.Strict,
    permissionPreset: AgentPermissionPreset.Careful,
    credentialSnapshot: {
      id: providerCredentialId ?? 'credential-1',
      providerType: AgentProviderType.Openai,
      label: 'OpenAI personal',
      baseUrl: null,
      models: ['gpt-5'],
      defaultModel: 'gpt-5',
    },
    modelSnapshot: { providerCredentialId: providerCredentialId ?? 'credential-1', model: 'gpt-5' },
    permissionPlanSnapshot: {
      assetScope: { locked: false, owned: true, sharedSpaces: false },
      limits: {
        maxAssetsPerSession: 100,
        maxAssetsPerToolCall: 50,
        maxOriginalsPerToolCall: 10,
        maxPreviewsPerToolCall: 50,
        expiresInMinutes: null,
      },
      providerExposure: { allowOriginalsForExternalProviders: false, metadata: true, originals: false, previews: true },
      read: { metadata: true, originals: false, previews: true },
      writeScope: { addAssets: true, createAlbum: true, setCover: true, updateDetails: true },
    },
    initialContextSnapshot: {},
    runnerCapabilitiesSnapshot: { protocolVersion: '1', tools: [], models: ['gpt-5'], streaming: true },
    runnerEndpoint: null,
    runnerSessionId: null,
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    endedAt: null,
    ...overrides,
  };
};

describe('agent session workspace UI helpers', () => {
  it('exposes stable task helper names for later workspace slices', () => {
    expect(ASSISTANT_SESSION_QUERY_PARAM).toBe('session');
    expect(getInitialSelectedSessionId).toBe(selectInitialAgentSessionId);
    expect(sortSessionsForSidebar).toBe(sortAgentSessionsForSidebar);
    expect(getSessionSidebarStatusLabelKey).toBe(getAgentSessionStatusLabelKey);
    expect(filterSidebarSessions).toBe(filterAgentSessionsForSidebar);
    expect(shouldShowSessionStatusBadge(AgentSessionStatus.Created)).toBe(false);
    expect(shouldShowSessionStatusBadge(AgentSessionStatus.Applying)).toBe(true);
    expect(getSessionPreviewTitle('missing', {})).toBe('assistant_new_chat');
    expect(getSessionPreviewTitle('known', { known: '  Review albums  ' })).toBe('Review albums');
  });

  describe(selectInitialAgentSessionId.name, () => {
    it('selects a valid requested owned session before fallback heuristics', () => {
      const sessions = [
        session({ id: 'needs-review', status: AgentSessionStatus.WaitingForPlanReview }),
        session({ id: 'requested', status: AgentSessionStatus.Completed }),
      ];

      expect(selectInitialAgentSessionId(sessions, 'requested')).toBe('requested');
    });

    it('falls back by actionable status priority, recency, then descending id', () => {
      const sessions = [
        session({
          id: 'running-newer',
          status: AgentSessionStatus.Running,
          createdAt: '2026-05-15T00:00:00.000Z',
        }),
        session({
          id: 'tool-old',
          status: AgentSessionStatus.WaitingForToolApproval,
          createdAt: '2026-05-14T00:00:00.000Z',
        }),
        session({
          id: 'tool-z',
          status: AgentSessionStatus.WaitingForToolApproval,
          createdAt: '2026-05-16T00:00:00.000Z',
        }),
        session({
          id: 'tool-a',
          status: AgentSessionStatus.WaitingForToolApproval,
          createdAt: '2026-05-16T00:00:00.000Z',
        }),
      ];

      expect(selectInitialAgentSessionId(sessions, null)).toBe('tool-z');
      expect(selectInitialAgentSessionId(sessions, '')).toBe('tool-z');
      expect(selectInitialAgentSessionId(sessions, 'unknown')).toBe('tool-z');
    });

    it('returns null when no requested or actionable session exists', () => {
      expect(
        selectInitialAgentSessionId(
          [
            session({ id: 'created', status: AgentSessionStatus.Created }),
            session({ id: 'completed', status: AgentSessionStatus.Completed }),
            session({ id: 'cancelled', status: AgentSessionStatus.Cancelled }),
            session({ id: 'failed', status: AgentSessionStatus.Failed }),
          ],
          null,
        ),
      ).toBeNull();
    });

    it('applies the full fallback status order', () => {
      const statuses = [
        AgentSessionStatus.WaitingForToolApproval,
        AgentSessionStatus.WaitingForPlanReview,
        AgentSessionStatus.Interrupted,
        AgentSessionStatus.Running,
        AgentSessionStatus.Applying,
      ];

      for (const [index, status] of statuses.entries()) {
        const lowerPrioritySessions = statuses.slice(index).map((candidateStatus) =>
          session({
            id: candidateStatus,
            status: candidateStatus,
            createdAt: '2026-05-16T00:00:00.000Z',
          }),
        );

        expect(selectInitialAgentSessionId(lowerPrioritySessions, null)).toBe(status);
      }
    });
  });

  it('sorts sidebar rows by status priority, recency, and descending id without mutating input', () => {
    const sessions = [
      session({ id: 'completed-new', status: AgentSessionStatus.Completed, createdAt: '2026-05-16T00:00:00.000Z' }),
      session({
        id: 'plan-old',
        status: AgentSessionStatus.WaitingForPlanReview,
        createdAt: '2026-05-14T00:00:00.000Z',
      }),
      session({
        id: 'tool-old',
        status: AgentSessionStatus.WaitingForToolApproval,
        createdAt: '2026-05-13T00:00:00.000Z',
      }),
      session({ id: 'applying-new', status: AgentSessionStatus.Applying, createdAt: '2026-05-16T00:00:00.000Z' }),
      session({ id: 'interrupted', status: AgentSessionStatus.Interrupted, createdAt: '2026-05-14T00:00:00.000Z' }),
      session({ id: 'running', status: AgentSessionStatus.Running, createdAt: '2026-05-14T00:00:00.000Z' }),
      session({ id: 'created-z', status: AgentSessionStatus.Created, createdAt: '2026-05-15T00:00:00.000Z' }),
      session({ id: 'created-a', status: AgentSessionStatus.Created, createdAt: '2026-05-15T00:00:00.000Z' }),
    ];

    expect(sortAgentSessionsForSidebar(sessions).map(({ id }) => id)).toEqual([
      'tool-old',
      'plan-old',
      'interrupted',
      'running',
      'applying-new',
      'completed-new',
      'created-z',
      'created-a',
    ]);
    expect(sessions.map(({ id }) => id)[0]).toBe('completed-new');
  });

  it('returns a temporary title or the New chat fallback', () => {
    const current = session({ id: 'current' });

    expect(getAgentSessionTitle(current, { current: '  Organize screenshots  ' })).toBe('Organize screenshots');
    expect(getAgentSessionTitle(current, { current: '   ' })).toBe('New chat');
    expect(getAgentSessionTitle(current, {})).toBe('New chat');
  });

  it('has label keys and badges for every status, hiding only created badges', () => {
    expect(
      Object.values(AgentSessionStatus).map((status) => ({
        status,
        labelKey: getAgentSessionStatusLabelKey(status),
        badge: getAgentSessionStatusBadge(status),
      })),
    ).toEqual([
      {
        status: AgentSessionStatus.Created,
        labelKey: 'assistant_session_status_created',
        badge: null,
      },
      {
        status: AgentSessionStatus.Running,
        labelKey: 'assistant_session_status_running',
        badge: { labelKey: 'assistant_session_status_running', tone: 'active' },
      },
      {
        status: AgentSessionStatus.WaitingForToolApproval,
        labelKey: 'assistant_session_status_waiting_for_tool_approval',
        badge: { labelKey: 'assistant_session_status_waiting_for_tool_approval', tone: 'attention' },
      },
      {
        status: AgentSessionStatus.WaitingForPlanReview,
        labelKey: 'assistant_session_status_waiting_for_plan_review',
        badge: { labelKey: 'assistant_session_status_waiting_for_plan_review', tone: 'attention' },
      },
      {
        status: AgentSessionStatus.Applying,
        labelKey: 'assistant_session_status_applying',
        badge: { labelKey: 'assistant_session_status_applying', tone: 'active' },
      },
      {
        status: AgentSessionStatus.Completed,
        labelKey: 'assistant_session_status_completed',
        badge: { labelKey: 'assistant_session_status_completed', tone: 'success' },
      },
      {
        status: AgentSessionStatus.Cancelled,
        labelKey: 'assistant_session_status_cancelled',
        badge: { labelKey: 'assistant_session_status_cancelled', tone: 'muted' },
      },
      {
        status: AgentSessionStatus.Interrupted,
        labelKey: 'assistant_session_status_interrupted',
        badge: { labelKey: 'assistant_session_status_interrupted', tone: 'attention' },
      },
      {
        status: AgentSessionStatus.Failed,
        labelKey: 'assistant_session_status_failed',
        badge: { labelKey: 'assistant_session_status_failed', tone: 'danger' },
      },
    ]);
  });

  it('filters sessions by title, model, credential label, visible status text, and raw status case-insensitively', () => {
    const sessions = [
      session({
        id: 'images',
        status: AgentSessionStatus.WaitingForToolApproval,
        credentialSnapshot: {
          id: 'credential-1',
          providerType: AgentProviderType.Openai,
          label: 'OpenAI personal',
          baseUrl: null,
          models: ['gpt-5'],
          defaultModel: 'gpt-5',
        },
        modelSnapshot: { providerCredentialId: 'credential-1', model: 'gpt-5' },
      }),
      session({
        id: 'metadata',
        status: AgentSessionStatus.Completed,
        credentialSnapshot: {
          id: 'credential-2',
          providerType: AgentProviderType.Openai,
          label: 'Work account',
          baseUrl: null,
          models: ['gpt-5-mini'],
          defaultModel: 'gpt-5-mini',
        },
        modelSnapshot: { providerCredentialId: 'credential-2', model: 'gpt-5-mini' },
      }),
    ];
    const statusLabels = {
      [AgentSessionStatus.WaitingForToolApproval]: 'Needs approval',
      [AgentSessionStatus.Completed]: 'Done',
    };

    expect(
      filterAgentSessionsForSidebar(sessions, 'screenshots', { images: 'Organize screenshots' }, statusLabels),
    ).toEqual([sessions[0]]);
    expect(filterAgentSessionsForSidebar(sessions, 'mini', {}, statusLabels)).toEqual([sessions[1]]);
    expect(filterAgentSessionsForSidebar(sessions, 'work account', {}, statusLabels)).toEqual([sessions[1]]);
    expect(filterAgentSessionsForSidebar(sessions, 'needs approval', {}, statusLabels)).toEqual([sessions[0]]);
    expect(filterAgentSessionsForSidebar(sessions, 'WAITING_FOR_TOOL', {}, statusLabels)).toEqual([sessions[0]]);
    expect(filterAgentSessionsForSidebar(sessions, 'no matches', {}, statusLabels)).toEqual([]);
    expect(filterAgentSessionsForSidebar([...sessions].reverse(), '   ', {}, statusLabels)).toEqual(sessions);
  });
});
