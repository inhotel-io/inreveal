import { sdkMock } from '$lib/__mocks__/sdk.mock';
import {
  AgentApprovalMode,
  AgentMessageRole,
  AgentMessageTextBlockType,
  AgentPermissionPreset,
  AgentProviderType,
  AgentRunnerStatusReason,
  AgentSessionStatus,
  ProviderType,
  type AgentMessageResponseDto,
  type AgentProviderCredentialResponseDto,
  type AgentRunnerStatusDto,
  type AgentSessionResponseDto,
} from '@immich/sdk';
import { websocketMock } from '@test-data/mocks/websocket.mock';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { readable } from 'svelte/store';
import AgentAssistantWorkspace from './agent-assistant-workspace.svelte';

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));

vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$lib/stores/websocket');

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant: 'Assistant',
    assistant_approval_mode: 'Approval mode',
    assistant_approval_mode_strict: 'Strict',
    assistant_approval_request: 'Approval request',
    assistant_approval_tool_calls_error: 'Unable to load approval requests',
    assistant_cancel: 'Cancel',
    assistant_chat: 'Chat',
    assistant_configured: 'Configured',
    assistant_healthy: 'Healthy',
    assistant_message: 'Message',
    assistant_message_disabled_placeholder: 'This session is read-only.',
    assistant_message_disabled_terminal: 'This session has ended. Start a new chat to continue.',
    assistant_message_placeholder: 'Ask the assistant to organize your albums.',
    assistant_message_refresh_error: 'Message was sent, but the latest session state could not be refreshed.',
    assistant_message_resume_placeholder: 'Describe what changed or what the assistant should try next.',
    assistant_model: 'Model',
    assistant_new_chat: 'New chat',
    assistant_details: 'Details',
    assistant_no: 'no',
    assistant_operation_plan_empty: 'No proposed album plan yet.',
    assistant_operation_plan_loading: 'Loading proposed album plan',
    assistant_open_sessions: 'Open sessions',
    assistant_permission_preset: 'Permission preset',
    assistant_permission_preset_careful: 'Careful',
    assistant_protocol: 'Protocol {protocol}',
    assistant_provider_credential: 'Provider credential',
    assistant_runner: 'Runner {version}',
    assistant_runner_healthy: 'Runner healthy',
    assistant_search_chats: 'Search chats',
    assistant_selected_session: 'Selected session',
    assistant_resume: 'Resume',
    assistant_send: 'Send',
    assistant_session_cancel_error: 'Unable to cancel assistant session',
    assistant_session_created: 'Assistant session started',
    assistant_session_setup: 'Session setup',
    assistant_session_status_completed: 'Completed',
    assistant_session_status_created: 'Created',
    assistant_session_status_cancelled: 'Cancelled',
    assistant_session_status_interrupted: 'Interrupted',
    assistant_session_status_running: 'Running',
    assistant_session_status_waiting_for_plan_review: 'Waiting for plan review',
    assistant_sessions: 'Sessions',
    assistant_start_session: 'Start session',
    assistant_start_new_chat: 'Start new chat',
    assistant_streaming: 'Streaming',
    assistant_subtitle: 'Album organization assistant',
    assistant_yes: 'yes',
    status: 'Status',
  };

  return {
    t: readable((key: string, options?: { values?: Record<string, string | number> }) =>
      (messages[key] ?? key)
        .replace('{protocol}', String(options?.values?.protocol ?? ''))
        .replace('{version}', String(options?.values?.version ?? '')),
    ),
  };
});

const healthyRunner: AgentRunnerStatusDto = {
  configured: true,
  healthy: true,
  reason: AgentRunnerStatusReason.Healthy,
  version: '0.1.0',
  capabilities: {
    protocolVersion: '2026-05-14',
    streaming: true,
    tools: [],
    models: [],
  },
  checkedAt: '2026-05-14T00:00:00.000Z',
};

const credentials: AgentProviderCredentialResponseDto[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    providerType: ProviderType.Openai,
    label: 'OpenAI personal',
    baseUrl: null,
    models: ['gpt-5.1'],
    defaultModel: 'gpt-5.1',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    lastUsedAt: null,
  },
];

