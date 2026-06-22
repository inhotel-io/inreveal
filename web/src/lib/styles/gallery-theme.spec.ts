import { readThemeTokens } from '$lib/styles/theme-tokens';

describe('gallery-theme.css', () => {
  const t = readThemeTokens();

  it('defines a light and a dark token block', () => {
    expect(Object.keys(t.light).length).toBeGreaterThan(0);
    expect(Object.keys(t.dark).length).toBeGreaterThan(0);
  });
});
