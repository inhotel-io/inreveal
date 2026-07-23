import { defaults } from 'src/config';
import { migrateLegacyPetDetectionModel } from 'src/utils/config';
import { describe, expect, it } from 'vitest';

const configWith = (modelName: string) => {
  const config = structuredClone(defaults);
  config.machineLearning.petDetection.modelName = modelName;
  return config;
};

describe('migrateLegacyPetDetectionModel', () => {
  // Spec #27 — the three model names the admin UI used to offer.
  it.each(['yolo11n', 'yolo11s', 'yolo11m'])('maps the legacy %s to rfdetr-nano', (legacy) => {
    const result = migrateLegacyPetDetectionModel(configWith(legacy));
    expect(result.machineLearning.petDetection.modelName).toBe('rfdetr-nano');
  });

  // Spec #28 — anything else in the yolo family, including casing we never shipped.
  it.each(['yolov8n-animals', 'yolo26m', 'YOLO11S'])('maps the unknown legacy %s to rfdetr-nano', (legacy) => {
    const result = migrateLegacyPetDetectionModel(configWith(legacy));
    expect(result.machineLearning.petDetection.modelName).toBe('rfdetr-nano');
  });

  // Spec #29 — current values must survive untouched.
  it.each(['rfdetr-nano', 'rfdetr-small'])('leaves %s untouched', (current) => {
    const result = migrateLegacyPetDetectionModel(configWith(current));
    expect(result.machineLearning.petDetection.modelName).toBe(current);
  });

  it('leaves an unrelated custom model name untouched', () => {
    const result = migrateLegacyPetDetectionModel(configWith('my-custom-detector'));
    expect(result.machineLearning.petDetection.modelName).toBe('my-custom-detector');
  });

  it('does not touch any other machine learning model name', () => {
    const config = configWith('yolo11s');
    const before = config.machineLearning.clip.modelName;
    const result = migrateLegacyPetDetectionModel(config);
    expect(result.machineLearning.clip.modelName).toBe(before);
  });
});
