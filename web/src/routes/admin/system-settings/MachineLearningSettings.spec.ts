import type { SystemConfigDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MachineLearningSettings from './MachineLearningSettings.svelte';

type FacialRecognitionOverrides = Partial<
  Omit<SystemConfigDto['machineLearning']['facialRecognition'], 'suggestions'> & {
    suggestions: Partial<SystemConfigDto['machineLearning']['facialRecognition']['suggestions']>;
  }
>;

const makeMachineLearningConfig = (facialRecognitionOverrides: FacialRecognitionOverrides = {}): SystemConfigDto =>
  ({
    machineLearning: {
      enabled: true,
      urls: ['http://localhost:3003'],
      availabilityChecks: { enabled: true, interval: 5, timeout: 30 },
      clip: { enabled: true, modelName: 'ViT-B-32__openai', maxDistance: 0.5 },
      duplicateDetection: { enabled: true, maxDistance: 0.01 },
      facialRecognition: {
        enabled: true,
        modelName: 'buffalo_l',
        minScore: 0.7,
        maxDistance: 0.5,
        minFaces: 3,
        ...facialRecognitionOverrides,
        suggestions: {
          enabled: false,
          maxDistance: 0.7,
          ...facialRecognitionOverrides.suggestions,
        },
      },
      ocr: {
        enabled: false,
        modelName: 'PP-OCRv5_mobile',
        minDetectionScore: 0.3,
        minRecognitionScore: 0.5,
        maxResolution: 736,
      },
      petDetection: { enabled: false, modelName: 'yolo11s', minScore: 0.7 },
    },
  }) as unknown as SystemConfigDto;

const mocks = vi.hoisted(() => ({
  featureFlags: { configFile: false, duplicateDetection: true },
  systemConfig: {} as SystemConfigDto,
  defaultSystemConfig: {} as SystemConfigDto,
  cloneValue: vi.fn(),
  cloneDefaultValue: vi.fn(),
}));

vi.mock(import('$lib/managers/feature-flags-manager.svelte'), () => ({
  featureFlagsManager: {
    get value() {
      return mocks.featureFlags;
    },
  } as never,
}));

vi.mock(import('$lib/managers/system-config-manager.svelte'), () => ({
  systemConfigManager: {
    get value() {
      return mocks.systemConfig;
    },
    get defaultValue() {
      return mocks.defaultSystemConfig;
    },
    cloneValue: mocks.cloneValue,
    cloneDefaultValue: mocks.cloneDefaultValue,
  } as never,
}));

// SettingAccordion drives open/close through accordionManager (which navigates via goto);
// stub it to keep the facial-recognition section open and avoid SvelteKit navigation in tests.
vi.mock(import('$lib/managers/accordion-manager.svelte'), () => ({
  accordionManager: {
    isOpen: (key: string) => key === 'facial-recognition',
    open: vi.fn(),
    close: vi.fn(),
  } as never,
}));

vi.mock(import('$lib/services/system-config.service'), () => ({
  handleSystemConfigSave: vi.fn(),
}));

// SettingInputField sets both `id` and the paired `<label for>` to the raw label string, but it also
// unconditionally sets `aria-labelledby="{label}-label"` on the input — an id this component never
// actually renders anywhere. That pre-existing (unrelated) quirk makes @testing-library's
// `getByLabelText` unreliable for any SettingInputField in this codebase: it prioritizes the dangling
// aria-labelledby over the real for/id association and reports the input as "non-labellable". Read the
// field directly by its (stable, app-assigned) DOM id instead of fighting that helper.
// The id is a dotted i18n key, so it must be matched as a quoted attribute value rather than a
// (dot-sensitive) CSS id selector.
const getSuggestionMaxDistanceInput = () =>
  document.querySelector('[id="admin.machine_learning_suggestion_max_distance"]') as HTMLInputElement;

describe('MachineLearningSettings face suggestions auto-fill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.featureFlags = { configFile: false, duplicateDetection: true };
    mocks.systemConfig = makeMachineLearningConfig();
    mocks.defaultSystemConfig = makeMachineLearningConfig();
    mocks.cloneValue.mockImplementation(() => structuredClone(mocks.systemConfig));
    mocks.cloneDefaultValue.mockImplementation(() => structuredClone(mocks.defaultSystemConfig));
  });

  it('does not rewrite the displayed distance in config-file (disabled) mode, even when the loaded config already violates the invariant', async () => {
    // Config-file-sourced configs are validated only against the structural schema on boot, so this
    // combination (suggestions.maxDistance <= facialRecognition.maxDistance) is genuinely reachable.
    mocks.featureFlags.configFile = true;
    mocks.systemConfig = makeMachineLearningConfig({
      maxDistance: 0.6,
      suggestions: { enabled: true, maxDistance: 0.5 },
    });
    mocks.cloneValue.mockImplementation(() => structuredClone(mocks.systemConfig));

    render(MachineLearningSettings);

    // Give any (incorrectly unguarded) effect a chance to run before asserting it did not fire.
    await waitFor(() => expect(getSuggestionMaxDistanceInput()).toHaveValue(0.5));
  });

  it('auto-fills the distance to recognition distance + 0.2 when enabling with a sub-threshold band', async () => {
    const user = userEvent.setup();
    mocks.systemConfig = makeMachineLearningConfig({
      maxDistance: 0.5,
      suggestions: { enabled: false, maxDistance: 0.3 },
    });
    mocks.cloneValue.mockImplementation(() => structuredClone(mocks.systemConfig));

    render(MachineLearningSettings);

    await user.click(screen.getByRole('switch', { name: 'admin.machine_learning_face_suggestions_setting' }));

    await waitFor(() => expect(getSuggestionMaxDistanceInput()).toHaveValue(0.7));
  });

  it('leaves the distance untouched when enabling with a value that already exceeds the recognition distance', async () => {
    const user = userEvent.setup();
    mocks.systemConfig = makeMachineLearningConfig({
      maxDistance: 0.5,
      suggestions: { enabled: false, maxDistance: 0.9 },
    });
    mocks.cloneValue.mockImplementation(() => structuredClone(mocks.systemConfig));

    render(MachineLearningSettings);

    await user.click(screen.getByRole('switch', { name: 'admin.machine_learning_face_suggestions_setting' }));

    await waitFor(() => expect(getSuggestionMaxDistanceInput()).toHaveValue(0.9));
  });
});
