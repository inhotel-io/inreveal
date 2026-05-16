import { sdkMock } from '$lib/__mocks__/sdk.mock';
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
import { websocketMock } from '@test-data/mocks/websocket.mock';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { readable } from 'svelte/store';
import AgentSessionChatPanel from './agent-session-chat-panel.svelte';

vi.mock('$lib/stores/websocket');

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_chat: 'Chat',
    assistant_busy_ascii: 'pi is working...',
    assistant_message: 'Message',
    assistant_message_load_error: 'Unable to load messages',
    assistant_message_send_error: 'Unable to send message',
    assistant_resume: 'Resume',
    assistant_send: 'Send',
    assistant_start_new_chat: 'Start new chat',
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

  it('renders assistant markdown emphasis and bullet lists as formatted content', async () => {
    sdkMock.getAgentSessionMessages.mockResolvedValue([
      makeMessage(
        'message-assistant',
        AgentMessageRole.Assistant,
        'Here are **Family picks**:\n- Beach day\n- Birthday cake\n\nUse *favorites* first.',
      ),
    ]);

    render(AgentSessionChatPanel, { props: { session } });

    const boldText = await screen.findByText('Family picks');
    expect(boldText.tagName).toBe('STRONG');
    expect(screen.getByText('favorites').tagName).toBe('EM');
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('Beach day').closest('li')).toBeInTheDocument();
    expect(screen.getByText('Birthday cake').closest('li')).toBeInTheDocument();
  });

  it('renders streamed assistant markdown as formatted content', async () => {
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
      delta: 'Try **Albums**:\n- Travel\n- Family',
      sequence: 1,
      createdAt: '2026-05-14T00:00:01.000Z',
    });

    expect((await screen.findByText('Albums')).tagName).toBe('STRONG');
    expect(screen.getByText('Travel').closest('li')).toBeInTheDocument();
    expect(screen.getByText('Family').closest('li')).toBeInTheDocument();
  });

  it('renders assistant markdown without interpreting raw HTML', async () => {
    sdkMock.getAgentSessionMessages.mockResolvedValue([
      makeMessage('message-assistant', AgentMessageRole.Assistant, 'Keep <script>alert("x")</script> as text.'),
    ]);

    render(AgentSessionChatPanel, { props: { session } });

    expect(await screen.findByText(/<script>alert\("x"\)<\/script>/)).toBeInTheDocument();
    expect(document.querySelector('script')).not.toBeInTheDocument();
  });

  it('reports a discovered title after transcript load', async () => {
    const onTitleDiscovered = vi.fn();
    sdkMock.getAgentSessionMessages.mockResolvedValue([
      makeMessage('message-assistant', AgentMessageRole.Assistant, 'I can help with that.'),
      makeMessage('message-user', AgentMessageRole.User, '  Show   me\nmy albums  '),
    ]);

    render(AgentSessionChatPanel, { props: { session, onTitleDiscovered } });

    await screen.findByText(/Show\s+me\s+my albums/);
    expect(onTitleDiscovered).toHaveBeenCalledTimes(1);
    expect(onTitleDiscovered).toHaveBeenCalledWith(session.id, 'Show me my albums');
  });

  it('does not report a title for assistant-only or blank transcripts', async () => {
    const onTitleDiscovered = vi.fn();
    sdkMock.getAgentSessionMessages.mockResolvedValue([
      makeMessage('message-assistant', AgentMessageRole.Assistant, 'Assistant title'),
      makeMessage('message-blank', AgentMessageRole.User, '   \n\t '),
    ]);

    render(AgentSessionChatPanel, { props: { session, onTitleDiscovered } });

    await screen.findByText('Assistant title');
    await tick();
    expect(onTitleDiscovered).not.toHaveBeenCalled();
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

  it('reports a title from a successful send before transcript load resolves', async () => {
    const onTitleDiscovered = vi.fn();
    let resolveMessages: (messages: AgentMessageResponseDto[]) => void;
    sdkMock.getAgentSessionMessages.mockReturnValue(
      new Promise<AgentMessageResponseDto[]>((resolve) => {
        resolveMessages = resolve;
      }),
    );
    sdkMock.appendAgentSessionMessage.mockResolvedValue(
      makeMessage('message-created', AgentMessageRole.User, 'Organize favorites'),
    );

    render(AgentSessionChatPanel, { props: { session, onTitleDiscovered } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Organize favorites' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onTitleDiscovered).toHaveBeenCalledWith(session.id, 'Organize favorites'));
    expect(onTitleDiscovered).toHaveBeenCalledTimes(1);

    resolveMessages!([]);
  });

  it('does not publish duplicate title discoveries when merged messages repeat', async () => {
    const onTitleDiscovered = vi.fn();
    const sentMessage = makeMessage('message-created', AgentMessageRole.User, 'Organize favorites');
    let resolveMessages: (messages: AgentMessageResponseDto[]) => void;
    sdkMock.getAgentSessionMessages.mockReturnValue(
      new Promise<AgentMessageResponseDto[]>((resolve) => {
        resolveMessages = resolve;
      }),
    );
    sdkMock.appendAgentSessionMessage.mockResolvedValue(sentMessage);

    render(AgentSessionChatPanel, { props: { session, onTitleDiscovered } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Organize favorites' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onTitleDiscovered).toHaveBeenCalledTimes(1));

    resolveMessages!([sentMessage]);
    await tick();

    expect(onTitleDiscovered).toHaveBeenCalledTimes(1);
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

  it('submits a user message from the composer when Enter is pressed', async () => {
    const returnedMessage = makeMessage('message-created', AgentMessageRole.User, 'Organize favorites');
    sdkMock.appendAgentSessionMessage.mockResolvedValue(returnedMessage);

    render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: '  Organize favorites  ' } });
    const wasNotCancelled = await fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(wasNotCancelled).toBe(false);
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
    expect(input).toHaveValue('');
  });

  it('uses caller-provided placeholder and submit label for lifecycle composer states', async () => {
    sdkMock.appendAgentSessionMessage.mockResolvedValue(
      makeMessage('message-created', AgentMessageRole.User, 'Use revision feedback'),
    );

    render(AgentSessionChatPanel, {
      props: {
        session: { ...session, status: AgentSessionStatus.WaitingForPlanReview },
        composerPlaceholder: 'Tell the assistant what to revise',
        submitLabel: 'Resume',
      },
    });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    expect(input).toHaveAttribute('placeholder', 'Tell the assistant what to revise');
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDisabled();

    await fireEvent.input(input, { target: { value: 'Use revision feedback' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

    await waitFor(() => expect(sdkMock.appendAgentSessionMessage).toHaveBeenCalledTimes(1));
    expect(sdkMock.appendAgentSessionMessage).toHaveBeenCalledWith({
      id: session.id,
      agentMessageCreateDto: {
        content: {
          blocks: [{ type: AgentMessageTextBlockType.Text, text: 'Use revision feedback' }],
        },
      },
    });
  });

  it('calls onMessageSent after a successful append without blocking successful send cleanup', async () => {
    const onMessageSent = vi.fn().mockRejectedValue(new Error('refresh failed'));
    sdkMock.appendAgentSessionMessage.mockResolvedValue(
      makeMessage('message-created', AgentMessageRole.User, 'Refresh after this'),
    );

    render(AgentSessionChatPanel, { props: { session, onMessageSent } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Refresh after this' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onMessageSent).toHaveBeenCalledWith(session.id));
    expect(await screen.findByText('Refresh after this')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses terminal action instead of appending when provided', async () => {
    const onTerminalAction = vi.fn();

    render(AgentSessionChatPanel, {
      props: {
        session: { ...session, status: AgentSessionStatus.Completed },
        composerDisabled: true,
        composerDisabledReason: 'This session is complete.',
        terminalActionLabel: 'Start new chat',
        onTerminalAction,
      },
    });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    expect(input).toBeDisabled();
    expect(screen.getByText('This session is complete.')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Start new chat' }));

    expect(onTerminalAction).toHaveBeenCalledTimes(1);
    expect(sdkMock.appendAgentSessionMessage).not.toHaveBeenCalled();
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

  it('shows an ASCII busy indicator immediately while sending the user message', async () => {
    sdkMock.appendAgentSessionMessage.mockReturnValue(new Promise(() => undefined));

    render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Organize this album' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('status')).toHaveTextContent('pi is working...');
    expect(input).toBeDisabled();
  });

  it('animates the ASCII busy indicator through terminal-style frames', async () => {
    vi.useFakeTimers();
    sdkMock.appendAgentSessionMessage.mockReturnValue(new Promise(() => undefined));

    try {
      render(AgentSessionChatPanel, { props: { session } });

      const input = await screen.findByRole('textbox', { name: 'Message' });
      await fireEvent.input(input, { target: { value: 'Organize this album' } });
      await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('pi is working... -');

      vi.advanceTimersByTime(160);
      await tick();
      expect(status).toHaveTextContent('pi is working... \\');

      vi.advanceTimersByTime(160);
      await tick();
      expect(status).toHaveTextContent('pi is working... |');

      vi.advanceTimersByTime(160);
      await tick();
      expect(status).toHaveTextContent('pi is working... /');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the ASCII busy indicator after send succeeds while waiting for the first assistant delta', async () => {
    sdkMock.appendAgentSessionMessage.mockResolvedValue(
      makeMessage('message-created', AgentMessageRole.User, 'Organize screenshots'),
    );

    render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Organize screenshots' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Organize screenshots')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('pi is working...');
  });

  it('replaces the ASCII busy indicator with streamed assistant text on the first delta', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });
    sdkMock.appendAgentSessionMessage.mockResolvedValue(
      makeMessage('message-created', AgentMessageRole.User, 'Start organizing'),
    );

    render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Start organizing' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('status')).toHaveTextContent('pi is working...');

    handler?.({
      type: 'assistant-message-delta',
      sessionId: session.id,
      delta: 'I found',
      sequence: 1,
      createdAt: '2026-05-14T00:00:01.000Z',
    });

    expect(await screen.findByText('I found')).toBeInTheDocument();
    expect(screen.queryByText('pi is working...')).not.toBeInTheDocument();
  });

  it('clears the ASCII busy indicator when the assistant message completes before any delta', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });
    sdkMock.appendAgentSessionMessage.mockResolvedValue(
      makeMessage('message-created', AgentMessageRole.User, 'Make an album'),
    );

    render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Make an album' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('status')).toHaveTextContent('pi is working...');

    handler?.({
      type: 'assistant-message-created',
      sessionId: session.id,
      message: makeMessage('message-assistant-created', AgentMessageRole.Assistant, 'Done.'),
      createdAt: '2026-05-14T00:00:02.000Z',
    });

    expect(await screen.findByText('Done.')).toBeInTheDocument();
    expect(screen.queryByText('pi is working...')).not.toBeInTheDocument();
  });

  it('clears the ASCII busy indicator when the runner reports an error before any delta', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });
    sdkMock.appendAgentSessionMessage.mockResolvedValue(
      makeMessage('message-created', AgentMessageRole.User, 'Make an album'),
    );

    render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Make an album' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('status')).toHaveTextContent('pi is working...');

    handler?.({
      type: 'runner-error',
      sessionId: session.id,
      message: 'Runner failed',
      createdAt: '2026-05-14T00:00:02.000Z',
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Runner failed');
    expect(screen.queryByText('pi is working...')).not.toBeInTheDocument();
  });

  it('does not allow another message while an assistant response is active', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });
    sdkMock.appendAgentSessionMessage.mockResolvedValue(
      makeMessage('message-created', AgentMessageRole.User, 'Start task'),
    );

    render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Start task' } });
    const sendButton = screen.getByRole('button', { name: 'Send' });

    await fireEvent.click(sendButton);
    await waitFor(() => expect(input).toBeDisabled());
    expect(sendButton).toBeDisabled();

    handler?.({
      type: 'assistant-message-created',
      sessionId: session.id,
      message: makeMessage('message-assistant-created', AgentMessageRole.Assistant, 'Done.'),
      createdAt: '2026-05-14T00:00:02.000Z',
    });

    await waitFor(() => expect(input).not.toBeDisabled());
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

  it('ignores operation plan ready websocket events without interrupting an active response', async () => {
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

    handler?.({
      type: 'operation-plan-ready',
      sessionId: session.id,
      planId: '00000000-0000-4000-8000-000000000200',
      revision: 1,
    });
    await tick();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  it.each([
    [AgentSessionStatus.Applying, 'applying'],
    [AgentSessionStatus.Completed, 'completed'],
    [AgentSessionStatus.Cancelled, 'cancelled'],
    [AgentSessionStatus.Failed, 'failed'],
  ])('clears active streaming when session status becomes %s', async (status) => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });

    const { rerender } = render(AgentSessionChatPanel, { props: { session } });
    const input = await screen.findByRole('textbox', { name: 'Message' });

    handler?.({
      type: 'assistant-message-delta',
      sessionId: session.id,
      delta: 'Partial lifecycle response',
      sequence: 1,
      createdAt: '2026-05-14T00:00:01.000Z',
    });
    expect(await screen.findByText('Partial lifecycle response')).toBeInTheDocument();
    expect(input).toBeDisabled();

    await rerender({ session: { ...session, status } });

    await waitFor(() => expect(screen.queryByText('Partial lifecycle response')).not.toBeInTheDocument());
    expect(input).not.toBeDisabled();
  });

  it('clears the ASCII busy indicator when the session becomes terminal before any assistant text streams', async () => {
    sdkMock.appendAgentSessionMessage.mockResolvedValue(makeMessage('message-created', AgentMessageRole.User, 'Start task'));

    const { rerender } = render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Start task' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('status')).toHaveTextContent('pi is working...');

    await rerender({ session: { ...session, status: AgentSessionStatus.Cancelled } });

    await waitFor(() => expect(screen.queryByText('pi is working...')).not.toBeInTheDocument());
    expect(input).not.toBeDisabled();
  });

  it('renders only one ASCII busy indicator while send and assistant activity overlap', async () => {
    let resolveSend: (message: AgentMessageResponseDto) => void;
    sdkMock.appendAgentSessionMessage.mockReturnValue(
      new Promise<AgentMessageResponseDto>((resolve) => {
        resolveSend = resolve;
      }),
    );

    render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: 'Start task' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(screen.getAllByText('pi is working...')).toHaveLength(1);

    resolveSend!(makeMessage('message-created', AgentMessageRole.User, 'Start task'));
    await tick();

    expect(screen.getAllByText('pi is working...')).toHaveLength(1);
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
