import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { websocketMock } from '@test-data/mocks/websocket.mock';
import {
  AgentApprovalMode,
  AgentMessageRole,
  AgentMessageTextBlockType,
  AgentPermissionPreset,
  AgentProviderType,
  AgentSessionStatus,
  type AgentMessageResponseDto,
  type AgentSessionResponseDto,
} from '@immich/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import AgentSessionChatPanel from './agent-session-chat-panel.svelte';

vi.mock('$lib/stores/websocket');

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_chat: 'Chat',
    assistant_message: 'Message',
    assistant_message_load_error: 'Unable to load messages',
    assistant_message_send_error: 'Unable to send message',
    assistant_send: 'Send',
    assistant_streaming_response: 'Assistant is responding',
  };

  return {
    t: readable((key: string) => messages[key] ?? key),
  };
});

const session: AgentSessionResponseDto = {
  id: '00000000-0000-4000-8000-000000000100',
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
  permissionPreset: AgentPermissionPreset.VisualOrganizer,
  approvalMode: AgentApprovalMode.AskOnEscalation,
  runnerCapabilitiesSnapshot: { protocolVersion: '2026-05-14', streaming: true, tools: ['echo'], models: [] },
  runnerEndpoint: 'http://agent-runner:4477',
  runnerSessionId: 'stub-00000000-0000-4000-8000-000000000100',
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:00:00.000Z',
  endedAt: null,
};

const makeMessage = (
  id: string,
  role: AgentMessageRole,
  text: string,
  sessionId = session.id,
): AgentMessageResponseDto => ({
  id,
  sessionId,
  role,
  providerMessageId: null,
  toolCallId: null,
  content: {
    blocks: [{ type: AgentMessageTextBlockType.Text, text }],
  },
  createdAt: '2026-05-14T00:00:00.000Z',
});

