import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPiRuntime, mapProviderType, redactSecret } from './pi-runtime.mjs';

const permissionPlan = {
  read: { metadata: true, previews: false, originals: false },
  providerExposure: {
    metadata: true,
    previews: false,
    originals: false,
    allowOriginalsForExternalProviders: false,
  },
  assetScope: { owned: true, sharedSpaces: false, locked: false },
  writeScope: { createAlbum: true, addAssets: true, updateDetails: true, setCover: true },
  limits: {
    maxAssetsPerToolCall: 200,
    maxAssetsPerSession: 2000,
    maxPreviewsPerToolCall: 0,
    maxOriginalsPerToolCall: 0,
    expiresInMinutes: 120,
  },
};

const createSessionBody = (overrides = {}) => ({
  gallerySessionId: '00000000-0000-4000-8000-000000000100',
  credential: {
    id: '00000000-0000-4000-8000-000000000001',
    providerType: 'openai',
    label: 'OpenAI personal',
    baseUrl: null,
    models: ['gpt-5.1'],
    defaultModel: 'gpt-5.1',
    secret: 'sk-openai-secret',
  },
  model: 'gpt-5.1',
  permissionPreset: 'careful',
  permissionPlan,
  approvalMode: 'strict',
  initialContext: {},
  ...overrides,
});

const createFakeDependencies = () => {
  const calls = {
    runtimeApiKeys: [],
    loaders: [],
    createAgentSession: [],
    prompts: [],
    unsubscribed: 0,
    disposed: 0,
  };
  const registeredModels = [];
  let listener;
  const session = {
    sessionId: 'pi-sdk-session-1',
    messages: [],
    subscribe(next) {
      listener = next;
      return () => {
        calls.unsubscribed += 1;
      };
    },
    async prompt(text) {
      calls.prompts.push(text);
      listener?.({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'I can help.' },
      });
      this.messages.push({ role: 'assistant', content: [{ type: 'text', text: 'I can help.' }] });
      listener?.({ type: 'message_end' });
    },
    dispose() {
      calls.disposed += 1;
    },
  };

  class DefaultResourceLoader {
    constructor(options) {
      this.options = options;
      this.extensionsResult = { runtime: { pendingProviderRegistrations: [] } };
      calls.loaders.push(options);
    }

    async reload() {
      for (const factory of this.options.extensionFactories ?? []) {
        factory({
          registerProvider: (name, config) => {
            this.extensionsResult.runtime.pendingProviderRegistrations.push({ name, config, extensionPath: '<inline:1>' });
          },
        });
      }
    }

    getExtensions() {
      return this.extensionsResult;
    }
  }

  const sdk = {
    AuthStorage: {
      create: () => ({
        setRuntimeApiKey: (provider, secret) => calls.runtimeApiKeys.push({ provider, secret }),
      }),
    },
    ModelRegistry: {
      create: () => ({
        find: (provider, model) =>
          registeredModels.find((registeredModel) => registeredModel.provider === provider && registeredModel.id === model),
        registerProvider: (name, config) => {
          calls.registeredProvider = { name, config };
          for (const model of config.models ?? []) {
            registeredModels.push({
              provider: name,
              id: model.id,
              name: model.name,
              api: model.api ?? config.api,
              baseUrl: model.baseUrl ?? config.baseUrl,
              source: 'registered-provider',
            });
          }
        },
      }),
    },
    SessionManager: { inMemory: () => ({ kind: 'session-manager' }) },
    SettingsManager: { inMemory: (settings) => ({ kind: 'settings-manager', settings }) },
    DefaultResourceLoader,
    createAgentSession: async (options) => {
      calls.createAgentSession.push(options);
      return { session };
    },
  };

  const ai = {
    getModel: (provider, model) => (provider === 'openai' ? { provider, id: model, source: 'builtin' } : undefined),
  };

  return { sdk, ai, calls, session };
};

const collect = async (stream) => {
  const events = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
};