const makeSession = (overrides: Partial<AgentSessionResponseDto> = {}): AgentSessionResponseDto => {
  const id = overrides.id ?? '00000000-0000-4000-8000-000000000100';

  return {
    id,
    status: AgentSessionStatus.Created,
    providerCredentialId: credentials[0].id,
    credentialSnapshot: {
      id: credentials[0].id,
      providerType: AgentProviderType.Openai,
      label: 'OpenAI personal',
      baseUrl: null,
      models: ['gpt-5.1'],
      defaultModel: 'gpt-5.1',
    },
    modelSnapshot: { model: 'gpt-5.1', providerCredentialId: credentials[0].id },
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
    updatedAt: '2026-05-14T00:00:00.000Z',
    endedAt: null,
    ...overrides,
  };
};

const makeMessage = (sessionId: string, text: string): AgentMessageResponseDto => ({
  id: `${sessionId}-message`,
  sessionId,
  role: AgentMessageRole.Assistant,
  providerMessageId: null,
  toolCallId: null,
  content: {
    blocks: [{ type: AgentMessageTextBlockType.Text, text }],
  },
  createdAt: '2026-05-14T00:00:00.000Z',
});

const makeUserMessage = (sessionId: string, text: string): AgentMessageResponseDto => ({
  ...makeMessage(sessionId, text),
  role: AgentMessageRole.User,
});

const requestedSession = makeSession({
  id: '00000000-0000-4000-8000-000000000200',
  status: AgentSessionStatus.Completed,
  createdAt: '2026-05-15T00:00:00.000Z',
});

const actionableSession = makeSession({
  id: '00000000-0000-4000-8000-000000000300',
  status: AgentSessionStatus.Running,
  createdAt: '2026-05-16T00:00:00.000Z',
});

