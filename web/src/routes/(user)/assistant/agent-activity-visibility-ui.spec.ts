import {
  getAgentActivityVisibilityStorageKey,
  parseAgentActivityVisibilityMode,
  readAgentActivityVisibilityMode,
  writeAgentActivityVisibilityMode,
} from './agent-activity-visibility-ui';

class FakeStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class ThrowingStorage {
  getItem(): string | null {
    throw new Error('storage unavailable');
  }

  setItem(): void {
    throw new Error('storage unavailable');
  }
}

describe('agent activity visibility UI helpers', () => {
  it.each([
    ['off', 'off'],
    ['compact', 'compact'],
    ['expanded', 'expanded'],
    [null, 'compact'],
    ['unsupported', 'compact'],
    ['', 'compact'],
    ['{"mode":"expanded"}', 'compact'],
    [String(123), 'compact'],
  ] as const)('parses %s as %s', (value, expected) => {
    expect(parseAgentActivityVisibilityMode(value)).toBe(expected);
  });

  it('builds distinct session-specific storage keys with a stable namespace', () => {
    const sessionAKey = getAgentActivityVisibilityStorageKey('session-a');
    const sessionBKey = getAgentActivityVisibilityStorageKey('session-b');

    expect(sessionAKey).not.toBe(sessionBKey);
    expect(sessionAKey).toContain('gallery.assistant.activityVisibility');
    expect(sessionAKey).toContain('session-a');
    expect(sessionAKey).not.toContain('.off');
    expect(sessionAKey).not.toContain('.compact');
    expect(sessionAKey).not.toContain('.expanded');
  });

  it('reads and writes valid modes per session', () => {
    const storage = new FakeStorage();

    expect(readAgentActivityVisibilityMode('session-a', storage)).toBe('compact');
    expect(writeAgentActivityVisibilityMode('session-a', 'expanded', storage)).toBe(true);
    expect(readAgentActivityVisibilityMode('session-a', storage)).toBe('expanded');
    expect(readAgentActivityVisibilityMode('session-b', storage)).toBe('compact');

    expect(writeAgentActivityVisibilityMode('session-b', 'off', storage)).toBe(true);
    expect(readAgentActivityVisibilityMode('session-a', storage)).toBe('expanded');
    expect(readAgentActivityVisibilityMode('session-b', storage)).toBe('off');
  });

  it('falls back to compact for invalid stored values', () => {
    const storage = new FakeStorage();
    storage.setItem(getAgentActivityVisibilityStorageKey('session-a'), 'loud');

    expect(readAgentActivityVisibilityMode('session-a', storage)).toBe('compact');
  });

  it('handles missing and throwing storage without mutating caller state', () => {
    const storage = new ThrowingStorage();
    const mode = 'expanded';

    expect(readAgentActivityVisibilityMode('session-a', storage)).toBe('compact');
    expect(writeAgentActivityVisibilityMode('session-a', 'off', storage)).toBe(false);
    expect(writeAgentActivityVisibilityMode('session-a', 'off', null)).toBe(false);
    expect(mode).toBe('expanded');
  });
});
