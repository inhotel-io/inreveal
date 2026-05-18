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
    assistant_activity_visibility: 'Activity preview',
    assistant_activity_visibility_compact: 'Compact',
    assistant_activity_visibility_expanded: 'Expanded',
    assistant_activity_visibility_menu: 'Activity preview options',
    assistant_activity_visibility_off: 'Off',
    assistant_cancel: 'Cancel',
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
    writeScope: {
      addAssets: true,
      addAssetsToSpaces: true,
      archiveAssets: true,
      createAlbum: true,
      createSpace: true,
      editAssets: true,
      favoriteAssets: true,
      removeAssets: true,
      removeAssetsFromSpaces: true,
      setCover: true,
      tagAssets: true,
      updateDetails: true,
      updateSpaceDetails: true,
    },
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
  const onCancel = vi.fn();
  const onActivityVisibilityModeChange = vi.fn();

  render(AgentSessionHeader, {
    props: {
      session: makeSession(),
      title: null,
      onNewChat,
      onOpenDetails,
      ...props,
    },
  });

  return { onActivityVisibilityModeChange, onCancel, onNewChat, onOpenDetails };
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

  it('does not render Cancel without a cancel callback', () => {
    renderHeader();

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('fires Cancel from an accessible danger action when a callback is provided', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderHeader({ onCancel });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables Cancel while cancellation is pending without disabling the other actions', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { onNewChat, onOpenDetails } = renderHeader({ cancelDisabled: true, onCancel });

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'New chat' }));
    await user.click(screen.getByRole('button', { name: 'Details' }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it('renders activity visibility menu only when a callback is provided', () => {
    renderHeader({ activityVisibilityMode: 'compact' });

    expect(screen.queryByRole('button', { name: /Activity preview/i })).not.toBeInTheDocument();
  });

  it('forwards activity visibility changes from the header menu', async () => {
    const user = userEvent.setup();
    const onActivityVisibilityModeChange = vi.fn();
    renderHeader({
      activityVisibilityMode: 'compact',
      onActivityVisibilityModeChange,
    });

    const trigger = screen.getByRole('button', { name: /Activity preview/i });
    expect(trigger).toHaveTextContent('Compact');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');

    await user.click(trigger);
    await user.click(screen.getByRole('menuitemradio', { name: 'Off' }));

    expect(onActivityVisibilityModeChange).toHaveBeenCalledWith('off');
  });
});