describe(AgentSessionChatPanel.name, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdkMock.getAgentSessionMessages.mockResolvedValue([]);
    websocketMock.websocketEvents.on.mockReturnValue(vi.fn());
  });

  it('loads transcript for session', async () => {
    sdkMock.getAgentSessionMessages.mockResolvedValue([
      makeMessage('message-user', AgentMessageRole.User, 'Show me my albums'),
      makeMessage('message-assistant', AgentMessageRole.Assistant, 'I can help with that.'),
    ]);

    render(AgentSessionChatPanel, { props: { session } });

    expect(await screen.findByText('Show me my albums')).toBeInTheDocument();
    expect(screen.getByText('I can help with that.')).toBeInTheDocument();
    expect(sdkMock.getAgentSessionMessages).toHaveBeenCalledWith({ id: session.id });
  });

  it('keeps messages received before the initial transcript load resolves', async () => {
    let resolveMessages: (messages: AgentMessageResponseDto[]) => void;
    sdkMock.getAgentSessionMessages.mockReturnValue(
      new Promise<AgentMessageResponseDto[]>((resolve) => {
        resolveMessages = resolve;
      }),
    );
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });

    render(AgentSessionChatPanel, { props: { session } });
    await screen.findByRole('textbox', { name: 'Message' });

    handler?.({
      type: 'assistant-message-created',
      sessionId: session.id,
      message: makeMessage('message-live', AgentMessageRole.Assistant, 'Live response'),
      createdAt: '2026-05-14T00:00:02.000Z',
    });
    expect(await screen.findByText('Live response')).toBeInTheDocument();

    resolveMessages!([makeMessage('message-loaded', AgentMessageRole.User, 'Loaded prompt')]);

    expect(await screen.findByText('Loaded prompt')).toBeInTheDocument();
    expect(screen.getByText('Live response')).toBeInTheDocument();
  });

  it('shows error when transcript loading fails', async () => {
    sdkMock.getAgentSessionMessages.mockRejectedValue(new Error('failed'));

    render(AgentSessionChatPanel, { props: { session } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load messages');
  });

  it('sends a user message and clears input', async () => {
    const returnedMessage = makeMessage('message-created', AgentMessageRole.User, 'Organize favorites');
    sdkMock.appendAgentSessionMessage.mockResolvedValue(returnedMessage);

    render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: '  Organize favorites  ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(sdkMock.appendAgentSessionMessage).toHaveBeenCalledWith({
        id: session.id,
        agentMessageCreateDto: {
          content: {
            blocks: [{ type: AgentMessageTextBlockType.Text, text: 'Organize favorites' }],
          },
        },
      }),
    );
    expect(await screen.findByText('Organize favorites')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('shows send error and keeps draft when append fails', async () => {
    sdkMock.appendAgentSessionMessage.mockRejectedValue(new Error('failed'));

    render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Keep this draft' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to send message');
    expect(input).toHaveValue('Keep this draft');
  });

  it('does not submit duplicate messages while a send is in progress', async () => {
    sdkMock.appendAgentSessionMessage.mockReturnValue(new Promise(() => undefined));

    render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Only once' } });
    const sendButton = screen.getByRole('button', { name: 'Send' });

    await fireEvent.click(sendButton);
    await fireEvent.click(sendButton);

    expect(sdkMock.appendAgentSessionMessage).toHaveBeenCalledTimes(1);
  });

  it('renders streaming deltas and completed assistant messages from websocket events', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });

    render(AgentSessionChatPanel, { props: { session } });
    await screen.findByRole('textbox', { name: 'Message' });

    handler?.({
      type: 'assistant-message-delta',
      sessionId: session.id,
      delta: 'Thinking...',
      sequence: 1,
      createdAt: '2026-05-14T00:00:01.000Z',
    });

    expect(await screen.findByText('Thinking...')).toBeInTheDocument();
    expect(screen.getByText('Assistant is responding')).toBeInTheDocument();

    handler?.({
      type: 'assistant-message-created',
      sessionId: session.id,
      message: makeMessage('message-assistant-created', AgentMessageRole.Assistant, 'Done.'),
      createdAt: '2026-05-14T00:00:02.000Z',
    });

    expect(await screen.findByText('Done.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Thinking...')).not.toBeInTheDocument());
  });

  it('clears streaming text when the runner reports an error', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });

    render(AgentSessionChatPanel, { props: { session } });
    await screen.findByRole('textbox', { name: 'Message' });

    handler?.({
      type: 'assistant-message-delta',
      sessionId: session.id,
      delta: 'Partial response',
      sequence: 1,
      createdAt: '2026-05-14T00:00:01.000Z',
    });
    expect(await screen.findByText('Partial response')).toBeInTheDocument();

    handler?.({
      type: 'runner-error',
      sessionId: session.id,
      message: 'Runner failed',
      createdAt: '2026-05-14T00:00:02.000Z',
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Runner failed');
    await waitFor(() => expect(screen.queryByText('Partial response')).not.toBeInTheDocument());
  });

  it('renders a visible label for the message draft', async () => {
    render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    const label = screen.getByText('Message');

    expect(label).toBeVisible();
    expect(label).toHaveAttribute('for', input.id);
  });

  it('ignores websocket events for other sessions', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });

    render(AgentSessionChatPanel, { props: { session } });
    await screen.findByRole('textbox', { name: 'Message' });

    handler?.({
      type: 'assistant-message-created',
      sessionId: '00000000-0000-4000-8000-000000000999',
      message: makeMessage('other-message', AgentMessageRole.Assistant, 'Not for this session', 'other-session'),
      createdAt: '2026-05-14T00:00:02.000Z',
    });

    expect(screen.queryByText('Not for this session')).not.toBeInTheDocument();
  });

  it('cleans up websocket listener on destroy', () => {
    const cleanup = vi.fn();
    websocketMock.websocketEvents.on.mockReturnValue(cleanup);

    const { unmount } = render(AgentSessionChatPanel, { props: { session } });
    unmount();

    expect(cleanup).toHaveBeenCalled();
  });
});
