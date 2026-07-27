import { foldLegacyFaceSuggestionConfig } from 'src/utils/config';
import { describe, expect, it } from 'vitest';

const legacy = (suggestionMaxDistance: number, maxDistance?: number) => ({
  machineLearning: {
    facialRecognition: {
      ...(maxDistance === undefined ? {} : { maxDistance }),
      suggestionMaxDistance,
    },
  },
});

describe('foldLegacyFaceSuggestionConfig', () => {
  it('enables suggestions when the legacy value exceeds the default recognition distance', () => {
    const result = foldLegacyFaceSuggestionConfig(legacy(0.7)) as any;
    expect(result.machineLearning.facialRecognition.suggestions).toEqual({ enabled: true, maxDistance: 0.7 });
    expect(result.machineLearning.facialRecognition.suggestionMaxDistance).toBeUndefined();
  });

  it('disables suggestions and restores the default band when the legacy value is 0', () => {
    const result = foldLegacyFaceSuggestionConfig(legacy(0)) as any;
    expect(result.machineLearning.facialRecognition.suggestions).toEqual({ enabled: false, maxDistance: 0.7 });
  });

  it('disables suggestions but retains a legacy value below the recognition distance', () => {
    const result = foldLegacyFaceSuggestionConfig(legacy(0.4)) as any;
    expect(result.machineLearning.facialRecognition.suggestions).toEqual({ enabled: false, maxDistance: 0.4 });
  });

  it('restores the default band when the legacy value is below the 0.1 schema minimum', () => {
    const result = foldLegacyFaceSuggestionConfig(legacy(0.05)) as any;
    expect(result.machineLearning.facialRecognition.suggestions).toEqual({ enabled: false, maxDistance: 0.7 });
  });

  it('keeps the legacy value exactly at the 0.1 schema minimum instead of falling back to the default', () => {
    const result = foldLegacyFaceSuggestionConfig(legacy(0.1)) as any;
    expect(result.machineLearning.facialRecognition.suggestions).toEqual({ enabled: false, maxDistance: 0.1 });
  });

  it('compares against an overridden recognition distance, not the default', () => {
    const result = foldLegacyFaceSuggestionConfig(legacy(0.7, 0.8)) as any;
    expect(result.machineLearning.facialRecognition.suggestions).toEqual({ enabled: false, maxDistance: 0.7 });
  });

  it('disables suggestions when the legacy value exactly equals the default recognition distance', () => {
    const result = foldLegacyFaceSuggestionConfig(legacy(0.5)) as any;
    expect(result.machineLearning.facialRecognition.suggestions).toEqual({ enabled: false, maxDistance: 0.5 });
  });

  it('disables suggestions when the legacy value exactly equals an overridden recognition distance', () => {
    const result = foldLegacyFaceSuggestionConfig(legacy(0.8, 0.8)) as any;
    expect(result.machineLearning.facialRecognition.suggestions).toEqual({ enabled: false, maxDistance: 0.8 });
  });

  it('lets an existing suggestions block win and drops the legacy key', () => {
    const partial = {
      machineLearning: {
        facialRecognition: { suggestionMaxDistance: 0.9, suggestions: { enabled: true, maxDistance: 0.6 } },
      },
    };
    const result = foldLegacyFaceSuggestionConfig(partial) as any;
    expect(result.machineLearning.facialRecognition.suggestions).toEqual({ enabled: true, maxDistance: 0.6 });
    expect(result.machineLearning.facialRecognition.suggestionMaxDistance).toBeUndefined();
  });

  it('passes through a partial with no legacy key untouched', () => {
    const partial = { machineLearning: { facialRecognition: { maxDistance: 0.6 } } };
    expect(foldLegacyFaceSuggestionConfig(partial)).toEqual(partial);
  });

  it('tolerates a null or non-object partial', () => {
    const noPartial: unknown = undefined;
    expect(foldLegacyFaceSuggestionConfig(null)).toBeNull();
    expect(foldLegacyFaceSuggestionConfig(noPartial)).toBeUndefined();
  });

  it('preserves sibling facialRecognition keys and other machineLearning sections during the fold', () => {
    const partial = {
      machineLearning: {
        facialRecognition: { enabled: true, modelName: 'buffalo_l', minFaces: 3, suggestionMaxDistance: 0.7 },
        clip: { enabled: true, modelName: 'ViT-B-32__openai' },
      },
    };
    const result = foldLegacyFaceSuggestionConfig(partial) as any;
    expect(result.machineLearning.facialRecognition).toEqual({
      enabled: true,
      modelName: 'buffalo_l',
      minFaces: 3,
      suggestions: { enabled: true, maxDistance: 0.7 },
    });
    expect(result.machineLearning.clip).toEqual({ enabled: true, modelName: 'ViT-B-32__openai' });
  });

  it('does not mutate the input partial', () => {
    const partial = legacy(0.7);
    foldLegacyFaceSuggestionConfig(partial);
    expect(partial.machineLearning.facialRecognition.suggestionMaxDistance).toBe(0.7);
    expect((partial.machineLearning.facialRecognition as any).suggestions).toBeUndefined();
  });
});
