import { defaults } from 'src/config';
import { FacialRecognitionConfigSchema } from 'src/dtos/model-config.dto';
import { describe, expect, it } from 'vitest';

describe('FacialRecognitionConfigSchema suggestions', () => {
  const base = {
    enabled: true,
    modelName: 'buffalo_l',
    minScore: 0.7,
    maxDistance: 0.5,
    minFaces: 3,
  };

  it('accepts a valid suggestions block', () => {
    const parsed = FacialRecognitionConfigSchema.parse({ ...base, suggestions: { enabled: true, maxDistance: 0.7 } });
    expect(parsed.suggestions).toEqual({ enabled: true, maxDistance: 0.7 });
  });

  it('rejects a suggestion distance below the 0.1 minimum', () => {
    expect(() =>
      FacialRecognitionConfigSchema.parse({ ...base, suggestions: { enabled: false, maxDistance: 0 } }),
    ).toThrow();
  });

  it('rejects a missing suggestions block', () => {
    expect(() => FacialRecognitionConfigSchema.parse(base)).toThrow();
  });

  it('defaults to disabled with a 0.7 band', () => {
    expect(defaults.machineLearning.facialRecognition.suggestions).toEqual({ enabled: false, maxDistance: 0.7 });
  });
});