describe(AgentAssistantWorkspace.name, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    history.replaceState(null, '', '/assistant');
    gotoMock.mockResolvedValue(undefined);
    websocketMock.websocketEvents.on.mockReturnValue(vi.fn());
    sdkMock.getAgentSessionMessages.mockResolvedValue([]);
    sdkMock.getCurrentOperationPlan.mockResolvedValue(null);
    sdkMock.getToolCalls.mockResolvedValue([]);
    sdkMock.createAgentSession.mockResolvedValue(actionableSession);
  });

  it('selects a valid requested session and mounts chat and plan panels for it', async () => {
    sdkMock.getAgentSessionMessages.mockResolvedValue([makeMessage(requestedSession.id, 'Existing transcript')]);

    render(AgentAssistantWorkspace, {
      props: {
        runnerStatus: healthyRunner,
        credentials,
        sessions: [actionableSession, requestedSession],
        requestedSessionId: requestedSession.id,
      },
    });

    expect(screen.queryByRole('heading', { name: 'Selected session' })).not.toBeInTheDocument();
    expect(await screen.findByText('Existing transcript')).toBeInTheDocument();
    expect(screen.queryByText('No proposed album plan yet.')).not.toBeInTheDocument();
    expect(gotoMock).not.toHaveBeenCalled();
    expect(sdkMock.getAgentSessionMessages).toHaveBeenCalledWith({ id: requestedSession.id });
    expect(sdkMock.getCurrentOperationPlan).toHaveBeenCalledWith({ id: requestedSession.id });
  });

  it('falls back to the newest actionable session and replaces the missing query param', async () => {
    render(AgentAssistantWorkspace, {
      props: {
        runnerStatus: healthyRunner,
        credentials,
        sessions: [requestedSession, actionableSession],
        requestedSessionId: null,
      },
    });

    await waitFor(() =>
      expect(gotoMock).toHaveBeenCalledWith(`/assistant?session=${actionableSession.id}`, {
        keepFocus: true,
        noScroll: true,
        replaceState: true,
      }),
    );
    expect(screen.getAllByRole('heading', { name: 'New chat' })).not.toHaveLength(0);
  });

  it('falls back from an unknown requested session and replaces the stale query param', async () => {
    render(AgentAssistantWorkspace, {
      props: {
        runnerStatus: healthyRunner,
        credentials,
        sessions: [requestedSession, actionableSession],
        requestedSessionId: '00000000-0000-4000-8000-00000000dead',
      },
    });

    await waitFor(() =>
      expect(gotoMock).toHaveBeenCalledWith(`/assistant?session=${actionableSession.id}`, {
        keepFocus: true,
        noScroll: true,
        replaceState: true,
      }),
    );
    expect(screen.getAllByRole('heading', { name: 'New chat' })).not.toHaveLength(0);
  });

  it('uses push-style navigation when a user selects a session from a no-query new-chat state', async () => {
    const user = userEvent.setup();

    render(AgentAssistantWorkspace, {
      props: {
        runnerStatus: healthyRunner,
        credentials,
        sessions: [requestedSession],
        requestedSessionId: null,
      },
    });

    await user.click(screen.getByTestId(`agent-session-row-${requestedSession.id}`));
    await tick();
    await tick();

    expect(gotoMock).toHaveBeenCalledTimes(1);
    expect(gotoMock).toHaveBeenCalledWith(
      `/assistant?session=${requestedSession.id}`,
      expect.objectContaining({ replaceState: false }),
    );
  });

  it('switches selected sessions through the sidebar and syncs the URL query', async () => {
    const user = userEvent.setup();

    render(AgentAssistantWorkspace, {
      props: {
        runnerStatus: healthyRunner,
        credentials,
        sessions: [actionableSession, requestedSession],
        requestedSessionId: actionableSession.id,
      },
    });

    await user.click(screen.getAllByRole('button', { name: 'New chat' })[0]);
    expect(screen.getByRole('heading', { name: 'Session setup' })).toBeInTheDocument();
    expect(gotoMock).toHaveBeenCalledWith('/assistant', expect.objectContaining({ replaceState: false }));

    await user.click(screen.getByTestId(`agent-session-row-${actionableSession.id}`));
    expect(gotoMock).toHaveBeenLastCalledWith(
      expect.stringContaining(`session=${actionableSession.id}`),
      expect.objectContaining({ replaceState: false }),
    );
  });

  it('adds a newly created session to the sidebar, selects it, and opens the chat workspace', async () => {
    const createdSession = makeSession({
      id: '00000000-0000-4000-8000-000000000400',
      status: AgentSessionStatus.Running,
    });
    sdkMock.createAgentSession.mockResolvedValue(createdSession);

    render(AgentAssistantWorkspace, {
      props: {
        runnerStatus: healthyRunner,
        credentials,
        sessions: [],
        requestedSessionId: null,
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Start session' }));

    expect(await screen.findAllByRole('heading', { name: 'New chat' })).not.toHaveLength(0);
    expect(screen.getByTestId(`agent-session-row-${createdSession.id}`)).toHaveAttribute('aria-current', 'true');
    expect(gotoMock).toHaveBeenCalledWith(
      `/assistant?session=${createdSession.id}`,
      expect.objectContaining({ replaceState: false }),
    );
  });

  it('updates the selected header and matching sidebar row from the selected transcript title', async () => {
    sdkMock.getAgentSessionMessages.mockResolvedValue([
      makeUserMessage(requestedSession.id, 'Create a Porto family highlights album'),
    ]);

    render(AgentAssistantWorkspace, {
      props: {
        runnerStatus: healthyRunner,
        credentials,
        sessions: [actionableSession, requestedSession],
        requestedSessionId: requestedSession.id,
      },
    });

    expect(await screen.findAllByRole('heading', { name: 'Create a Porto family highlights album' })).not.toHaveLength(
      0,
    );
    expect(screen.getByRole('button', { name: /Create a Porto family highlights album/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('lets sidebar search find a newly discovered selected-session title', async () => {
    const user = userEvent.setup();
    sdkMock.getAgentSessionMessages.mockResolvedValue([
      makeUserMessage(requestedSession.id, 'Find all mountain birthday photos'),
    ]);

    render(AgentAssistantWorkspace, {
      props: {
        runnerStatus: healthyRunner,
        credentials,
        sessions: [actionableSession, requestedSession],
        requestedSessionId: requestedSession.id,
      },
    });

    expect(await screen.findByRole('button', { name: /Find all mountain birthday photos/ })).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'mountain birthday');

    expect(screen.getByTestId(`agent-session-row-${requestedSession.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`agent-session-row-${actionableSession.id}`)).not.toBeInTheDocument();
  });

  it('keeps discovered titles cached after switching sessions', async () => {
    const user = userEvent.setup();
    sdkMock.getAgentSessionMessages.mockImplementation(({ id }) =>
      Promise.resolve([
        makeUserMessage(
          id,
          id === requestedSession.id ? 'Review archived wedding favorites' : 'Prepare current cleanup plan',
        ),
      ]),
    );

    render(AgentAssistantWorkspace, {
      props: {
        runnerStatus: healthyRunner,
        credentials,
        sessions: [actionableSession, requestedSession],
        requestedSessionId: requestedSession.id,
      },
    });

    expect(await screen.findAllByRole('heading', { name: 'Review archived wedding favorites' })).not.toHaveLength(0);

    await user.click(screen.getByTestId(`agent-session-row-${actionableSession.id}`));
    expect(await screen.findAllByRole('heading', { name: 'Prepare current cleanup plan' })).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: /Review archived wedding favorites/ })).toBeInTheDocument();

    await user.click(screen.getByTestId(`agent-session-row-${requestedSession.id}`));
    expect(await screen.findAllByRole('heading', { name: 'Review archived wedding favorites' })).not.toHaveLength(0);
  });

  it('does not load transcripts for unselected sidebar sessions', async () => {
    render(AgentAssistantWorkspace, {
      props: {
        runnerStatus: healthyRunner,
        credentials,
        sessions: [actionableSession, requestedSession],
        requestedSessionId: requestedSession.id,
      },
    });

    await waitFor(() => expect(sdkMock.getAgentSessionMessages).toHaveBeenCalled());
    expect(sdkMock.getAgentSessionMessages).not.toHaveBeenCalledWith({ id: actionableSession.id });
  });

  it('updates the selected header and matching sidebar row after cancel success', async () => {
    const cancelledSession = makeSession({ id: actionableSession.id, status: AgentSessionStatus.Cancelled });
    sdkMock.cancelAgentSession.mockResolvedValue(cancelledSession);

    render(AgentAssistantWorkspace, {
      props: {
        runnerStatus: healthyRunner,
        credentials,
        sessions: [actionableSession, requestedSession],
        requestedSessionId: actionableSession.id,
      },
    });

    await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(sdkMock.cancelAgentSession).toHaveBeenCalledWith({ id: actionableSession.id }));
    await waitFor(() => expect(screen.getAllByText('Cancelled')).not.toHaveLength(0));
    expect(screen.getByTestId(`agent-session-row-${actionableSession.id}`)).toHaveTextContent('Cancelled');
    expect(gotoMock).not.toHaveBeenCalledWith('/assistant', expect.anything());
  });

  it('refreshes the selected header and sidebar row after an interrupted resume send', async () => {
    const interruptedSession = makeSession({
      id: '00000000-0000-4000-8000-000000000500',
      status: AgentSessionStatus.Interrupted,
    });
    const refreshedSession = makeSession({ id: interruptedSession.id, status: AgentSessionStatus.Running });
    sdkMock.appendAgentSessionMessage.mockResolvedValue(makeUserMessage(interruptedSession.id, 'Resume organizing'));
    sdkMock.getAgentSession.mockResolvedValue(refreshedSession);

    render(AgentAssistantWorkspace, {
      props: {
        runnerStatus: healthyRunner,
        credentials,
        sessions: [interruptedSession, requestedSession],
        requestedSessionId: interruptedSession.id,
      },
    });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Resume organizing' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

    await waitFor(() => expect(sdkMock.getAgentSession).toHaveBeenCalledWith({ id: interruptedSession.id }));
    expect(screen.getByTestId(`agent-session-row-${interruptedSession.id}`)).toHaveTextContent('Running');
    expect(screen.queryByText('Interrupted')).not.toBeInTheDocument();
  });

  it('terminal composer Start new chat clears selection and URL query', async () => {
    render(AgentAssistantWorkspace, {
      props: {
        runnerStatus: healthyRunner,
        credentials,
        sessions: [requestedSession],
        requestedSessionId: requestedSession.id,
      },
    });

    await fireEvent.click(await screen.findByRole('button', { name: 'Start new chat' }));

    expect(screen.getByRole('heading', { name: 'Session setup' })).toBeInTheDocument();
    expect(gotoMock).toHaveBeenCalledWith('/assistant', expect.objectContaining({ replaceState: false }));
    expect(screen.getByTestId(`agent-session-row-${requestedSession.id}`)).not.toHaveAttribute('aria-current');
  });
});
