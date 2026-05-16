import { sdkMock } from '$lib/__mocks__/sdk.mock';
import {
  AgentApprovalMode,
  AgentMessageRole,
  AgentMessageTextBlockType,
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  AgentPermissionPreset,
  AgentProviderType,
  AgentSessionStatus,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
  type AgentMessageResponseDto,
  type AgentOperationPlanResponseDto,
  type AgentOperationResponseDto,
  type AgentSessionResponseDto,
  type AgentToolCallResponseDto,
} from '@immich/sdk';
import { websocketMock } from '@test-data/mocks/websocket.mock';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import AgentConversationPane from './agent-conversation-pane.svelte';

vi.mock('$lib/stores/websocket');

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_approval_mode: 'Approval mode',
    assistant_approval_mode_strict: 'Strict',
    assistant_approval_review_pending: 'Review pending approvals before sending a message.',
    assistant_approval_request: 'Approval request',
    assistant_approval_album_count: '{count} albums',
    assistant_approval_approve: 'Approve',
    assistant_approval_asset_count: '{count} assets',
    assistant_approval_data_access: 'Data access',
    assistant_approval_deny: 'Deny',
    assistant_approval_recent_activity: 'Recent activity ({count})',
    assistant_approval_tool_calls_error: 'Unable to load approval requests',
    assistant_agent_tool_data_class_metadata: 'Metadata',
    assistant_agent_tool_name_searchAssets: 'Search photos',
    assistant_agent_tool_status_completed: 'Completed',
    assistant_agent_tool_status_denied: 'Denied',
    assistant_agent_tool_status_failed: 'Failed',
    assistant_cancel: 'Cancel',
    assistant_chat: 'Chat',
    assistant_details: 'Details',
    assistant_close_details: 'Close details',
    assistant_created_at: 'Created',
    assistant_dismiss_details: 'Dismiss details',
    assistant_ended_at: 'Ended',
    assistant_message: 'Message',
    assistant_message_disabled_applying: 'Operations are being applied. You can review this session after it finishes.',
    assistant_message_disabled_placeholder: 'This session is read-only.',
    assistant_message_disabled_terminal: 'This session has ended. Start a new chat to continue.',
    assistant_message_load_error: 'Unable to load messages',
    assistant_message_plan_review_placeholder: 'Describe what should change in the proposed plan.',
    assistant_message_refresh_error: 'Message was sent, but the latest session state could not be refreshed.',
    assistant_message_resume_placeholder: 'Describe what changed or what the assistant should try next.',
    assistant_model: 'Model',
    assistant_models: 'Models',
    assistant_new_chat: 'New chat',
    assistant_no: 'no',
    assistant_not_available: 'Not available',
    assistant_operation_plan_empty: 'No proposed album plan yet.',
    assistant_operation_plan_error: 'Unable to load proposed album plan',
    assistant_operation_plan_loading: 'Loading proposed album plan',
    assistant_operation_apply_applying: 'Applying operations',
    assistant_operation_apply_selected: 'Apply {count} selected',
    assistant_operation_asset_count: '{count} assets',
    assistant_operation_blocked_by: 'Blocked by {dependencies}',
    assistant_operation_plan_review: 'Plan review',
    assistant_operation_risk_low: 'Low risk',
    assistant_operation_selected_count: '{count} selected',
    assistant_operation_type_album_create: 'Create album',
    assistant_permission_preset: 'Permission preset',
    assistant_permission_preset_careful: 'Careful',
    assistant_protocol_version: 'Protocol version',
    assistant_provider_credential: 'Provider credential',
    assistant_runner_capabilities: 'Runner capabilities',
    assistant_resume: 'Resume',
    assistant_send: 'Send',
    assistant_session_cancel_error: 'Unable to cancel assistant session',
    assistant_session_details: 'Session details',
    assistant_session_status_applying: 'Applying',
    assistant_session_status_cancelled: 'Cancelled',
    assistant_session_status_completed: 'Completed',
    assistant_session_status_created: 'Created',
    assistant_session_status_interrupted: 'Interrupted',
    assistant_session_status_running: 'Running',
    assistant_session_status_waiting_for_plan_review: 'Waiting for plan review',
    assistant_session_status_waiting_for_tool_approval: 'Waiting for tool approval',
    assistant_start_new_chat: 'Start new chat',
    assistant_streaming: 'Streaming',
    assistant_tools: 'Tools',
    assistant_updated_at: 'Updated',
    assistant_yes: 'yes',
    status: 'Status',
  };

  return {
    t: readable((key: string, options?: { values?: Record<string, string | number> }) =>
      (messages[key] ?? key)
        .replace('{count}', String(options?.values?.count ?? ''))
        .replace('{dependencies}', String(options?.values?.dependencies ?? '')),
    ),
  };
});

