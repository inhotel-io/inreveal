import {
  AgentApprovalMode,
  AgentPermissionPreset,
  AgentSessionStatus,
  type AgentProviderCredentialResponseDto,
} from '@immich/sdk';

export const permissionPresetOptions = [
  { value: AgentPermissionPreset.Careful, labelKey: 'assistant_permission_preset_careful' },
  { value: AgentPermissionPreset.VisualOrganizer, labelKey: 'assistant_permission_preset_visual_organizer' },
  { value: AgentPermissionPreset.LocalPowerUser, labelKey: 'assistant_permission_preset_local_power_user' },
] as const;

export const approvalModeOptions = [
  { value: AgentApprovalMode.Strict, labelKey: 'assistant_approval_mode_strict' },
  { value: AgentApprovalMode.AskOnEscalation, labelKey: 'assistant_approval_mode_ask_on_escalation' },
  { value: AgentApprovalMode.PlanOnly, labelKey: 'assistant_approval_mode_plan_only' },
] as const;

export const supportedPermissionPresets = [
  AgentPermissionPreset.Careful,
  AgentPermissionPreset.VisualOrganizer,
  AgentPermissionPreset.LocalPowerUser,
] as const;

export const supportedApprovalModes = [
  AgentApprovalMode.Strict,
  AgentApprovalMode.AskOnEscalation,
  AgentApprovalMode.PlanOnly,
] as const;

export const DEFAULT_AGENT_PERMISSION_PRESET = AgentPermissionPreset.Careful;
export const DEFAULT_AGENT_APPROVAL_MODE = AgentApprovalMode.Strict;

const permissionPresetLabelKeys = Object.fromEntries(
  permissionPresetOptions.map((option) => [option.value, option.labelKey]),
) as Record<(typeof supportedPermissionPresets)[number], string>;

const approvalModeLabelKeys = Object.fromEntries(
  approvalModeOptions.map((option) => [option.value, option.labelKey]),
) as Record<(typeof supportedApprovalModes)[number], string>;

export const getSessionStatusLabelKey = (status: AgentSessionStatus) => `assistant_session_status_${status}`;

export const getInitialCredentialId = (credentials: AgentProviderCredentialResponseDto[]) => credentials[0]?.id ?? '';

export const getDefaultModel = (credential: AgentProviderCredentialResponseDto | undefined) => {
  if (!credential) {
    return '';
  }

  const { defaultModel, models } = credential;

  if (defaultModel && (models.length === 0 || models.includes(defaultModel))) {
    return defaultModel;
  }

  return models[0] ?? '';
};

export const getPermissionPresetLabelKey = (preset: AgentPermissionPreset) =>
  permissionPresetLabelKeys[preset as (typeof supportedPermissionPresets)[number]] ?? preset;

export const getApprovalModeLabelKey = (mode: AgentApprovalMode) =>
  approvalModeLabelKeys[mode as (typeof supportedApprovalModes)[number]] ?? mode;
