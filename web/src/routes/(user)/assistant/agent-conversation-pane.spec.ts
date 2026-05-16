import { sdkMock } from '$lib/__mocks__/sdk.mock';
import {
  AgentApprovalMode,
  AgentMessageRole,
  AgentMessageTextBlockType,
  AgentOperationPlanStatus,
  AgentPermissionPreset,
  AgentProviderType,
  AgentSessionStatus,
  type AgentMessageResponseDto,
  type AgentSessionResponseDto,
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
    assistant_chat: 'Chat',
    assistant_details: 'Details',
    assistant_close_details: 'Close details',
    assistant_created_at: 'Created',
    assistant_dismiss_details: 'Dismiss details',
    assistant_ended_at: 'Ended',
    assistant_message: 'Message',
    assistant_message_load_error: 'Unable to load messages',
    assistant_model: 'Model',
    assistant_models: 'Models',
    assistant_new_chat: 'New chat',
    assistant_no: 'no',
    assistant_not_available: 'Not available',
    assistant_operation_plan_empty: 'No proposed album plan yet.',
    assistant_operation_plan_error: 'Unable to load proposed album plan',
    assistant_operation_plan_loading: 'Loading proposed album plan',
    assistant_permission_preset: 'Permission preset',
    assistant_permission_preset_careful: 'Careful',
    assistant_protocol_version: 'Protocol version',
    assistant_provider_credential: 'Provider credential',
    assistant_runner_capabilities: 'Runner capabilities',
    assistant_send: 'Send',
    assistant_session_details: 'Session details',
    assistant_session_status_completed: 'Completed',
    assistant_session_status_created: 'Created',
    assistant_session_status_running: 'Running',
    assistant_streaming: 'Streaming',
    assistant_tools: 'Tools',
    assistant_updated_at: 'Updated',
    assistant_yes: 'yes',
    status: 'Status',
  };

  return {
    t: readable((key: string) => messages[key] ?? key),
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

describe(AgentConversationPane.name, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    websocketMock.websocketEvents.on.mockReturnValue(vi.fn());
    sdkMock.getAgentSessionMessages.mockResolvedValue([]);
    sdkMock.getCurrentOperationPlan.mockResolvedValue(null);
  });

  it('renders a compact header, chat, and plan review without the old persistent summary', async () => {
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
    expect(await screen.findByText('No proposed album plan yet.')).toBeInTheDocument();
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
