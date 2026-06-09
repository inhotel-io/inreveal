// agent-onboarding.spec.ts
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { AgentApprovalMode, AgentPermissionPreset, ProviderType, type AgentProviderCredentialResponseDto } from '@immich/sdk';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { readable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentOnboarding from './agent-onboarding.svelte';

vi.mock('svelte-i18n', () => ({ t: readable((key: string) => key) }));

describe('agent-onboarding orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdkMock.createAgentProviderCredential.mockResolvedValue({ id: 'cred-1', providerType: ProviderType.OpenaiCompatible } as AgentProviderCredentialResponseDto);
    sdkMock.validateAgentSession.mockResolvedValue(undefined as never);
    sdkMock.deleteAgentProviderCredential.mockResolvedValue(undefined as never);
  });

  it('walks welcome → connect → access → approval → ready and completes with the chosen defaults', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(AgentOnboarding, { props: { onComplete } });

    // welcome
    await user.click(screen.getByRole('button', { name: 'assistant_onboarding_get_started' }));
    // connect (local default)
    await user.type(screen.getByLabelText('assistant_onboarding_model'), 'llama3.1');
    await user.click(screen.getByRole('button', { name: 'assistant_onboarding_test' }));
    await screen.findByText('assistant_onboarding_connected');
    await user.click(screen.getByRole('button', { name: 'assistant_onboarding_continue' }));
    // access defaults to Visual organizer → Continue enabled
    await user.click(screen.getByRole('button', { name: 'assistant_onboarding_continue' }));
    // approval defaults to Plan-only → Continue enabled
    await user.click(screen.getByRole('button', { name: 'assistant_onboarding_continue' }));
    // ready
    await user.click(screen.getByRole('button', { name: 'assistant_onboarding_open' }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith({
        credentialId: 'cred-1',
        model: 'llama3.1',
        permissionPreset: AgentPermissionPreset.VisualOrganizer,
        approvalMode: AgentApprovalMode.PlanOnly,
      }),
    );
  });

  it('keeps Continue disabled on the connect step until a successful test', async () => {
    const user = userEvent.setup();
    render(AgentOnboarding, { props: { onComplete: vi.fn() } });
    await user.click(screen.getByRole('button', { name: 'assistant_onboarding_get_started' }));
    await user.type(screen.getByLabelText('assistant_onboarding_model'), 'llama3.1');
    expect(screen.getByRole('button', { name: 'assistant_onboarding_continue' })).toBeDisabled();
  });
});
