export type AgentActivityVisibilityMode = 'off' | 'compact' | 'expanded';

export const defaultAgentActivityVisibilityMode: AgentActivityVisibilityMode = 'compact';

export const parseAgentActivityVisibilityMode = (value: unknown): AgentActivityVisibilityMode => {
  switch (value) {
    case 'off':
    case 'compact':
    case 'expanded': {
      return value;
    }

    default: {
      return defaultAgentActivityVisibilityMode;
    }
  }
};

export const getAgentActivityVisibilityStorageKey = (sessionId: string): string =>
  `gallery.assistant.activityVisibility.${sessionId}`;

export const readAgentActivityVisibilityMode = (
  sessionId: string,
  storage: Pick<Storage, 'getItem'> | null | undefined = globalThis.localStorage,
): AgentActivityVisibilityMode => {
  if (!storage) {
    return defaultAgentActivityVisibilityMode;
  }

  try {
    return parseAgentActivityVisibilityMode(storage.getItem(getAgentActivityVisibilityStorageKey(sessionId)));
  } catch {
    return defaultAgentActivityVisibilityMode;
  }
};

export const writeAgentActivityVisibilityMode = (
  sessionId: string,
  mode: AgentActivityVisibilityMode,
  storage: Pick<Storage, 'setItem'> | null | undefined = globalThis.localStorage,
): boolean => {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(getAgentActivityVisibilityStorageKey(sessionId), mode);
    return true;
  } catch {
    return false;
  }
};
