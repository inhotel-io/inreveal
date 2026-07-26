import type { SystemConfigDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSystemConfigSave } from '$lib/services/system-config.service';
import MachineLearningSettings from './MachineLearningSettings.svelte';

const mocks = vi.hoisted(() => ({
  featureFlags: { configFile: false },
  systemConfig: {} as SystemConfigDto,
  defaultSystemConfig: {} as SystemConfigDto,
  cloneValue: vi.fn(),
  cloneDefaultValue: vi.fn(),
  showDialog: vi.fn(),
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

vi.mock(import('$lib/services/system-config.service'), () => ({
  handleSystemConfigSave: vi.fn(),
}));

// SettingAccordion drives open/close through accordionManager. Keep every section open so the
// pet-recognition accordion's contents (hint, model select) are queryable without simulating
// clicks on the accordion header — mirrors FeatureSettings.spec.ts's approach.
vi.mock(import('$lib/managers/accordion-manager.svelte'), () => ({
  accordionManager: {
    isOpen: () => true,
    open: vi.fn(),
    close: vi.fn(),
  } as never,
}));

vi.mock('@immich/ui', async (original) => {
  const mod = await original<typeof import('@immich/ui')>();
  return {
    ...mod,
    modalManager: { showDialog: mocks.showDialog, show: vi.fn() },
  };
});

const makeMachineLearningConfig = (
  overrides: Partial<SystemConfigDto['machineLearning']> = {},
): SystemConfigDto['machineLearning'] =>
  ({
    enabled: true,
    urls: ['http://immich-machine-learning:3003'],
    availabilityChecks: { enabled: false, interval: 300, timeout: 3000 },
    clip: { enabled: true, modelName: 'ViT-B-32__openai', maxDistance: 0.5 },
    duplicateDetection: { enabled: true, maxDistance: 0.01 },
    facialRecognition: { enabled: true, modelName: 'buffalo_l', minScore: 0.7, maxDistance: 0.5, minFaces: 3 },
    ocr: {
      enabled: false,
      modelName: 'PP-OCRv5_mobile',
      minDetectionScore: 0.3,
      minRecognitionScore: 0.5,
      maxResolution: 1600,
    },
    petDetection: { enabled: true, modelName: 'yolo11s', minScore: 0.5 },
    petRecognition: { enabled: true, modelName: 'pet-recognition-base', maxDistance: 0.5, minFaces: 2 },
    ...overrides,
  }) as SystemConfigDto['machineLearning'];

const makeConfig = (overrides: Partial<SystemConfigDto['machineLearning']> = {}): SystemConfigDto =>
  ({ machineLearning: makeMachineLearningConfig(overrides) }) as SystemConfigDto;

describe('MachineLearningSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.featureFlags.configFile = false;
    mocks.systemConfig = makeConfig();
    mocks.defaultSystemConfig = makeConfig();
    mocks.cloneValue.mockImplementation(() => structuredClone(mocks.systemConfig));
    mocks.cloneDefaultValue.mockImplementation(() => structuredClone(mocks.defaultSystemConfig));
    mocks.showDialog.mockResolvedValue(true);
  });

  // R8.3: soft-dependency hint under the pet-recognition enable switch.
  describe('detection-dependency hint', () => {
    it('shows a hint when pet detection is disabled', () => {
      mocks.systemConfig = makeConfig({ petDetection: { enabled: false, modelName: 'yolo11s', minScore: 0.5 } });

      render(MachineLearningSettings);

      expect(screen.getByText('admin.pet_recognition_requires_detection')).toBeInTheDocument();
    });

    it('hides the hint when pet detection is enabled', () => {
      mocks.systemConfig = makeConfig({ petDetection: { enabled: true, modelName: 'yolo11s', minScore: 0.5 } });

      render(MachineLearningSettings);

      expect(screen.queryByText('admin.pet_recognition_requires_detection')).not.toBeInTheDocument();
    });
  });

  // R8.4: model-change confirm — pairs with the server-side scoped-purge switch (Slice 5).
  describe('model-change confirm', () => {
    it('opens a confirm dialog when the model changed, and blocks the save on cancel', async () => {
      mocks.showDialog.mockResolvedValue(false);
      render(MachineLearningSettings);

      const select = screen.getByLabelText('admin.machine_learning_pet_recognition_model') as HTMLSelectElement;
      await fireEvent.change(select, { target: { value: 'pet-recognition-large' } });

      await fireEvent.click(screen.getByRole('button', { name: 'save' }));

      await waitFor(() => {
        expect(mocks.showDialog).toHaveBeenCalledWith({ prompt: 'admin.pet_recognition_model_change_warning' });
      });
      expect(handleSystemConfigSave).not.toHaveBeenCalled();
    });

    it('proceeds with the save once the model-change confirm is accepted', async () => {
      mocks.showDialog.mockResolvedValue(true);
      render(MachineLearningSettings);

      const select = screen.getByLabelText('admin.machine_learning_pet_recognition_model') as HTMLSelectElement;
      await fireEvent.change(select, { target: { value: 'pet-recognition-large' } });

      await fireEvent.click(screen.getByRole('button', { name: 'save' }));

      await waitFor(() => {
        expect(handleSystemConfigSave).toHaveBeenCalled();
      });
    });

    it('does not open the confirm dialog when the model is unchanged', async () => {
      render(MachineLearningSettings);

      await fireEvent.click(screen.getByRole('button', { name: 'save' }));

      await waitFor(() => {
        expect(handleSystemConfigSave).toHaveBeenCalled();
      });
      expect(mocks.showDialog).not.toHaveBeenCalled();
    });
  });
});
