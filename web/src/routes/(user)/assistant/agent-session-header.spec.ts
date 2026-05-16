import {
  AgentApprovalMode,
  AgentPermissionPreset,
  AgentProviderType,
  AgentSessionStatus,
  type AgentSessionResponseDto,
} from '@immich/sdk';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'svelte';
import { readable } from 'svelte/store';
import AgentSessionHeader from './agent-session-header.svelte';

vi.mock('svelte-i18n', () => {
  const messages: Record<string, string> = {
    assistant_approval_mode: 'Approval mode',
    assistant_approval_mode_strict: 'Strict',
    assistant_details: 'Details',
    assistant_model: 'Model',
    assistant_new_chat: 'New chat',
    assistant_provider_credential: 'Provider credential',
    assistant_session_status_running: 'Running',
    assistant_session_status_waiting_for_plan_review: 'Waiting for plan review',
  };

  return { t: readable((key: string) => messages[key] ?? key) };
});

const makeSession = (overrides: Partial<AgentSessionResponseDto> = {}): AgentSessionResponseDto => ({
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
  permissionPreset: AgentPermissionPreset.Careful,
  approvalMode: AgentApprovalMode.Strict,
  runnerCapabilitiesSnapshot: null,
  runnerEndpoint: null,
  runnerSessionId: null,
  createdAt: '2026-05-16T09:00:00.000Z',
  updatedAt: '2026-05-16T09:30:00.000Z',
  endedAt: null,
  ...overrides,
});

const renderHeader = (props: Partial<ComponentProps<typeof AgentSessionHeader>> = {}) => {
  const onNewChat = vi.fn();
  const onOpenDetails = vi.fn();

  render(AgentSessionHeader, {
    props: {
      session: makeSession(),
      title: null,
      onNewChat,
      onOpenDetails,
      ...props,
    },
  });

  return { onNewChat, onOpenDetails };
};

describe(AgentSessionHeader.name, () => {
  it('renders the fallback title, status badge, provider, model, and approval mode', () => {
    renderHeader({
      session: makeSession({ status: AgentSessionStatus.WaitingForPlanReview }),
    });

    expect(screen.getByRole('heading', { name: 'New chat' })).toBeInTheDocument();
    expect(screen.getByText('Waiting for plan review')).toBeInTheDocument();
    expect(screen.getByText('OpenAI personal')).toBeInTheDocument();
    expect(screen.getByText('gpt-5.1')).toBeInTheDocument();
    expect(screen.getByText('Strict')).toBeInTheDocument();
  });

  it('renders a discovered title when provided', () => {
    renderHeader({ title: 'Organize the summer album' });

    expect(screen.getByRole('heading', { name: 'Organize the summer album' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'New chat' })).not.toBeInTheDocument();
  });

  it('keeps long title, credential, and model text in bounded elements', () => {
    renderHeader({
      title: 'A very long discovered assistant session title that should not push the action buttons off screen',
      session: makeSession({
        credentialSnapshot: {
          id: '00000000-0000-4000-8000-000000000001',
          providerType: AgentProviderType.Openai,
          label: 'A very long provider credential label that should remain visually bounded',
          baseUrl: null,
          models: ['a-very-long-model-name'],
          defaultModel: 'a-very-long-model-name',
        },
        modelSnapshot: {
          model: 'a-very-long-model-name-that-should-not-overlap-header-actions',
          providerCredentialId: '00000000-0000-4000-8000-000000000001',
        },
      }),
    });

    expect(screen.getByTestId('agent-session-header-title').className).toContain('truncate');
    expect(screen.getByTestId('agent-session-header-meta').className).toContain('min-w-0');
    expect(screen.getByTestId('agent-session-header-credential').className).toContain('truncate');
    expect(screen.getByTestId('agent-session-header-model').className).toContain('truncate');
  });

  it('fires New chat and Details callbacks from accessible buttons', async () => {
    const user = userEvent.setup();
    const { onNewChat, onOpenDetails } = renderHeader();

    await user.click(screen.getByRole('button', { name: 'New chat' }));
    await user.click(screen.getByRole('button', { name: 'Details' }));

    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });
});
