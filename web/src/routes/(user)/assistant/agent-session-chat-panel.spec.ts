import { sdkMock } from '$lib/__mocks__/sdk.mock';
import {
  AgentApprovalMode,
  AgentMessageRole,
  AgentMessageTextBlockType,
  AgentPermissionPreset,
  AgentProviderType,
  AgentSessionStatus,
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
  type AgentMessageResponseDto,
  type AgentSessionResponseDto,
  type AgentToolCallResponseDto,
} from '@immich/sdk';
import { websocketMock } from '@test-data/mocks/websocket.mock';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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
    assistant_agent_tool_data_class_metadata: 'Metadata',
    assistant_agent_tool_name_listAlbums: 'List albums',
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

const makeToolCall = (overrides: Partial<AgentToolCallResponseDto> = {}): AgentToolCallResponseDto => ({
  id: overrides.id ?? 'tool-call-1',
  sessionId: overrides.sessionId ?? session.id,
  toolName: overrides.toolName ?? AgentToolName.ListAlbums,
  status: overrides.status ?? AgentToolCallStatus.Completed,
  approvalDecision: overrides.approvalDecision ?? null,
  requestSummary: overrides.requestSummary ?? 'List albums',
  responseSummary: overrides.responseSummary ?? 'Returned 1 album(s)',
  dataClass: overrides.dataClass ?? AgentToolDataClass.Metadata,
  assetCount: overrides.assetCount ?? 0,
  albumCount: overrides.albumCount ?? 1,
  startedAt: overrides.startedAt ?? '2026-05-16T11:56:50.000Z',
  completedAt: overrides.completedAt ?? '2026-05-16T11:56:55.000Z',
  error: overrides.error ?? null,
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

  it('renders handled tool calls as plain-language activity with expandable details', async () => {
    render(AgentSessionChatPanel, {
      props: {
        session,
        toolCalls: [makeToolCall()],
      },
    });

    const activity = await screen.findByRole('article', { name: 'Pi checked your albums: Done' });
    expect(activity).toHaveTextContent('Pi checked your albums.');
    expect(activity).toHaveTextContent('1 album');
    expect(activity).not.toHaveTextContent('List albums');
    expect(activity).not.toHaveTextContent('Returned 1 album(s)');

    await fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    expect(activity).toHaveTextContent('List albums');
    expect(activity).toHaveTextContent('Returned 1 album(s)');
    expect(activity).toHaveTextContent('Metadata');
  });

  it('renders approved tool calls as in-progress chat activity', async () => {
    render(AgentSessionChatPanel, {
      props: {
        session,
        toolCalls: [
          makeToolCall({
            status: AgentToolCallStatus.Approved,
            approvalDecision: AgentToolApprovalDecision.Approved,
            responseSummary: 'Tool call approved by user',
            completedAt: null,
          }),
        ],
      },
    });

    const activity = await screen.findByRole('article', { name: 'Pi checked your albums: Approved' });
    expect(activity).toHaveTextContent('Pi checked your albums.');
    expect(activity).toHaveTextContent('Approved');
  });

  it('renders denied and failed handled tool call details with request and error context', async () => {
    render(AgentSessionChatPanel, {
      props: {
        session,
        toolCalls: [
          makeToolCall({
            id: 'denied-tool-call',
            status: AgentToolCallStatus.Denied,
            approvalDecision: AgentToolApprovalDecision.Denied,
            requestSummary: 'Read private screenshots',
            responseSummary: '',
            error: 'You denied access.',
            completedAt: '2026-05-16T11:57:00.000Z',
          }),
          makeToolCall({
            id: 'failed-tool-call',
            status: AgentToolCallStatus.Failed,
            requestSummary: 'List albums before organizing',
            responseSummary: '',
            error: 'Album service timed out.',
            completedAt: '2026-05-16T11:58:00.000Z',
          }),
        ],
      },
    });

    const deniedActivity = await screen.findByRole('article', { name: 'Pi checked your albums: Not allowed' });
    expect(deniedActivity).toHaveTextContent('Pi checked your albums.');
    expect(deniedActivity).not.toHaveTextContent('Read private screenshots');
    expect(deniedActivity).not.toHaveTextContent('You denied access.');

    await fireEvent.click(within(deniedActivity).getByRole('button', { name: 'Details' }));

    expect(deniedActivity).toHaveTextContent('Read private screenshots');
    expect(deniedActivity).toHaveTextContent('You denied access.');

    const failedActivity = screen.getByRole('article', { name: 'Pi checked your albums: Failed' });
    await fireEvent.click(within(failedActivity).getByRole('button', { name: 'Details' }));

    expect(failedActivity).toHaveTextContent('List albums before organizing');
    expect(failedActivity).toHaveTextContent('Album service timed out.');
  });

  it('renders assistant markdown headings and inline code as formatted content', async () => {
    sdkMock.getAgentSessionMessages.mockResolvedValue([
      makeMessage(
        'message-assistant',
        AgentMessageRole.Assistant,
        '# Heading 1\n## Heading 2\n### Heading 3\nUse `inline code` in text.',
      ),
    ]);

    render(AgentSessionChatPanel, { props: { session } });

    expect(await screen.findByRole('heading', { level: 3, name: 'Heading 1' })).toHaveClass('text-xl');
    expect(screen.getByRole('heading', { level: 4, name: 'Heading 2' })).toHaveClass('text-lg');
    expect(screen.getByRole('heading', { level: 5, name: 'Heading 3' })).toHaveClass('text-base');
    expect(screen.getByText('inline code').tagName).toBe('CODE');
  });

  it('renders assistant fenced multiline code blocks as formatted code', async () => {
    sdkMock.getAgentSessionMessages.mockResolvedValue([
      makeMessage(
        'message-assistant',
        AgentMessageRole.Assistant,
        'Use this:\n```python\ndef hello(name):\n    return f\"Hello, {name}!\"\n```\nThen save it.',
      ),
    ]);

    render(AgentSessionChatPanel, { props: { session } });

    const code = await screen.findByText(/def hello\(name\):/);
    expect(code.tagName).toBe('CODE');
    expect(code.closest('pre')).toBeInTheDocument();
    expect(code).toHaveTextContent('return f"Hello, {name}!"');
    expect(screen.getByText('Then save it.')).toBeInTheDocument();
  });

  it('renders streamed assistant fenced multiline code blocks as formatted code', async () => {
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
      delta: '```ts\nconst album = \"Favorites\";\nconsole.log(album);\n```',
      sequence: 1,
      createdAt: '2026-05-14T00:00:01.000Z',
    });

    const code = await screen.findByText(/const album = "Favorites";/);
    expect(code.tagName).toBe('CODE');
    expect(code.closest('pre')).toBeInTheDocument();
    expect(code).toHaveTextContent('console.log(album);');
  });

  it('renders assistant markdown tables as formatted content', async () => {
    sdkMock.getAgentSessionMessages.mockResolvedValue([
      makeMessage(
        'message-assistant',
        AgentMessageRole.Assistant,
        [
          'Rendered:',
          '| Feature | Supported | Notes |',
          '| --- | --- | --- |',
          '| Headings | Yes | #, ##, ### |',
          '| Inline styles | Yes | **bold**, *italic*, `code` |',
          'Done.',
        ].join('\n'),
      ),
    ]);

    render(AgentSessionChatPanel, { props: { session } });

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Feature' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Supported' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Headings' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '#, ##, ###' })).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
    expect(screen.getByText('code').tagName).toBe('CODE');
    expect(screen.getByText('Done.')).toBeInTheDocument();
  });

  it('renders assistant markdown links and images as formatted content', async () => {
    sdkMock.getAgentSessionMessages.mockResolvedValue([
      makeMessage(
        'message-assistant',
        AgentMessageRole.Assistant,
        [
          '[Inline link](https://example.com)',
          '[Link with title](https://example.com "Example Site")',
          '![Alt text for image](https://via.placeholder.com/150 "Optional title")',
        ].join('\n'),
      ),
    ]);

    render(AgentSessionChatPanel, { props: { session } });

    const inlineLink = await screen.findByRole('link', { name: 'Inline link' });
    expect(inlineLink).toHaveAttribute('href', 'https://example.com');
    expect(inlineLink).toHaveAttribute('target', '_blank');
    expect(inlineLink).toHaveAttribute('rel', 'noreferrer');

    const titledLink = screen.getByRole('link', { name: 'Link with title' });
    expect(titledLink).toHaveAttribute('title', 'Example Site');

    const image = screen.getByRole('img', { name: 'Alt text for image' });
    expect(image).toHaveAttribute('src', 'https://via.placeholder.com/150');
    expect(image).toHaveAttribute('title', 'Optional title');
  });

  it('renders streamed assistant markdown links and images as formatted content', async () => {
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
      delta: '[Docs](https://example.com/docs)\n![Preview](https://example.com/preview.jpg)',
      sequence: 1,
      createdAt: '2026-05-14T00:00:01.000Z',
    });

    expect(await screen.findByRole('link', { name: 'Docs' })).toHaveAttribute('href', 'https://example.com/docs');
    expect(screen.getByRole('img', { name: 'Preview' })).toHaveAttribute('src', 'https://example.com/preview.jpg');
  });

  it('renders streamed assistant markdown tables as formatted content', async () => {
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
      delta: '| Album | Count |\n| --- | --- |\n| Favorites | 42 |',
      sequence: 1,
      createdAt: '2026-05-14T00:00:01.000Z',
    });

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Album' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Favorites' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '42' })).toBeInTheDocument();
  });

  it('renders streamed assistant markdown headings and inline code as formatted content', async () => {
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
      delta: '## Suggested query\nTry `rating:5`.',
      sequence: 1,
      createdAt: '2026-05-14T00:00:01.000Z',
    });

    expect(await screen.findByRole('heading', { level: 4, name: 'Suggested query' })).toBeInTheDocument();
    expect(screen.getByText('rating:5').tagName).toBe('CODE');
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

  it('shows the submitted user message immediately and blocks composer while append is active', async () => {
    let handler: Parameters<typeof websocketMock.websocketEvents.on>[1] | undefined;
    websocketMock.websocketEvents.on.mockImplementation((_eventName, nextHandler) => {
      handler = nextHandler;
      return vi.fn();
    });
    let resolveAppend: (message: AgentMessageResponseDto) => void;
    sdkMock.appendAgentSessionMessage.mockReturnValue(
      new Promise<AgentMessageResponseDto>((resolve) => {
        resolveAppend = resolve;
      }),
    );

    render(AgentSessionChatPanel, { props: { session } });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await fireEvent.input(input, { target: { value: '  Organize favorites  ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Organize favorites')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    resolveAppend!(makeMessage('message-created', AgentMessageRole.User, 'Organize favorites'));
    handler?.({
      type: 'assistant-message-created',
      sessionId: session.id,
      message: makeMessage('message-assistant-created', AgentMessageRole.Assistant, 'Done.'),
      createdAt: '2026-05-14T00:00:01.000Z',
    });

    await waitFor(() => expect(input).toBeEnabled());
    expect(screen.getByText('Organize favorites')).toBeInTheDocument();
  });

  it('sorts messages and handled tool calls deterministically by timestamp and id', async () => {
    sdkMock.getAgentSessionMessages.mockResolvedValue([
      {
        ...makeMessage('message-b', AgentMessageRole.User, 'Second same-time message'),
        createdAt: '2026-05-16T10:00:00.000Z',
      },
      {
        ...makeMessage('message-a', AgentMessageRole.Assistant, 'First same-time message'),
        createdAt: '2026-05-16T10:00:00.000Z',
      },
      {
        ...makeMessage('message-later', AgentMessageRole.Assistant, 'Later assistant response'),
        createdAt: '2026-05-16T10:02:00.000Z',
      },
    ]);

    render(AgentSessionChatPanel, {
      props: {
        session,
        toolCalls: [
          makeToolCall({
            id: 'middle-tool',
            status: AgentToolCallStatus.Completed,
            requestSummary: 'Check albums between messages',
            responseSummary: 'Returned 1 album(s)',
            startedAt: '2026-05-16T10:01:00.000Z',
            completedAt: '2026-05-16T10:01:05.000Z',
          }),
        ],
      },
    });

    const transcript = await screen.findByTestId('agent-session-chat-transcript');
    await screen.findByText('Later assistant response');

    expect(Array.from(transcript.querySelectorAll('[data-chat-item]')).map((item) => item.textContent)).toEqual([
      expect.stringContaining('First same-time message'),
      expect.stringContaining('Second same-time message'),
      expect.stringContaining('Pi checked your albums.'),
      expect.stringContaining('Later assistant response'),
    ]);
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

  it('treats tool approval websocket events as a pause without showing an error', async () => {
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
      delta: 'Checking albums...',
      sequence: 1,
      createdAt: '2026-05-14T00:00:01.000Z',
    });
    expect(await screen.findByText('Checking albums...')).toBeInTheDocument();

    handler?.({
      type: 'tool-approval-needed',
      sessionId: session.id,
      toolCallId: '00000000-0000-4000-8000-000000000333',
      createdAt: '2026-05-14T00:00:02.000Z',
    });

    await waitFor(() => expect(screen.queryByText('Checking albums...')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
    sdkMock.appendAgentSessionMessage.mockResolvedValue(
      makeMessage('message-created', AgentMessageRole.User, 'Start task'),
    );

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