const makeSession = (overrides: Partial<AgentSessionResponseDto> = {}): AgentSessionResponseDto => {
  const id = overrides.id ?? '00000000-0000-4000-8000-000000000100';

  return {
    id,
    status: AgentSessionStatus.Running,
    providerCredentialId: '00000000-0000-4000-8000-000000000001',
    credentialSnapshot: {
      id: '00000000-0000-4000-8000-000000000001',
      providerType: AgentProviderType.Openai,
      label: 'OpenAI personal',
      baseUrl: null,
      models: ['gpt-5.1'],
      defaultModel: 'gpt-5.1',
    },
    modelSnapshot: { model: 'gpt-5.1', providerCredentialId: '00000000-0000-4000-8000-000000000001' },
    initialContextSnapshot: {},
    permissionPlanSnapshot: {
      assetScope: { locked: true, owned: true, sharedSpaces: false },
      limits: {
        expiresInMinutes: null,
        maxAssetsPerSession: 200,
        maxAssetsPerToolCall: 50,
        maxOriginalsPerToolCall: 10,
        maxPreviewsPerToolCall: 50,
      },
      providerExposure: { allowOriginalsForExternalProviders: false, metadata: true, originals: false, previews: true },
      read: { metadata: true, originals: false, previews: true },
      writeScope: { addAssets: true, createAlbum: true, setCover: true, updateDetails: true },
    },
    permissionPreset: AgentPermissionPreset.Careful,
    approvalMode: AgentApprovalMode.Strict,
    runnerCapabilitiesSnapshot: { protocolVersion: '2026-05-14', streaming: true, tools: ['echo'], models: [] },
    runnerEndpoint: 'http://agent-runner:4477',
    runnerSessionId: `stub-${id}`,
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T01:00:00.000Z',
    endedAt: null,
    ...overrides,
  };
};

const makeMessage = (sessionId: string, text: string, role = AgentMessageRole.User): AgentMessageResponseDto => ({
  id: `${sessionId}-message-${text}`,
  sessionId,
  role,
  providerMessageId: null,
  toolCallId: null,
  content: {
    blocks: [{ type: AgentMessageTextBlockType.Text, text }],
  },
  createdAt: '2026-05-14T00:00:00.000Z',
});

const makePlan = (sessionId: string): AgentOperationPlanResponseDto => ({
  id: '00000000-0000-4000-8000-000000000500',
  sessionId,
  revision: 1,
  status: AgentOperationPlanStatus.Proposed,
  summary: 'Organize Portugal holiday',
  operations: [
    {
      id: '00000000-0000-4000-8000-000000000501',
      planId: '00000000-0000-4000-8000-000000000500',
      type: AgentOperationType.AlbumCreate,
      summary: 'Create Portugal album',
      targetKind: AgentOperationTargetKind.NewAlbum,
      targetId: null,
      temporaryTargetId: 'album-portugal',
      assetIds: [],
      dependencyIds: [],
      riskLevel: AgentOperationRiskLevel.Low,
      enabled: true,
      status: AgentOperationStatus.Proposed,
      payload: { albumName: 'Portugal' },
      result: null,
      error: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    } satisfies AgentOperationResponseDto,
  ],
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
});

const makeToolCall = (sessionId: string): AgentToolCallResponseDto => ({
  id: 'tool-call-1',
  sessionId,
  toolName: AgentToolName.SearchAssets,
  status: AgentToolCallStatus.PendingApproval,
  approvalDecision: null,
  requestSummary: 'Search recent favorites',
  responseSummary: null,
  dataClass: 'metadata' as AgentToolDataClass,
  assetCount: 4,
  albumCount: 0,
  startedAt: '2026-05-16T10:00:00.000Z',
  completedAt: null,
  error: null,
});

