import { sdkMock } from '$lib/__mocks__/sdk.mock';
import {
  AgentApprovalMode,
  AgentPermissionPreset,
  AgentProviderType,
  AgentRunnerStatusReason,
  AgentSessionStatus,
  ProviderType,
  type AgentProviderCredentialResponseDto,
  type AgentRunnerStatusDto,
  type AgentSessionResponseDto,
} from '@immich/sdk';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import AgentSessionPageContent from './agent-session-page-content.svelte';

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant: 'Assistant',
    assistant_approval_mode: 'Approval mode',
    assistant_approval_mode_ask_on_escalation: 'Ask on escalation',
    assistant_approval_mode_plan_only: 'Plan review only',
    assistant_approval_mode_strict: 'Strict',
    assistant_configured: 'Configured',
    assistant_created_session: 'Created session',
    assistant_healthy: 'Healthy',
    assistant_model: 'Model',
    assistant_no: 'no',
    assistant_no_credentials: 'Add an agent provider credential before starting a session.',
    assistant_permission_preset: 'Permission preset',
    assistant_permission_preset_careful: 'Careful',
    assistant_permission_preset_local_power_user: 'Local power user',
    assistant_permission_preset_visual_organizer: 'Visual organizer',
    assistant_protocol: 'Protocol {protocol}',
    assistant_provider_credential: 'Provider credential',
    assistant_runner: 'Runner {version}',
    assistant_runner_healthy: 'Runner healthy',
    assistant_runner_not_configured: 'Runner not configured',
    assistant_runner_unavailable: 'Runner unavailable',
    assistant_session_created: 'Assistant session started',
    assistant_session_setup: 'Session setup',
    assistant_start_session: 'Start session',
    assistant_streaming: 'Streaming',
    assistant_subtitle: 'Album organization assistant',
    assistant_yes: 'yes',
    unknown: 'Unknown',
  };

  return {
    t: readable((key: string, options?: { values?: Record<string, string> }) =>
      (messages[key] ?? key)
        .replace('{protocol}', options?.values?.protocol ?? '')
        .replace('{version}', options?.values?.version ?? ''),
    ),
  };
});

vi.mock('./agent-session-ui', () => ({
  DEFAULT_AGENT_APPROVAL_MODE: AgentApprovalMode.Strict,
  DEFAULT_AGENT_PERMISSION_PRESET: AgentPermissionPreset.Careful,
  approvalModeOptions: [
    { value: AgentApprovalMode.Strict, labelKey: 'assistant_approval_mode_strict' },
    { value: AgentApprovalMode.AskOnEscalation, labelKey: 'assistant_approval_mode_ask_on_escalation' },
    { value: AgentApprovalMode.PlanOnly, labelKey: 'assistant_approval_mode_plan_only' },
  ],
  getApprovalModeLabelKey: (mode: AgentApprovalMode) => `approval:${mode}`,
  getDefaultModel: (credential: AgentProviderCredentialResponseDto | undefined) => credential?.defaultModel ?? '',
  getInitialCredentialId: (credentials: AgentProviderCredentialResponseDto[]) => credentials[0]?.id ?? '',
  getPermissionPresetLabelKey: (preset: AgentPermissionPreset) => `preset:${preset}`,
  getSessionStatusLabelKey: (status: AgentSessionStatus) => `status:${status}`,
  permissionPresetOptions: [
    { value: AgentPermissionPreset.Careful, labelKey: 'assistant_permission_preset_careful' },
    { value: AgentPermissionPreset.VisualOrganizer, labelKey: 'assistant_permission_preset_visual_organizer' },
    { value: AgentPermissionPreset.LocalPowerUser, labelKey: 'assistant_permission_preset_local_power_user' },
  ],
}));

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

const unavailableRunner: AgentRunnerStatusDto = {
  configured: true,
  healthy: false,
  reason: AgentRunnerStatusReason.Timeout,
  version: null,
  capabilities: null,
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

const createdSession: AgentSessionResponseDto = {
  id: '00000000-0000-4000-8000-000000000100',
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
  permissionPreset: AgentPermissionPreset.VisualOrganizer,
  approvalMode: AgentApprovalMode.AskOnEscalation,
  runnerCapabilitiesSnapshot: null,
  runnerEndpoint: null,
  runnerSessionId: null,
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:00:00.000Z',
  endedAt: null,
};

describe(AgentSessionPageContent.name, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdkMock.createAgentSession.mockResolvedValue(createdSession);
  });

  it('renders runner status and setup for a healthy runner with credentials', () => {
    render(AgentSessionPageContent, { props: { runnerStatus: healthyRunner, credentials } });

    expect(screen.getByTestId('assistant-status-reason')).toHaveTextContent('Runner healthy');
    expect(screen.getByRole('heading', { name: 'Session setup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'Created session' })).not.toBeInTheDocument();
  });

  it('renders created-session summary only after successful creation', async () => {
    render(AgentSessionPageContent, { props: { runnerStatus: healthyRunner, credentials } });

    await fireEvent.click(screen.getByRole('button', { name: 'Start session' }));

    expect(await screen.findByRole('heading', { name: 'Created session' })).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Created session' });
    expect(within(summary).getByText('OpenAI personal')).toBeInTheDocument();
    expect(within(summary).getByText('gpt-5.1')).toBeInTheDocument();
    expect(within(summary).getByText(`status:${AgentSessionStatus.Created}`)).toBeInTheDocument();
    expect(within(summary).getByText(`preset:${AgentPermissionPreset.VisualOrganizer}`)).toBeInTheDocument();
    expect(within(summary).getByText(`approval:${AgentApprovalMode.AskOnEscalation}`)).toBeInTheDocument();
  });

  it('renders setup disabled when the runner is unavailable', () => {
    render(AgentSessionPageContent, { props: { runnerStatus: unavailableRunner, credentials } });

    expect(screen.getByTestId('assistant-status-reason')).toHaveTextContent('Runner unavailable');
    expect(screen.getByRole('button', { name: 'Start session' })).toBeDisabled();
  });

  it('renders setup disabled when there are no credentials', () => {
    render(AgentSessionPageContent, { props: { runnerStatus: healthyRunner, credentials: [] } });

    expect(screen.getByText('Add an agent provider credential before starting a session.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start session' })).toBeDisabled();
  });
});
