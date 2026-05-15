import { getModel } from '@earendil-works/pi-ai';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';

const protocolVersion = '2026-05-14';
const systemPrompt = [
  'You are Gallery Assistant, a personal photo organization assistant.',
  'You may discuss album organization ideas, but this runtime slice has no Gallery read tools and no write tools.',
  'Never claim you changed albums. Album writes require a separate user-reviewed apply step.',
].join('\n');
const runtimePackageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimeAgentDir = join(runtimePackageRoot, '.pi-runtime');

const defaultDependencies = {
  ai: { getModel },
  sdk: {
    AuthStorage,
    createAgentSession,
    DefaultResourceLoader,
    ModelRegistry,
    SessionManager,
    SettingsManager,
  },
};

export const mapProviderType = (providerType, gallerySessionId) => {
  if (providerType === 'openai') {
    return 'openai';
  }

  if (providerType === 'anthropic') {
    return 'anthropic';
  }

  if (providerType === 'openai-compatible') {
    return `gallery-${gallerySessionId}`;
  }

  throw new Error(`Unsupported provider type: ${providerType}`);
};

export const redactSecret = (message, secret) => {
  if (!secret) {
    return message;
  }

  return message.split(secret).join('[redacted]');
};

const textPromptFromContent = (content) =>
  content?.blocks
    ?.filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim() ?? '';

const assistantTextFromMessages = (messages) => {
  const assistant = [...(messages ?? [])].reverse().find((message) => message?.role === 'assistant');
  const content = assistant?.content;
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
};

const sanitizedErrorMessage = (error, secret) => {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecret(message || 'Provider request failed', secret);
};

const createOpenAiCompatibleProviderFactories = ({ providerName, credential, model }) => {
  if (credential.providerType !== 'openai-compatible') {
    return [];
  }

  if (!credential.baseUrl) {
    throw new Error('OpenAI-compatible credentials require baseUrl');
  }

  return [
    (pi) => {
      pi.registerProvider(providerName, {
        name: credential.label,
        baseUrl: credential.baseUrl,
        apiKey: credential.secret,
        api: 'openai-completions',
        models: [
          {
            id: model,
            name: model,
            reasoning: false,
            input: ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 4096,
          },
        ],
      });
    },
  ];
};

const applyPendingProviderRegistrations = (resourceLoader, modelRegistry) => {
  const extensionsResult = resourceLoader.getExtensions?.();
  const pendingRegistrations = extensionsResult?.runtime?.pendingProviderRegistrations ?? [];

  for (const { name, config, extensionPath } of pendingRegistrations) {
    try {
      modelRegistry.registerProvider(name, config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Extension "${extensionPath}" error: ${message}`);
    }
  }

  if (extensionsResult?.runtime) {
    extensionsResult.runtime.pendingProviderRegistrations = [];
  }
};

export const createPiRuntime = ({ sdk = defaultDependencies.sdk, ai = defaultDependencies.ai } = {}) => {
  const sessions = new Map();

  return {
    async createSession(body) {
      const providerName = mapProviderType(body.credential.providerType, body.gallerySessionId);
      const runnerSessionId = `pi-${body.gallerySessionId}`;
      const authStorage = sdk.AuthStorage.create();
      authStorage.setRuntimeApiKey(providerName, body.credential.secret);

      const modelRegistry = sdk.ModelRegistry.create(authStorage);
      const settingsManager = sdk.SettingsManager.inMemory({
        compaction: { enabled: false },
      });
      const extensionFactories = createOpenAiCompatibleProviderFactories({
        providerName,
        credential: body.credential,
        model: body.model,
      });
      const resourceLoader = new sdk.DefaultResourceLoader({
        cwd: runtimePackageRoot,
        agentDir: runtimeAgentDir,
        settingsManager,
        systemPromptOverride: () => systemPrompt,
        extensionFactories,
      });

      await resourceLoader.reload();
      applyPendingProviderRegistrations(resourceLoader, modelRegistry);

      const model = ai.getModel(providerName, body.model) ?? modelRegistry.find(providerName, body.model);
      if (!model) {
        throw new Error(`Model ${body.model} is not available for provider ${providerName}`);
      }

      const { session } = await sdk.createAgentSession({
        model,
        authStorage,
        modelRegistry,
        sessionManager: sdk.SessionManager.inMemory(),
        settingsManager,
        resourceLoader,
        noTools: 'all',
        tools: [],
        customTools: [],
      });

      sessions.set(runnerSessionId, {
        gallerySessionId: body.gallerySessionId,
        credentialSecret: body.credential.secret,
        model: body.model,
        session,
        unsubscribe: undefined,
      });

      return {
        runnerSessionId,
        capabilities: {
          protocolVersion,
          streaming: true,
          tools: [],
          models: [body.model],
          runtime: 'pi',
        },
      };
    },

    async *sendMessage({ runnerSessionId, gallerySessionId, messageId: _messageId, content }) {
      const entry = sessions.get(runnerSessionId);
      if (!entry || entry.gallerySessionId !== gallerySessionId) {
        throw new Error('Runner session not found');
      }

      let sequence = 0;
      const pendingEvents = [];
      let wake;
      let finished = false;

      const enqueue = (event) => {
        pendingEvents.push(event);
        wake?.();
        wake = undefined;
      };

      const unsubscribe = entry.session.subscribe((event) => {
        if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
          sequence += 1;
          enqueue({
            type: 'assistant-message-delta',
            sessionId: gallerySessionId,
            runnerSessionId,
            delta: event.assistantMessageEvent.delta,
            sequence,
          });
        }
      });
      entry.unsubscribe = unsubscribe;

      try {
        const promptPromise = entry.session
          .prompt(textPromptFromContent(content))
          .then(() => {
            enqueue({
              type: 'assistant-message-completed',
              sessionId: gallerySessionId,
              runnerSessionId,
              providerMessageId: null,
              content: { blocks: [{ type: 'text', text: assistantTextFromMessages(entry.session.messages) }] },
            });
          })
          .catch((error) => {
            enqueue({
              type: 'runner-error',
              sessionId: gallerySessionId,
              runnerSessionId,
              message: sanitizedErrorMessage(error, entry.credentialSecret),
            });
          })
          .finally(() => {
            finished = true;
            wake?.();
            wake = undefined;
          });

        while (!finished || pendingEvents.length > 0) {
          if (pendingEvents.length === 0) {
            await new Promise((resolve) => {
              wake = resolve;
            });
            continue;
          }

          yield pendingEvents.shift();
        }

        await promptPromise;
      } finally {
        unsubscribe();
        if (entry.unsubscribe === unsubscribe) {
          entry.unsubscribe = undefined;
        }
      }
    },

    disposeSession(runnerSessionId) {
      const entry = sessions.get(runnerSessionId);
      if (!entry) {
        return;
      }

      entry.unsubscribe?.();
      entry.session.dispose?.();
      sessions.delete(runnerSessionId);
    },
  };
};
