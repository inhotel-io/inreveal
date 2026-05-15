import {
  AgentApprovalMode,
  AgentPermissionPreset,
  AgentSessionStatus,
  type AgentProviderCredentialResponseDto,
} from '@immich/sdk';
import type { Translations } from 'svelte-i18n';

export const permissionPresetOptions = [
  { value: AgentPermissionPreset.Careful, labelKey: 'assistant_permission_preset_careful' as Translations },
  {
    value: AgentPermissionPreset.VisualOrganizer,
    labelKey: 'assistant_permission_preset_visual_organizer' as Translations,
  },
  {
    value: AgentPermissionPreset.LocalPowerUser,
    labelKey: 'assistant_permission_preset_local_power_user' as Translations,
  },
] as const;

export const approvalModeOptions = [
  { value: AgentApprovalMode.Strict, labelKey: 'assistant_approval_mode_strict' as Translations },
  { value: AgentApprovalMode.AskOnEscalation, labelKey: 'assistant_approval_mode_ask_on_escalation' as Translations },
  { value: AgentApprovalMode.PlanOnly, labelKey: 'assistant_approval_mode_plan_only' as Translations },
  {
    value: AgentApprovalMode.DangerouslySkipPermissions,
    labelKey: 'assistant_approval_mode_dangerously_skip_permissions' as Translations,
  },
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
  AgentApprovalMode.DangerouslySkipPermissions,
] as const;

export const DEFAULT_AGENT_PERMISSION_PRESET = AgentPermissionPreset.Careful;
export const DEFAULT_AGENT_APPROVAL_MODE = AgentApprovalMode.Strict;

const permissionPresetLabelKeys = Object.fromEntries(
  permissionPresetOptions.map((option) => [option.value, option.labelKey]),
) as Record<(typeof supportedPermissionPresets)[number], string>;

const approvalModeLabelKeys = Object.fromEntries(
  approvalModeOptions.map((option) => [option.value, option.labelKey]),
) as Record<(typeof supportedApprovalModes)[number], string>;

export const getSessionStatusLabelKey = (status: AgentSessionStatus) =>
  `assistant_session_status_${status}` as Translations;

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
  (permissionPresetLabelKeys[preset as (typeof supportedPermissionPresets)[number]] ?? preset) as Translations;

export const getApprovalModeLabelKey = (mode: AgentApprovalMode) =>
  (approvalModeLabelKeys[mode as (typeof supportedApprovalModes)[number]] ?? mode) as Translations;
