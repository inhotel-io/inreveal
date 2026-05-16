import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
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

const createMcpGateway = (overrides = {}) => ({
  url: 'https://gallery.example.test/mcp/sessions/00000000-0000-4000-8000-000000000100',
  token: 'mcp-token-secret',
  ...overrides,
});

const createDeferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });

  return { promise, resolve };
};

const withTimeout = async (promise, milliseconds = 250) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`timed out after ${milliseconds}ms`)), milliseconds);
    }),
  ]);

const waitForCondition = async (condition, milliseconds = 250) => {
  const deadline = Date.now() + milliseconds;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${milliseconds}ms`);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1);
    });
  }
};

const createMessageRequest = (overrides = {}) => ({
  runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
  gallerySessionId: '00000000-0000-4000-8000-000000000100',
  messageId: '00000000-0000-4000-8000-000000000200',
  content: { blocks: [{ type: 'text', text: 'Organize my photos.' }] },
  ...overrides,
});

const createFakeDependencies = ({ promptGate, sessionAbortGate, mcpToolNames = ['mcp_gallery_searchAssets'] } = {}) => {
  const calls = {
    runtimeApiKeys: [],
    loaders: [],
    createAgentSession: [],
    activeToolNames: [],
    bindExtensions: [],
    prompts: [],
    continues: 0,
    authCreate: 0,
    authInMemory: 0,
    modelRegistryCreate: 0,
    modelRegistryInMemory: 0,
    subscribed: 0,
    unsubscribed: 0,
    disposed: 0,
    sessionAborted: 0,
    agentAborted: 0,
    reloadEnvironments: [],
    bindEnvironments: [],
  };
  const registeredModels = [];
  let listener;
  const abortGate = createDeferred();
  const session = {
    sessionId: 'pi-sdk-session-1',
    agent: {
      async continue() {
        calls.continues += 1;
        listener?.({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 'Approved. Continuing.' },
        });
        this.messages?.push?.({ role: 'assistant', content: [{ type: 'text', text: 'Approved. Continuing.' }] });
        session.messages.push({ role: 'assistant', content: [{ type: 'text', text: 'Approved. Continuing.' }] });
        listener?.({ type: 'message_end' });
      },
      abort() {
        calls.agentAborted += 1;
        abortGate.resolve();
      },
    },
    messages: [],
    subscribe(next) {
      calls.subscribed += 1;
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
      if (promptGate) {
        await Promise.race([promptGate.promise, abortGate.promise]);
      }
      this.messages.push({ role: 'assistant', content: [{ type: 'text', text: 'I can help.' }] });
      listener?.({ type: 'message_end' });
    },
    dispose() {
      calls.disposed += 1;
    },
    async abort() {
      calls.sessionAborted += 1;
      if (sessionAbortGate) {
        await sessionAbortGate.promise;
      }
      abortGate.resolve();
    },
    async bindExtensions(input) {
      calls.bindExtensions.push(input);
      calls.bindEnvironments.push({ cwd: process.cwd(), home: process.env.HOME });
      calls.activeToolNames = mcpToolNames;
    },
    getActiveToolNames() {
      return calls.activeToolNames;
    },
  };

  class DefaultResourceLoader {
    constructor(options) {
      this.options = options;
      this.extensionsResult = { runtime: { pendingProviderRegistrations: [] } };
      calls.loaders.push(options);
    }

    async reload() {
      calls.reloadEnvironments.push({ cwd: process.cwd(), home: process.env.HOME });
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
      create: () => {
        calls.authCreate += 1;
        return {
          setRuntimeApiKey: (provider, secret) => calls.runtimeApiKeys.push({ provider, secret }),
        };
      },
      inMemory: () => {
        calls.authInMemory += 1;
        return {
          setRuntimeApiKey: (provider, secret) => calls.runtimeApiKeys.push({ provider, secret }),
        };
      },
    },
    ModelRegistry: {
      create: () => {
        calls.modelRegistryCreate += 1;
        return {
          find: (provider, model) => ({ provider, id: model, source: 'file-backed' }),
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
        };
      },
      inMemory: () => {
        calls.modelRegistryInMemory += 1;
        return {
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
        };
      },
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
  it('declares the Pi MCP extension dependency at the required version', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

    assert.equal(packageJson.dependencies['pi-mcp-extension'], '1.5.0');
  });

  it('maps built-in provider types to Pi provider names', () => {
    assert.equal(mapProviderType('openai', 'session-1'), 'openai');
    assert.equal(mapProviderType('anthropic', 'session-1'), 'anthropic');
    assert.equal(mapProviderType('openai-compatible', 'session-1'), 'gallery-session-1');
  });

  it('redacts provider secrets from error messages', () => {
    assert.equal(redactSecret('request failed for sk-openai-secret', 'sk-openai-secret'), 'request failed for [redacted]');
    assert.equal(redactSecret('request failed', 'sk-openai-secret'), 'request failed');
  });

  it('creates a Pi SDK session with runtime API key, selected model, and no enabled tools when MCP is absent', async () => {
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
    assert.equal(calls.createAgentSession[0].noTools, 'builtin');
    assert.deepEqual(calls.createAgentSession[0].tools, []);
    assert.deepEqual(calls.createAgentSession[0].customTools ?? [], []);
    assert.deepEqual(calls.loaders[0].additionalExtensionPaths ?? [], []);
    assert.equal(calls.bindExtensions.length, 0);
  });

  it('writes per-session Gallery MCP config and exposes active MCP tools when a gateway is present', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });

    const result = await runtime.createSession(
      createSessionBody({
        mcpGateway: createMcpGateway(),
      }),
    );

    const loaderOptions = calls.loaders[0];
    const configPath = join(loaderOptions.cwd, '.pi/mcp.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    assert.equal((await stat(configPath)).mode & 0o777, 0o600);
    assert.deepEqual(Object.keys(config.mcpServers), ['gallery']);
    assert.deepEqual(config.mcpServers.gallery, {
      transport: 'streamable-http',
      lifecycle: 'eager',
      url: 'https://gallery.example.test/mcp/sessions/00000000-0000-4000-8000-000000000100',
      headers: { Authorization: 'Bearer mcp-token-secret' },
    });
    assert.ok(loaderOptions.cwd.includes('.pi-runtime/sessions/'));
    assert.equal(relative(join(loaderOptions.agentDir, '..'), loaderOptions.cwd).startsWith('..'), false);
    assert.equal(loaderOptions.noExtensions, true);
    assert.equal(loaderOptions.additionalExtensionPaths.length, 1);
    assert.ok(loaderOptions.additionalExtensionPaths[0].endsWith('node_modules/pi-mcp-extension/src/index.ts'));
    assert.equal(calls.createAgentSession[0].noTools, 'builtin');
    assert.equal(calls.createAgentSession[0].cwd, loaderOptions.cwd);
    assert.equal(calls.createAgentSession[0].agentDir, loaderOptions.agentDir);
    assert.equal(calls.createAgentSession[0].tools, undefined);
    assert.deepEqual(calls.createAgentSession[0].customTools ?? [], []);
    assert.deepEqual(calls.bindExtensions, [{}]);
    assert.deepEqual(result.capabilities.tools, ['mcp_gallery_searchAssets']);
    assert.deepEqual(calls.reloadEnvironments[0], { cwd: loaderOptions.cwd, home: loaderOptions.homeDir });
    assert.deepEqual(calls.bindEnvironments[0], { cwd: loaderOptions.cwd, home: loaderOptions.homeDir });
    assert.notEqual(process.cwd(), loaderOptions.cwd);
  });

  it('does not use host global MCP config when the extension is loaded', async () => {
    const { sdk, ai, calls } = createFakeDependencies({ mcpToolNames: ['mcp_global_leaked', 'mcp_gallery_searchAssets'] });
    const runtime = createPiRuntime({ sdk, ai });

    const result = await runtime.createSession(createSessionBody({ mcpGateway: createMcpGateway() }));

    assert.equal(calls.loaders[0].homeDir?.includes('.pi-runtime'), true);
    assert.deepEqual(result.capabilities.tools, ['mcp_gallery_searchAssets']);
  });

  it('redacts provider and MCP secrets from MCP startup failures', async () => {
    const { sdk, ai, session } = createFakeDependencies();
    session.bindExtensions = async () => {
      throw new Error('bind failed with sk-openai-secret and mcp-token-secret');
    };
    const runtime = createPiRuntime({ sdk, ai });

    await assert.rejects(
      () => runtime.createSession(createSessionBody({ mcpGateway: createMcpGateway() })),
      (error) => {
        assert.equal(error.message, 'bind failed with [redacted] and [redacted]');
        assert.equal(error.message.includes('sk-openai-secret'), false);
        assert.equal(error.message.includes('mcp-token-secret'), false);
        return true;
      },
    );
  });

  it('fails startup when no active Gallery MCP tool appears after binding extensions', async () => {
    const { sdk, ai } = createFakeDependencies({ mcpToolNames: ['mcp_other_search'] });
    const runtime = createPiRuntime({ sdk, ai });

    await assert.rejects(
      () => runtime.createSession(createSessionBody({ mcpGateway: createMcpGateway() })),
      (error) => {
        assert.equal(error.message.includes('mcp-token-secret'), false);
        assert.match(error.message, /No active Gallery MCP tools/);
        return true;
      },
    );
  });

  it('redacts provider and MCP secrets from Pi session creation failures', async () => {
    const { sdk, ai } = createFakeDependencies();
    sdk.createAgentSession = async () => {
      throw new Error('create failed with sk-openai-secret and mcp-token-secret');
    };
    const runtime = createPiRuntime({ sdk, ai });

    await assert.rejects(
      () => runtime.createSession(createSessionBody({ mcpGateway: createMcpGateway() })),
      (error) => {
        assert.equal(error.message, 'create failed with [redacted] and [redacted]');
        return true;
      },
    );
  });

  it('writes isolated MCP config directories for concurrent Gallery sessions', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });

    await Promise.all([
      runtime.createSession(
        createSessionBody({
          gallerySessionId: 'session-a',
          mcpGateway: createMcpGateway({ url: 'https://one.example/mcp', token: 'token-one' }),
        }),
      ),
      runtime.createSession(
        createSessionBody({
          gallerySessionId: 'session-b',
          mcpGateway: createMcpGateway({ url: 'https://two.example/mcp', token: 'token-two' }),
        }),
      ),
    ]);

    const configs = await Promise.all(
      calls.loaders.map(async (loader) => JSON.parse(await readFile(join(loader.cwd, '.pi/mcp.json'), 'utf8'))),
    );
    assert.notEqual(calls.loaders[0].cwd, calls.loaders[1].cwd);
    assert.deepEqual(
      configs
        .map((config) => [config.mcpServers.gallery.url, config.mcpServers.gallery.headers.Authorization])
        .sort(),
      [
        ['https://one.example/mcp', 'Bearer token-one'],
        ['https://two.example/mcp', 'Bearer token-two'],
      ],
    );
  });

  it('keeps path-like Gallery session ids inside the runtime directory', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });

    await runtime.createSession(createSessionBody({ gallerySessionId: '../escape', mcpGateway: createMcpGateway() }));

    const runtimeDir = join(new URL('..', import.meta.url).pathname, '.pi-runtime');
    assert.equal(relative(runtimeDir, calls.loaders[0].cwd).startsWith('..'), false);
    assert.equal(existsSync(join(calls.loaders[0].cwd, '.pi/mcp.json')), true);
  });

  it('removes the token-bearing MCP config directory on dispose', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody({ mcpGateway: createMcpGateway() }));
    const sessionWorkspace = calls.loaders[0].cwd;

    await runtime.disposeSession('pi-00000000-0000-4000-8000-000000000100');

    assert.equal(existsSync(sessionWorkspace), false);
  });

  it('removes the old MCP config directory when replacing a deterministic session', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody({ mcpGateway: createMcpGateway({ token: 'old-token' }) }));
    const oldWorkspace = calls.loaders[0].cwd;

    await runtime.createSession(createSessionBody({ mcpGateway: createMcpGateway({ token: 'new-token' }) }));

    assert.equal(existsSync(oldWorkspace), false);
    assert.notEqual(calls.loaders[1].cwd, oldWorkspace);
    await rm(calls.loaders[1].cwd, { recursive: true, force: true });
  });

  it('uses transient in-memory Pi auth storage and model registry', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });

    await runtime.createSession(createSessionBody());

    assert.equal(calls.authCreate, 0);
    assert.equal(calls.modelRegistryCreate, 0);
    assert.equal(calls.authInMemory, 1);
    assert.equal(calls.modelRegistryInMemory, 1);
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
    assert.equal(calls.loaders[0].noContextFiles, true);
    assert.equal(calls.loaders[0].noSkills, true);
    assert.equal(calls.loaders[0].noPromptTemplates, true);
    assert.equal(calls.loaders[0].noThemes, true);
    assert.equal(calls.loaders[0].noExtensions, true);
    assert.ok(Array.isArray(calls.loaders[0].extensionFactories));
    assert.equal(calls.loaders[0].systemPrompt.startsWith('You are Gallery Assistant'), true);
    assert.equal(calls.loaders[0].systemPrompt.includes('mcp_gallery_searchAssets'), true);
    assert.equal(calls.loaders[0].systemPrompt.includes('mcp_gallery_readAssetMetadata'), true);
    assert.equal(calls.loaders[0].systemPrompt.includes('mcp_gallery_proposeAlbumOperations'), true);
    assert.equal(calls.loaders[0].systemPrompt.includes('album.create'), true);
    assert.equal(calls.loaders[0].systemPrompt.includes('call mcp_gallery_proposeAlbumOperations'), true);
    assert.equal(calls.loaders[0].systemPrompt.includes('call proposeAlbumOperations'), false);
    assert.equal(calls.loaders[0].systemPrompt.includes('reviewable album operation plan'), true);
    assert.equal(calls.loaders[0].systemPrompt.includes('If a planning tool call fails with a validation error'), true);
    assert.equal(calls.loaders[0].systemPrompt.includes('Do not redirect the user to Apple Photos'), true);
    assert.equal(calls.loaders[0].systemPrompt.includes('no direct write tools'), true);
    assert.equal(calls.loaders[0].systemPrompt.includes('has no Gallery read tools'), false);
    assert.deepEqual(calls.loaders[0].appendSystemPrompt, []);
    assert.equal(calls.loaders[0].systemPromptOverride, undefined);
    assert.equal(calls.loaders[0].appendSystemPromptOverride, undefined);
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

  it('redacts provider secrets from Pi session creation failures', async () => {
    const { sdk, ai } = createFakeDependencies();
    sdk.createAgentSession = async () => {
      throw new Error('create failed with sk-openai-secret');
    };
    const runtime = createPiRuntime({ sdk, ai });

    await assert.rejects(
      () => runtime.createSession(createSessionBody()),
      (error) => {
        assert.equal(error.message, 'create failed with [redacted]');
        assert.equal(error.message.includes('sk-openai-secret'), false);
        return true;
      },
    );
  });

  it('redacts provider secrets from provider registration setup failures', async () => {
    const { sdk, ai } = createFakeDependencies();
    sdk.ModelRegistry.inMemory = () => ({
      find: () => undefined,
      registerProvider: () => {
        throw new Error('registration rejected local-secret');
      },
    });
    const runtime = createPiRuntime({ sdk, ai });

    await assert.rejects(
      () =>
        runtime.createSession(
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
        ),
      (error) => {
        assert.equal(error.message, 'Extension "<inline:1>" error: registration rejected [redacted]');
        assert.equal(error.message.includes('local-secret'), false);
        return true;
      },
    );
  });

  it('does not resolve OpenAI-compatible models from file-backed external model config', async () => {
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

    assert.notEqual(calls.createAgentSession[0].model.source, 'file-backed');
  });

  it('disposes the previous Pi SDK session when recreating the deterministic runner session', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });

    await runtime.createSession(createSessionBody());
    await runtime.createSession(createSessionBody({ model: 'gpt-4.1' }));

    assert.equal(calls.disposed, 1);
  });

  it('redacts old and new provider and MCP secrets when duplicate session disposal fails', async () => {
    const { sdk, ai } = createFakeDependencies();
    let createdSessions = 0;
    sdk.createAgentSession = async () => {
      createdSessions += 1;
      const sessionNumber = createdSessions;
      return {
        session: {
          messages: [],
          subscribe: () => () => {},
          async prompt() {},
          async bindExtensions() {},
          getActiveToolNames: () => ['mcp_gallery_searchAssets'],
          dispose() {
            if (sessionNumber === 1 && createdSessions === 2) {
              throw new Error('dispose failed with old-secret, new-secret, old-mcp-token, and new-mcp-token');
            }
          },
        },
      };
    };
    const runtime = createPiRuntime({ sdk, ai });

    await runtime.createSession(
      createSessionBody({
        credential: { ...createSessionBody().credential, secret: 'old-secret' },
        mcpGateway: createMcpGateway({ token: 'old-mcp-token' }),
      }),
    );

    await assert.rejects(
      () =>
        runtime.createSession(
          createSessionBody({
            credential: { ...createSessionBody().credential, secret: 'new-secret' },
            mcpGateway: createMcpGateway({ token: 'new-mcp-token' }),
          }),
        ),
      (error) => {
        assert.equal(error.message, 'dispose failed with [redacted], [redacted], [redacted], and [redacted]');
        assert.equal(error.message.includes('old-secret'), false);
        assert.equal(error.message.includes('new-secret'), false);
        assert.equal(error.message.includes('old-mcp-token'), false);
        assert.equal(error.message.includes('new-mcp-token'), false);
        return true;
      },
    );
  });

  it('disposes the newly-created Pi SDK session when duplicate session replacement fails', async () => {
    const { sdk, ai } = createFakeDependencies();
    const sessions = [];
    sdk.createAgentSession = async () => {
      const session = {
        messages: [],
        disposed: 0,
        subscribe: () => () => {},
        async prompt() {},
        dispose() {
          this.disposed += 1;
          if (sessions.length === 2 && this === sessions[0]) {
            throw new Error('old dispose failed with old-secret');
          }
        },
      };
      sessions.push(session);
      return { session };
    };
    const runtime = createPiRuntime({ sdk, ai });

    await runtime.createSession(
      createSessionBody({
        credential: { ...createSessionBody().credential, secret: 'old-secret' },
      }),
    );

    await assert.rejects(
      () =>
        runtime.createSession(
          createSessionBody({
            credential: { ...createSessionBody().credential, secret: 'new-secret' },
          }),
        ),
      /old dispose failed/,
    );

    assert.equal(sessions.length, 2);
    assert.equal(sessions[0].disposed, 1);
    assert.equal(sessions[1].disposed, 1);
  });

  it('does not leak Pi SDK sessions when deterministic session creation overlaps', async () => {
    const { sdk, ai } = createFakeDependencies();
    const sessions = [];
    const creationGates = [createDeferred(), createDeferred()];
    sdk.createAgentSession = async () => {
      const sessionIndex = sessions.length;
      const session = {
        messages: [],
        disposed: 0,
        subscribe: () => () => {},
        async prompt() {},
        dispose() {
          this.disposed += 1;
        },
      };
      sessions.push(session);
      await creationGates[sessionIndex].promise;
      return { session };
    };
    const runtime = createPiRuntime({ sdk, ai });

    const first = runtime.createSession(createSessionBody());
    const second = runtime.createSession(createSessionBody());
    await waitForCondition(() => sessions.length >= 1);
    const overlapped = await waitForCondition(() => sessions.length >= 2, 25)
      .then(() => true)
      .catch(() => false);
    if (overlapped) {
      creationGates[0].resolve();
      creationGates[1].resolve();
    } else {
      creationGates[0].resolve();
      await waitForCondition(() => sessions.length >= 2);
      creationGates[1].resolve();
    }
    await Promise.all([first, second]);
    await runtime.disposeSession('pi-00000000-0000-4000-8000-000000000100');

    assert.equal(sessions.length, 2);
    assert.deepEqual(sessions.map((session) => session.disposed), [1, 1]);
  });

  it('streams Pi text deltas and completion content as Gallery runner events', async () => {
    const { sdk, ai } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());

    const events = await collect(
      runtime.sendMessage(createMessageRequest()),
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

  it('resumes the Pi agent after tool approval and streams the continued response', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());

    const events = await collect(
      runtime.resumeSession({
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        gallerySessionId: '00000000-0000-4000-8000-000000000100',
      }),
    );

    assert.equal(calls.continues, 1);
    assert.deepEqual(events, [
      {
        type: 'assistant-message-delta',
        sessionId: '00000000-0000-4000-8000-000000000100',
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        delta: 'Approved. Continuing.',
        sequence: 1,
      },
      {
        type: 'assistant-message-completed',
        sessionId: '00000000-0000-4000-8000-000000000100',
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        providerMessageId: null,
        content: { blocks: [{ type: 'text', text: 'Approved. Continuing.' }] },
      },
    ]);
  });

  it('uses Pi session completed assistant text when SDK message internals differ', async () => {
    const { sdk, ai, session } = createFakeDependencies();
    session.prompt = async () => {};
    session.messages = [];
    session.getLastAssistantText = () => 'I can help from the Pi SDK.';
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());

    const events = await collect(runtime.sendMessage(createMessageRequest()));

    assert.deepEqual(events, [
      {
        type: 'assistant-message-completed',
        sessionId: '00000000-0000-4000-8000-000000000100',
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        providerMessageId: null,
        content: { blocks: [{ type: 'text', text: 'I can help from the Pi SDK.' }] },
      },
    ]);
  });

  it('returns a runner-error when Pi completes with an assistant error message', async () => {
    const { sdk, ai, session } = createFakeDependencies();
    session.prompt = async () => {
      session.messages.push({
        role: 'assistant',
        content: [],
        stopReason: 'error',
        errorMessage: 'provider rejected tool schema',
      });
    };
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());

    const events = await collect(runtime.sendMessage(createMessageRequest()));

    assert.deepEqual(events, [
      {
        type: 'runner-error',
        sessionId: '00000000-0000-4000-8000-000000000100',
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        message: 'provider rejected tool schema',
      },
    ]);
  });

  it('redacts provider and MCP secrets from assistant error messages', async () => {
    const { sdk, ai, session } = createFakeDependencies();
    session.prompt = async () => {
      session.messages.push({
        role: 'assistant',
        content: [],
        stopReason: 'error',
        errorMessage: 'provider rejected sk-openai-secret and mcp-token-secret',
      });
    };
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody({ mcpGateway: createMcpGateway() }));

    const events = await collect(runtime.sendMessage(createMessageRequest()));

    assert.deepEqual(events, [
      {
        type: 'runner-error',
        sessionId: '00000000-0000-4000-8000-000000000100',
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        message: 'provider rejected [redacted] and [redacted]',
      },
    ]);
  });

  it('unsubscribes from Pi runtime events after a message stream completes', async () => {
    const { sdk, ai, calls } = createFakeDependencies();
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());

    await collect(
      runtime.sendMessage(createMessageRequest()),
    );

    assert.equal(calls.unsubscribed, 1);
  });

  it('clears in-flight and redacts the secret when Pi subscription setup fails', async () => {
    const { sdk, ai, session } = createFakeDependencies();
    const originalSubscribe = session.subscribe.bind(session);
    let subscribeAttempts = 0;
    session.subscribe = (next) => {
      subscribeAttempts += 1;
      if (subscribeAttempts === 1) {
        throw new Error('subscribe failed for sk-openai-secret');
      }

      return originalSubscribe(next);
    };
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());

    await assert.rejects(
      () => collect(runtime.sendMessage(createMessageRequest())),
      (error) => {
        assert.equal(error.message, 'subscribe failed for [redacted]');
        assert.equal(error.message.includes('sk-openai-secret'), false);
        return true;
      },
    );

    const events = await collect(runtime.sendMessage(createMessageRequest()));

    assert.equal(subscribeAttempts, 2);
    assert.equal(events[0].type, 'assistant-message-delta');
  });

  it('redacts provider and MCP secrets when Pi subscription setup fails', async () => {
    const { sdk, ai, session } = createFakeDependencies();
    session.subscribe = () => {
      throw new Error('subscribe failed for sk-openai-secret and mcp-token-secret');
    };
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody({ mcpGateway: createMcpGateway() }));

    await assert.rejects(
      () => collect(runtime.sendMessage(createMessageRequest())),
      (error) => {
        assert.equal(error.message, 'subscribe failed for [redacted] and [redacted]');
        assert.equal(error.message.includes('sk-openai-secret'), false);
        assert.equal(error.message.includes('mcp-token-secret'), false);
        return true;
      },
    );
  });

  it('rejects overlapping message streams for the same runner session before subscribing or prompting again', async () => {
    const promptGate = createDeferred();
    const { sdk, ai, calls } = createFakeDependencies({ promptGate });
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());
    const first = runtime.sendMessage(createMessageRequest())[Symbol.asyncIterator]();
    const second = runtime.sendMessage(
      createMessageRequest({ messageId: '00000000-0000-4000-8000-000000000201' }),
    )[Symbol.asyncIterator]();

    try {
      assert.equal((await first.next()).value.type, 'assistant-message-delta');

      await assert.rejects(() => second.next(), /already has an active message stream/);
      assert.equal(calls.subscribed, 1);
      assert.deepEqual(calls.prompts, ['Organize my photos.']);
    } finally {
      await second.return?.();
      promptGate.resolve();
      await first.return?.();
    }
  });

  it('unsubscribes the active listener and disposes the Pi SDK session when disposed mid-stream', async () => {
    const promptGate = createDeferred();
    const { sdk, ai, calls } = createFakeDependencies({ promptGate });
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());
    const stream = runtime.sendMessage(createMessageRequest())[Symbol.asyncIterator]();

    try {
      assert.equal((await stream.next()).value.type, 'assistant-message-delta');

      await runtime.disposeSession('pi-00000000-0000-4000-8000-000000000100');

      assert.equal(calls.sessionAborted, 1);
      assert.equal(calls.agentAborted, 0);
      assert.equal(calls.unsubscribed, 1);
      assert.equal(calls.disposed, 1);
    } finally {
      await stream.return?.();
      promptGate.resolve();
    }

    assert.equal(calls.unsubscribed, 1);
  });

  it('wakes an active message stream with a runner-error when disposed while waiting on Pi', async () => {
    const promptGate = createDeferred();
    const { sdk, ai, calls } = createFakeDependencies({ promptGate });
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());
    const stream = runtime.sendMessage(createMessageRequest())[Symbol.asyncIterator]();

    assert.equal((await stream.next()).value.type, 'assistant-message-delta');

    await runtime.disposeSession('pi-00000000-0000-4000-8000-000000000100');

    const next = await withTimeout(stream.next());
    assert.deepEqual(next, {
      done: false,
      value: {
        type: 'runner-error',
        sessionId: '00000000-0000-4000-8000-000000000100',
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        message: 'Runner session disposed',
      },
    });
    await waitForCondition(() => calls.sessionAborted === 1);
    assert.equal(calls.sessionAborted, 1);
    assert.equal(calls.agentAborted, 0);
    assert.equal((await withTimeout(stream.next())).done, true);
    assert.equal(calls.unsubscribed, 1);
    assert.equal(calls.disposed, 1);

    promptGate.resolve();
  });

  it('aborts the active Pi prompt and keeps overlap rejection until early stream return settles', async () => {
    const promptGate = createDeferred();
    const sessionAbortGate = createDeferred();
    const { sdk, ai, calls } = createFakeDependencies({ promptGate, sessionAbortGate });
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());
    const first = runtime.sendMessage(createMessageRequest())[Symbol.asyncIterator]();

    assert.equal((await first.next()).value.type, 'assistant-message-delta');

    const returnPromise = first.return();
    await Promise.resolve();
    const second = runtime.sendMessage(
      createMessageRequest({ messageId: '00000000-0000-4000-8000-000000000201' }),
    )[Symbol.asyncIterator]();

    await waitForCondition(() => calls.sessionAborted === 1);
    assert.equal(calls.sessionAborted, 1);
    assert.equal(calls.agentAborted, 0);
    await assert.rejects(() => second.next(), /already has an active message stream/);

    sessionAbortGate.resolve();
    promptGate.resolve();
    assert.equal((await withTimeout(returnPromise)).done, true);
    await second.return?.();

    assert.equal(calls.unsubscribed, 1);
  });

  it('waits for SDK abort before early stream return clears the in-flight guard', async () => {
    const promptGate = createDeferred();
    const sessionAbortGate = createDeferred();
    const { sdk, ai, calls } = createFakeDependencies({ promptGate, sessionAbortGate });
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());
    const first = runtime.sendMessage(createMessageRequest())[Symbol.asyncIterator]();

    assert.equal((await first.next()).value.type, 'assistant-message-delta');

    const returnPromise = first.return();
    await Promise.resolve();

    await waitForCondition(() => calls.sessionAborted === 1);
    assert.equal(calls.sessionAborted, 1);
    assert.equal(calls.agentAborted, 0);
    await assert.rejects(() => withTimeout(returnPromise, 25), /timed out/);

    const second = runtime.sendMessage(
      createMessageRequest({ messageId: '00000000-0000-4000-8000-000000000201' }),
    )[Symbol.asyncIterator]();
    await assert.rejects(() => second.next(), /already has an active message stream/);

    sessionAbortGate.resolve();
    assert.equal((await withTimeout(returnPromise)).done, true);
    await second.return?.();
    promptGate.resolve();
  });

  it('cleans up and redacts the error when early stream return abort fails', async () => {
    const promptGate = createDeferred();
    const { sdk, ai, calls, session } = createFakeDependencies({ promptGate });
    session.abort = async () => {
      calls.sessionAborted += 1;
      throw new Error('abort failed for sk-openai-secret');
    };
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());
    const first = runtime.sendMessage(createMessageRequest())[Symbol.asyncIterator]();

    assert.equal((await first.next()).value.type, 'assistant-message-delta');

    const returnPromise = first.return();
    await waitForCondition(() => calls.sessionAborted === 1);
    promptGate.resolve();
    await assert.rejects(
      () => returnPromise,
      (error) => {
        assert.equal(error.message, 'abort failed for [redacted]');
        assert.equal(error.message.includes('sk-openai-secret'), false);
        return true;
      },
    );
    assert.equal(calls.unsubscribed, 1);

    const retryEvents = await collect(runtime.sendMessage(createMessageRequest()));

    assert.equal(retryEvents[0].type, 'assistant-message-delta');
  });

  it('redacts provider and MCP secrets when early stream return abort fails', async () => {
    const promptGate = createDeferred();
    const { sdk, ai, calls, session } = createFakeDependencies({ promptGate });
    session.abort = async () => {
      calls.sessionAborted += 1;
      throw new Error('abort failed for sk-openai-secret and mcp-token-secret');
    };
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody({ mcpGateway: createMcpGateway() }));
    const first = runtime.sendMessage(createMessageRequest())[Symbol.asyncIterator]();

    assert.equal((await first.next()).value.type, 'assistant-message-delta');

    const returnPromise = first.return();
    await waitForCondition(() => calls.sessionAborted === 1);
    promptGate.resolve();
    await assert.rejects(
      () => returnPromise,
      (error) => {
        assert.equal(error.message, 'abort failed for [redacted] and [redacted]');
        assert.equal(error.message.includes('sk-openai-secret'), false);
        assert.equal(error.message.includes('mcp-token-secret'), false);
        return true;
      },
    );
  });

  it('cleans up and redacts the error when unsubscribe fails during stream cleanup', async () => {
    const promptGate = createDeferred();
    const { sdk, ai, calls, session } = createFakeDependencies({ promptGate });
    const originalSubscribe = session.subscribe.bind(session);
    let subscribeAttempts = 0;
    session.subscribe = (next) => {
      subscribeAttempts += 1;
      const unsubscribe = originalSubscribe(next);
      if (subscribeAttempts === 1) {
        return () => {
          unsubscribe();
          throw new Error('unsubscribe failed sk-openai-secret');
        };
      }

      return unsubscribe;
    };
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());
    const first = runtime.sendMessage(createMessageRequest())[Symbol.asyncIterator]();

    assert.equal((await first.next()).value.type, 'assistant-message-delta');

    const returnPromise = first.return();
    promptGate.resolve();
    await assert.rejects(
      () => returnPromise,
      (error) => {
        assert.equal(error.message, 'unsubscribe failed [redacted]');
        assert.equal(error.message.includes('sk-openai-secret'), false);
        return true;
      },
    );

    const retryEvents = await collect(runtime.sendMessage(createMessageRequest()));

    assert.equal(subscribeAttempts, 2);
    assert.equal(calls.unsubscribed, 2);
    assert.equal(retryEvents[0].type, 'assistant-message-delta');
  });

  it('sanitizes public dispose abort failures and removes the runner session', async () => {
    const promptGate = createDeferred();
    const { sdk, ai, calls, session } = createFakeDependencies({ promptGate });
    session.abort = async () => {
      calls.sessionAborted += 1;
      throw new Error('dispose abort failed for sk-openai-secret');
    };
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());
    const stream = runtime.sendMessage(createMessageRequest())[Symbol.asyncIterator]();
    assert.equal((await stream.next()).value.type, 'assistant-message-delta');

    await assert.rejects(
      () => runtime.disposeSession('pi-00000000-0000-4000-8000-000000000100'),
      (error) => {
        assert.equal(error.message, 'dispose abort failed for [redacted]');
        assert.equal(error.message.includes('sk-openai-secret'), false);
        return true;
      },
    );
    promptGate.resolve();
    try {
      await stream.return?.();
    } catch (error) {
      assert.equal(error.message, 'dispose abort failed for [redacted]');
      assert.equal(error.message.includes('sk-openai-secret'), false);
    }

    assert.equal(calls.unsubscribed, 1);
    assert.equal(calls.disposed, 1);
    await assert.rejects(
      () => collect(runtime.sendMessage(createMessageRequest())),
      /Runner session not found/,
    );
  });

  it('sanitizes public dispose failures and removes the runner session', async () => {
    const { sdk, ai, calls, session } = createFakeDependencies();
    session.dispose = () => {
      calls.disposed += 1;
      throw new Error('dispose failed for sk-openai-secret');
    };
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());

    await assert.rejects(
      () => runtime.disposeSession('pi-00000000-0000-4000-8000-000000000100'),
      (error) => {
        assert.equal(error.message, 'dispose failed for [redacted]');
        assert.equal(error.message.includes('sk-openai-secret'), false);
        return true;
      },
    );

    assert.equal(calls.disposed, 1);
    await assert.rejects(
      () => collect(runtime.sendMessage(createMessageRequest())),
      /Runner session not found/,
    );
  });

  it('returns a sanitized runner-error event when Pi prompt fails', async () => {
    const { sdk, ai, session } = createFakeDependencies();
    session.prompt = async () => {
      throw new Error('provider rejected sk-openai-secret');
    };
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());

    const events = await collect(
      runtime.sendMessage(createMessageRequest()),
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

  it('redacts provider and MCP secrets from Pi prompt failures', async () => {
    const { sdk, ai, session } = createFakeDependencies();
    session.prompt = async () => {
      throw new Error('provider rejected sk-openai-secret and mcp-token-secret');
    };
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody({ mcpGateway: createMcpGateway() }));

    const events = await collect(runtime.sendMessage(createMessageRequest()));

    assert.deepEqual(events, [
      {
        type: 'runner-error',
        sessionId: '00000000-0000-4000-8000-000000000100',
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        message: 'provider rejected [redacted] and [redacted]',
      },
    ]);
  });

  it('returns a sanitized runner-error event when Pi prompt throws synchronously', async () => {
    const { sdk, ai, session, calls } = createFakeDependencies();
    let promptAttempts = 0;
    const originalPrompt = session.prompt.bind(session);
    session.prompt = (text) => {
      promptAttempts += 1;
      if (promptAttempts === 1) {
        throw new Error('provider sync rejected sk-openai-secret');
      }

      return originalPrompt(text);
    };
    const runtime = createPiRuntime({ sdk, ai });
    await runtime.createSession(createSessionBody());

    const events = await collect(runtime.sendMessage(createMessageRequest()));

    assert.deepEqual(events, [
      {
        type: 'runner-error',
        sessionId: '00000000-0000-4000-8000-000000000100',
        runnerSessionId: 'pi-00000000-0000-4000-8000-000000000100',
        message: 'provider sync rejected [redacted]',
      },
    ]);
    assert.equal(calls.unsubscribed, 1);

    const retryEvents = await collect(runtime.sendMessage(createMessageRequest()));

    assert.equal(promptAttempts, 2);
    assert.equal(retryEvents[0].type, 'assistant-message-delta');
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

    await runtime.disposeSession('pi-00000000-0000-4000-8000-000000000100');

    assert.equal(calls.disposed, 1);
  });
});