describe('pi runtime adapter', () => {
  it('maps built-in provider types to Pi provider names', () => {
    assert.equal(mapProviderType('openai', 'session-1'), 'openai');
    assert.equal(mapProviderType('anthropic', 'session-1'), 'anthropic');
    assert.equal(mapProviderType('openai-compatible', 'session-1'), 'gallery-session-1');
  });

  it('redacts provider secrets from error messages', () => {
    assert.equal(redactSecret('request failed for sk-openai-secret', 'sk-openai-secret'), 'request failed for [redacted]');
    assert.equal(redactSecret('request failed', 'sk-openai-secret'), 'request failed');
  });

  it('creates a Pi SDK session with runtime API key, selected model, and no enabled tools', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });

    const result = await runtime.createSession(createSessionBody());

    assert.deepEqual(result, {
      runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
      capabilities: {
        protocolVersion: '2026-05-14',
        streaming: true,
        tools: [],
        models: ['gpt-5.1'],
        runtime: 'pi',
      },
    });
    assert.deepEqual(calls.runtimeApiKeys, [{ provider: 'openai', secret: 'sk-openai-secret' }]);
    assert.equal(calls.createAgentSession.length, 1);
    assert.equal(calls.createAgentSession[0].model.provider, 'openai');
    assert.equal(calls.createAgentSession[0].model.id, 'gpt-5.1');
    assert.equal(calls.createAgentSession[0].noTools, 'all');
    assert.deepEqual(calls.createAgentSession[0].tools, []);
    assert.deepEqual(calls.createAgentSession[0].customTools, []);
  });

  it('constructs the Pi resource loader with concrete runtime paths', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });

    await runtime.createSession(createSessionBody());

    assert.equal(calls.loaders.length, 1);
    assert.equal(typeof calls.loaders[0].cwd, 'string');
    assert.notEqual(calls.loaders[0].cwd, '');
    assert.ok(calls.loaders[0].cwd.endsWith('agent-runner'));
    assert.equal(typeof calls.loaders[0].agentDir, 'string');
    assert.notEqual(calls.loaders[0].agentDir, '');
    assert.ok(calls.loaders[0].agentDir.endsWith('agent-runner/.pi-runtime'));
  });

  it('registers an OpenAI-compatible provider without persisting the secret', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });

    await runtime.createSession(
      createSessionBody({
        credential: {
          id: '00000000-0000-4000-8000-000000000001',
          providerType: 'openai-compatible',
          label: 'Local model',
          baseUrl: 'http://localhost:11434/v1',
          models: ['llama-local'],
          defaultModel: 'llama-local',
          secret: 'local-secret',
        },
        model: 'llama-local',
      }),
    );

    assert.deepEqual(calls.runtimeApiKeys, [
      { provider: 'gallery-00000000-0000-4000-8000-000000000100', secret: 'local-secret' },
    ]);
    assert.equal(calls.registeredProvider.name, 'gallery-00000000-0000-4000-8000-000000000100');
    assert.equal(calls.registeredProvider.config.baseUrl, 'http://localhost:11434/v1');
    assert.equal(calls.registeredProvider.config.apiKey, 'local-secret');
    assert.equal(calls.registeredProvider.config.api, 'openai-completions');
    assert.deepEqual(calls.registeredProvider.config.models.map((model) => model.id), ['llama-local']);
    assert.equal(calls.createAgentSession[0].model.provider, 'gallery-00000000-0000-4000-8000-000000000100');
    assert.equal(calls.createAgentSession[0].model.id, 'llama-local');
    assert.equal(calls.createAgentSession[0].model.source, 'registered-provider');
  });

  it('streams Pi text deltas and completion content as Gallery runner events', async () => {
    const { sdk, ai } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());

    const events = await collect(
      runtime.sendMessage({
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        gallerySessionId: '00000000-0000-4000-8000-000000000100',
        messageId: '00000000-0000-4000-8000-000000000200',
        content: { blocks: [{ type: 'text', text: 'Organize my photos.' }] },
      }),
    );

    assert.deepEqual(events, [
      {
        type: 'assistant-message-delta',
        sessionId: '00000000-0000-4000-8000-000000000100',
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        delta: 'I can help.',
        sequence: 1,
      },
      {
        type: 'assistant-message-completed',
        sessionId: '00000000-0000-4000-8000-000000000100',
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        providerMessageId: null,
        content: { blocks: [{ type: 'text', text: 'I can help.' }] },
      },
    ]);
  });

  it('unsubscribes from Pi runtime events after a message stream completes', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());

    await collect(
      runtime.sendMessage({
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        gallerySessionId: '00000000-0000-4000-8000-000000000100',
        messageId: '00000000-0000-4000-8000-000000000200',
        content: { blocks: [{ type: 'text', text: 'Organize my photos.' }] },
      }),
    );

    assert.equal(calls.unsubscribed, 1);
  });

  it('returns a sanitized runner-error event when Pi prompt fails', async () => {
    const { sdk, ai, session } = createFakeDependencies();
    session.prompt = async () => {
      throw new Error('provider rejected sk-openai-secret');
    };
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());

    const events = await collect(
      runtime.sendMessage({
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        gallerySessionId: '00000000-0000-4000-8000-000000000100',
        messageId: '00000000-0000-4000-8000-000000000200',
        content: { blocks: [{ type: 'text', text: 'Organize my photos.' }] },
      }),
    );

    assert.deepEqual(events, [
      {
        type: 'runner-error',
        sessionId: '00000000-0000-4000-8000-000000000100',
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        message: 'provider rejected [redacted]',
      },
    ]);
  });

  it('throws a sanitized not-found error for unknown runner sessions', async () => {
    const { sdk, ai } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });

    await assert.rejects(
      () =>
        collect(
          runtime.sendMessage({
            runnerSessionId: 'missing',
            gallerySessionId: '00000000-0000-4000-8000-000000000100',
            messageId: '00000000-0000-4000-8000-000000000200',
            content: { blocks: [{ type: 'text', text: 'Hello' }] },
          }),
        ),
      /Runner session not found/,
    );
  });

  it('disposes the Pi SDK session when the runtime session is deleted', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());

    runtime.disposeSession('pi-00000000-0000-4000-8000-000000000100');

    assert.equal(calls.disposed, 1);
  });
});