describe(AgentConversationPane.name, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    websocketMock.websocketEvents.on.mockReturnValue(vi.fn());
    sdkMock.getAgentSessionMessages.mockResolvedValue([]);
    sdkMock.getCurrentOperationPlan.mockResolvedValue(null);
    sdkMock.getToolCalls.mockResolvedValue([]);
  });

  it('renders a compact header and chat without the old separate plan review block', async () => {
    const session = makeSession({ status: AgentSessionStatus.Completed });
    sdkMock.getAgentSessionMessages.mockResolvedValue([makeMessage(session.id, 'Archive winter screenshots')]);

    render(AgentConversationPane, {
      props: {
        session,
        title: 'Archive winter screenshots',
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
      },
    });

    expect(screen.getByRole('heading', { name: 'Archive winter screenshots' })).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('OpenAI personal')).toBeInTheDocument();
    expect(screen.getByText('gpt-5.1')).toBeInTheDocument();
    expect(screen.getByText('Strict')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Selected session' })).not.toBeInTheDocument();
    expect(await screen.findByText('Archive winter screenshots')).toBeInTheDocument();
    expect(screen.queryByText('No proposed album plan yet.')).not.toBeInTheDocument();
  });

  it('renders plan review through the action dock above the composer', async () => {
    const session = makeSession({ status: AgentSessionStatus.WaitingForPlanReview });
    sdkMock.getAgentSessionMessages.mockResolvedValue([makeMessage(session.id, 'Review this plan')]);
    sdkMock.getCurrentOperationPlan.mockResolvedValue(makePlan(session.id));

    render(AgentConversationPane, {
      props: {
        session,
        title: 'Plan session',
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
      },
    });

    expect(await screen.findByRole('heading', { name: 'Plan review' })).toBeInTheDocument();
    expect(screen.getByText('Organize Portugal holiday')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled();
  });

  it('keeps the composer enabled while waiting for plan review without pending approvals', async () => {
    const session = makeSession({ status: AgentSessionStatus.WaitingForPlanReview });

    render(AgentConversationPane, {
      props: {
        session,
        title: null,
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
      },
    });

    expect(await screen.findByRole('textbox', { name: 'Message' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveAttribute(
      'placeholder',
      'Describe what should change in the proposed plan.',
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('disables the composer while pending approvals are actionable', async () => {
    const session = makeSession({ status: AgentSessionStatus.WaitingForToolApproval });
    sdkMock.getToolCalls.mockResolvedValue([makeToolCall(session.id)]);

    render(AgentConversationPane, {
      props: {
        session,
        title: null,
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
      },
    });

    expect(await screen.findByText('Search photos')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();
    expect(screen.getByText('Review pending approvals before sending a message.')).toBeInTheDocument();
  });

  it('renders handled tool calls inline in the chat instead of a recent activity pile', async () => {
    const session = makeSession();
    sdkMock.getAgentSessionMessages.mockResolvedValue([
      makeMessage(session.id, 'Find my beach photos', AgentMessageRole.User),
      {
        ...makeMessage(session.id, 'I found the best candidates.', AgentMessageRole.Assistant),
        createdAt: '2026-05-14T00:01:00.000Z',
      },
    ]);
    sdkMock.getToolCalls.mockResolvedValue([
      {
        ...makeToolCall(session.id),
        id: 'tool-call-completed',
        status: AgentToolCallStatus.Completed,
        requestSummary: 'Search recent favorites',
        responseSummary: 'Found matching photos',
        startedAt: '2026-05-14T00:00:30.000Z',
        completedAt: '2026-05-14T00:00:45.000Z',
      },
    ]);

    render(AgentConversationPane, {
      props: {
        session,
        title: null,
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
      },
    });

    expect(await screen.findByRole('article', { name: 'Search photos action: Completed' })).toBeInTheDocument();
    expect(screen.getByText('Search recent favorites')).toBeInTheDocument();
    expect(screen.getByText('Found matching photos')).toBeInTheDocument();
    expect(screen.queryByText('Recent activity (1)')).not.toBeInTheDocument();

    const transcript = screen.getByTestId('agent-session-chat-transcript');
    expect(Array.from(transcript.querySelectorAll('[data-chat-item]')).map((item) => item.textContent)).toEqual([
      expect.stringContaining('Find my beach photos'),
      expect.stringContaining('Search photos'),
      expect.stringContaining('I found the best candidates.'),
    ]);
  });

  it('resumes interrupted sessions through append and refreshes the selected session', async () => {
    const session = makeSession({ status: AgentSessionStatus.Interrupted });
    const refreshedSession = makeSession({ id: session.id, status: AgentSessionStatus.Running });
    const onSessionUpdated = vi.fn();
    sdkMock.appendAgentSessionMessage.mockResolvedValue(makeMessage(session.id, 'Try again'));
    sdkMock.getAgentSession.mockResolvedValue(refreshedSession);

    render(AgentConversationPane, {
      props: {
        session,
        title: null,
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
        onSessionUpdated,
      },
    });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    expect(input).toHaveAttribute('placeholder', 'Describe what changed or what the assistant should try next.');
    await fireEvent.input(input, { target: { value: 'Try again' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

    await waitFor(() => expect(sdkMock.appendAgentSessionMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(sdkMock.getAgentSession).toHaveBeenCalledWith({ id: session.id }));
    expect(onSessionUpdated).toHaveBeenCalledWith(refreshedSession);
  });

  it('keeps append success visible when selected-session refresh fails', async () => {
    const session = makeSession({ status: AgentSessionStatus.Interrupted });
    const onSessionUpdated = vi.fn();
    sdkMock.appendAgentSessionMessage.mockResolvedValue(makeMessage(session.id, 'Still sent'));
    sdkMock.getAgentSession.mockRejectedValue(new Error('refresh failed'));

    render(AgentConversationPane, {
      props: {
        session,
        title: null,
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
        onSessionUpdated,
      },
    });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Still sent' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

    expect(await screen.findByText('Still sent')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Message was sent, but the latest session state could not be refreshed.',
    );
    expect(onSessionUpdated).not.toHaveBeenCalled();
  });

  it.each([
    [AgentSessionStatus.Completed, 'Completed'],
    [AgentSessionStatus.Cancelled, 'Cancelled'],
    [AgentSessionStatus.Failed, 'assistant_session_status_failed'],
  ])('shows terminal Start new chat composer action for %s sessions', async (status) => {
    const onNewChat = vi.fn();
    const session = makeSession({ status });

    render(AgentConversationPane, {
      props: {
        session,
        title: null,
        onNewChat,
        onTitleDiscovered: vi.fn(),
      },
    });

    expect(await screen.findByRole('textbox', { name: 'Message' })).toBeDisabled();
    expect(screen.getByText('This session has ended. Start a new chat to continue.')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Start new chat' }));

    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(sdkMock.appendAgentSessionMessage).not.toHaveBeenCalled();
  });

  it('disables applying sessions without replacing send with Start new chat', async () => {
    const session = makeSession({ status: AgentSessionStatus.Applying });

    render(AgentConversationPane, {
      props: {
        session,
        title: null,
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
      },
    });

    expect(await screen.findByRole('textbox', { name: 'Message' })).toBeDisabled();
    expect(
      screen.getByText('Operations are being applied. You can review this session after it finishes.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start new chat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('cancels cancellable sessions and forwards the returned selected session', async () => {
    const session = makeSession({ status: AgentSessionStatus.Running });
    const cancelledSession = makeSession({ id: session.id, status: AgentSessionStatus.Cancelled });
    const onSessionUpdated = vi.fn();
    sdkMock.cancelAgentSession.mockResolvedValue(cancelledSession);

    render(AgentConversationPane, {
      props: {
        session,
        title: null,
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
        onSessionUpdated,
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(sdkMock.cancelAgentSession).toHaveBeenCalledWith({ id: session.id }));
    expect(onSessionUpdated).toHaveBeenCalledWith(cancelledSession);
  });

  it('shows localized cancel failure without changing the selected session', async () => {
    const session = makeSession({ status: AgentSessionStatus.Running });
    const onSessionUpdated = vi.fn();
    sdkMock.cancelAgentSession.mockRejectedValue(new Error('cancel failed'));

    render(AgentConversationPane, {
      props: {
        session,
        title: null,
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
        onSessionUpdated,
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to cancel assistant session');
    expect(onSessionUpdated).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('does not offer or invoke cancel for non-cancellable sessions', () => {
    const session = makeSession({ status: AgentSessionStatus.Completed });

    render(AgentConversationPane, {
      props: {
        session,
        title: null,
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
      },
    });

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(sdkMock.cancelAgentSession).not.toHaveBeenCalled();
  });

  it('ignores stale cancel responses after switching sessions', async () => {
    const firstSession = makeSession({ id: '00000000-0000-4000-8000-000000000101' });
    const secondSession = makeSession({ id: '00000000-0000-4000-8000-000000000102' });
    const onSessionUpdated = vi.fn();
    let resolveCancel: (session: AgentSessionResponseDto) => void;
    sdkMock.cancelAgentSession.mockReturnValue(
      new Promise<AgentSessionResponseDto>((resolve) => {
        resolveCancel = resolve;
      }),
    );

    const view = render(AgentConversationPane, {
      props: {
        session: firstSession,
        title: null,
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
        onSessionUpdated,
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await view.rerender({
      session: secondSession,
      title: null,
      onNewChat: vi.fn(),
      onTitleDiscovered: vi.fn(),
      onSessionUpdated,
    });

    resolveCancel!(makeSession({ id: firstSession.id, status: AgentSessionStatus.Cancelled }));
    await waitFor(() => expect(sdkMock.cancelAgentSession).toHaveBeenCalledTimes(1));
    expect(onSessionUpdated).not.toHaveBeenCalled();
  });

  it('opens and closes session details from the compact header', async () => {
    const session = makeSession();

    render(AgentConversationPane, {
      props: {
        session,
        title: null,
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
      },
    });

    expect(screen.queryByRole('dialog', { name: 'Session details' })).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByRole('dialog', { name: 'Session details' })).toBeInTheDocument();
    expect(screen.getByText('Careful')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('dialog', { name: 'Session details' })).not.toBeInTheDocument();
  });

  it('forwards New chat and discovered titles', async () => {
    const session = makeSession();
    const onNewChat = vi.fn();
    const onTitleDiscovered = vi.fn();
    sdkMock.getAgentSessionMessages.mockResolvedValue([makeMessage(session.id, 'Build a family highlights album')]);

    render(AgentConversationPane, {
      props: {
        session,
        title: null,
        onNewChat,
        onTitleDiscovered,
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onTitleDiscovered).toHaveBeenCalledWith(session.id, 'Build a family highlights album'));
  });

  it('remounts chat and plan state when the keyed session changes', async () => {
    const firstSession = makeSession({ id: '00000000-0000-4000-8000-000000000101' });
    const secondSession = makeSession({ id: '00000000-0000-4000-8000-000000000102' });
    sdkMock.getAgentSessionMessages.mockImplementation(({ id }) =>
      Promise.resolve([makeMessage(id, id === firstSession.id ? 'First transcript' : 'Second transcript')]),
    );

    const view = render(AgentConversationPane, {
      props: {
        session: firstSession,
        title: null,
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
      },
    });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Unsaved first draft' } });
    expect(input).toHaveValue('Unsaved first draft');

    await view.rerender({
      session: secondSession,
      title: null,
      onNewChat: vi.fn(),
      onTitleDiscovered: vi.fn(),
    });

    expect(await screen.findByText('Second transcript')).toBeInTheDocument();
    expect(screen.queryByText('First transcript')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    expect(sdkMock.getCurrentOperationPlan).toHaveBeenLastCalledWith({ id: secondSession.id });
  });

  it('keeps the header visible when transcript loading fails', async () => {
    const session = makeSession();
    sdkMock.getAgentSessionMessages.mockRejectedValue(new Error('failed'));

    render(AgentConversationPane, {
      props: {
        session,
        title: 'Still visible',
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
      },
    });

    expect(screen.getByRole('heading', { name: 'Still visible' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load messages');
  });

  it('keeps chat and header visible when plan loading fails', async () => {
    const session = makeSession();
    sdkMock.getAgentSessionMessages.mockResolvedValue([makeMessage(session.id, 'Chat survives')]);
    sdkMock.getCurrentOperationPlan.mockRejectedValue(new Error('failed'));

    render(AgentConversationPane, {
      props: {
        session,
        title: 'Plan error session',
        onNewChat: vi.fn(),
        onTitleDiscovered: vi.fn(),
      },
    });

    expect(screen.getByRole('heading', { name: 'Plan error session' })).toBeInTheDocument();
    expect(await screen.findByText('Chat survives')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load proposed album plan');
  });
});
