import { getModel } from '@earendil-works/pi-ai';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
  'Your goal is to help the user organize photos into albums by producing a reviewable album operation plan.',
  'Use Gallery read tools to inspect the session-scoped library before planning: mcp_gallery_searchAssets, mcp_gallery_readAssetMetadata, mcp_gallery_readAssetPreviews, mcp_gallery_readAssetOriginals, mcp_gallery_listAlbums, and mcp_gallery_readAlbum.',
  'When you have a concrete plan, call mcp_gallery_proposeAlbumOperations so Gallery can show the user a review panel.',
  'If the user asks for changes to an existing plan, call mcp_gallery_reviseProposedOperations with the planId. Use mcp_gallery_summarizePlan when you need a compact summary of a proposed plan.',
  'Plan operations may include album.create, album.addAssets, album.updateDetails, and album.setCover.',
  'For new albums, use stable temporaryTargetId values on album.create and reference those same temporaryTargetId values from dependent album.addAssets or album.setCover operations.',
  'If a user asks for an empty album, propose a single album.create operation with payload.albumName and an empty description; do not add asset operations.',
  'Prefer concise, useful album names and summaries. Only propose operations that are supported by the inspected assets, albums, and session permissions.',
  'If a planning tool call fails with a validation error and the fix is obvious, correct the JSON shape and retry once before explaining the issue.',
  'Do not redirect the user to Apple Photos, Google Photos, Samsung Gallery, or another app. Stay inside Gallery and use Gallery plans.',
  'You have no direct write tools and must not apply album changes yourself.',
  'Never claim you changed albums. Album writes require a separate user-reviewed apply step.',
].join('\n');
const runtimePackageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimeAgentDir = join(runtimePackageRoot, '.pi-runtime');
const runtimeSessionRoot = join(runtimeAgentDir, 'sessions');
const requireFromRuntime = createRequire(import.meta.url);
let mcpEnvironmentQueue = Promise.resolve();

const resolvePiMcpExtensionPath = () =>
  join(dirname(requireFromRuntime.resolve('pi-mcp-extension/package.json')), 'src/index.ts');

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

const redactSecrets = (message, secrets) =>
  secrets.reduce((redacted, secret) => redactSecret(redacted, secret), message);

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

const assistantTextFromSession = (session) => {
  const completedText = session.getLastAssistantText?.();
  if (typeof completedText === 'string' && completedText.length > 0) {
    return completedText;
  }

  return assistantTextFromMessages(session.messages);
};

const assistantErrorFromSession = (session) => {
  const assistant = [...(session.messages ?? [])].reverse().find((message) => message?.role === 'assistant');
  if (assistant?.stopReason !== 'error') {
    return undefined;
  }

  return typeof assistant.errorMessage === 'string' && assistant.errorMessage.length > 0
    ? assistant.errorMessage
    : 'Provider request failed';
};

const sanitizedErrorMessage = (error, secret) => {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecret(message || 'Provider request failed', secret);
};

const sanitizedErrorMessageWithSecrets = (error, secrets) => {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(message || 'Provider request failed', secrets);
};

const sanitizeSessionError = (error, entry) =>
  sanitizedErrorMessageWithSecrets(error, [entry.credentialSecret, entry.mcpToken]);

const createMcpSessionWorkspace = async (gallerySessionId) => {
  const sessionHash = createHash('sha256').update(String(gallerySessionId)).digest('hex').slice(0, 24);
  const workspace = join(runtimeSessionRoot, `${sessionHash}-${randomUUID()}`);
  const homeDir = join(workspace, 'home');
  await mkdir(join(workspace, '.pi'), { recursive: true });
  await mkdir(join(homeDir, '.pi/agent'), { recursive: true });
  return { workspace, homeDir };
};

const writeMcpConfig = async ({ workspace, gateway }) => {
  const config = {
    mcpServers: {
      gallery: {
        transport: 'streamable-http',
        lifecycle: 'eager',
        url: gateway.url,
        headers: { Authorization: `Bearer ${gateway.token}` },
      },
    },
  };
  await writeFile(join(workspace, '.pi/mcp.json'), `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
};

const readActiveToolNames = (session) => {
  if (typeof session.getActiveToolNames === 'function') {
    return session.getActiveToolNames();
  }

  if (typeof session.getActiveTools === 'function') {
    return session.getActiveTools();
  }

  return [];
};

const galleryMcpToolNamesFromSession = (session) =>
  readActiveToolNames(session).filter((toolName) => typeof toolName === 'string' && toolName.startsWith('mcp_gallery_'));

const runWithMcpEnvironment = async (mcpRuntime, operation) => {
  if (!mcpRuntime) {
    return operation();
  }

  const previous = mcpEnvironmentQueue.catch(() => {});
  let releaseQueue;
  mcpEnvironmentQueue = previous.then(
    () =>
      new Promise((resolve) => {
        releaseQueue = resolve;
      }),
  );
  await previous;

  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const originalCwd = process.cwd();
  try {
    process.env.HOME = mcpRuntime.homeDir;
    process.env.USERPROFILE = mcpRuntime.homeDir;
    process.chdir(mcpRuntime.workspace);
    return await operation();
  } finally {
    process.chdir(originalCwd);
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
    releaseQueue();
  }
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
  const createSessionQueues = new Map();

  const runSerializedCreateSession = async (runnerSessionId, operation) => {
    const previous = createSessionQueues.get(runnerSessionId) ?? Promise.resolve();
    let releaseQueue;
    const queueEntry = new Promise((resolve) => {
      releaseQueue = resolve;
    });
    const current = previous.catch(() => {}).then(() => queueEntry);
    createSessionQueues.set(runnerSessionId, current);
    await previous.catch(() => {});

    try {
      return await operation();
    } finally {
      releaseQueue();
      if (createSessionQueues.get(runnerSessionId) === current) {
        createSessionQueues.delete(runnerSessionId);
      }
    }
  };

  return {
    async createSession(body) {
      const runnerSessionId = `pi-${body.gallerySessionId}`;
      return runSerializedCreateSession(runnerSessionId, async () => {
        let sessionWorkspace;
        let newSession;
        try {
          const providerName = mapProviderType(body.credential.providerType, body.gallerySessionId);
          const authStorage = sdk.AuthStorage.inMemory ? sdk.AuthStorage.inMemory() : sdk.AuthStorage.create();
          authStorage.setRuntimeApiKey(providerName, body.credential.secret);

          const modelRegistry = sdk.ModelRegistry.inMemory
            ? sdk.ModelRegistry.inMemory(authStorage)
            : sdk.ModelRegistry.create(authStorage);
          const settingsManager = sdk.SettingsManager.inMemory({
            compaction: { enabled: false },
          });
          const extensionFactories = createOpenAiCompatibleProviderFactories({
            providerName,
            credential: body.credential,
            model: body.model,
          });
          const mcpGateway = body.mcpGateway ?? null;
          const mcpRuntime = mcpGateway ? await createMcpSessionWorkspace(body.gallerySessionId) : null;
          if (mcpRuntime) {
            sessionWorkspace = mcpRuntime.workspace;
            await writeMcpConfig({ workspace: mcpRuntime.workspace, gateway: mcpGateway });
          }
          const resourceLoader = new sdk.DefaultResourceLoader({
            cwd: mcpRuntime?.workspace ?? runtimePackageRoot,
            agentDir: runtimeAgentDir,
            homeDir: mcpRuntime?.homeDir,
            settingsManager,
            systemPrompt,
            appendSystemPrompt: [],
            noContextFiles: true,
            noSkills: true,
            noPromptTemplates: true,
            noThemes: true,
            noExtensions: true,
            additionalExtensionPaths: mcpGateway ? [resolvePiMcpExtensionPath()] : [],
            extensionFactories,
          });

          await runWithMcpEnvironment(mcpRuntime, () => resourceLoader.reload());
          applyPendingProviderRegistrations(resourceLoader, modelRegistry);

          const model = ai.getModel(providerName, body.model) ?? modelRegistry.find(providerName, body.model);
          if (!model) {
            throw new Error(`Model ${body.model} is not available for provider ${providerName}`);
          }

          const { session } = await sdk.createAgentSession({
            cwd: mcpRuntime?.workspace ?? runtimePackageRoot,
            agentDir: runtimeAgentDir,
            model,
            authStorage,
            modelRegistry,
            sessionManager: sdk.SessionManager.inMemory(),
            settingsManager,
            resourceLoader,
            noTools: 'builtin',
            ...(mcpGateway ? {} : { tools: [] }),
          });
          newSession = session;

          const activeGalleryMcpToolNames = mcpGateway
            ? await runWithMcpEnvironment(mcpRuntime, () =>
                Promise.resolve(session.bindExtensions?.({})).then(() => galleryMcpToolNamesFromSession(session)),
              )
            : [];
          if (mcpGateway && activeGalleryMcpToolNames.length === 0) {
            throw new Error('No active Gallery MCP tools after extension startup');
          }

          const existingEntry = sessions.get(runnerSessionId);
          try {
            await this.disposeSession(runnerSessionId);
          } catch (error) {
            try {
              await session.dispose?.();
              newSession = undefined;
            } catch {
              // Preserve the replacement failure that prevented the new session from becoming owned by the runtime.
            }

            throw new Error(
              sanitizedErrorMessageWithSecrets(error, [
                body.credential.secret,
                body.mcpGateway?.token,
                existingEntry?.credentialSecret,
                existingEntry?.mcpToken,
              ]),
            );
          }
          sessions.set(runnerSessionId, {
            gallerySessionId: body.gallerySessionId,
            credentialSecret: body.credential.secret,
            mcpToken: mcpGateway?.token,
            sessionWorkspace,
            model: body.model,
            session,
            inFlight: false,
            abortActiveStream: undefined,
            unsubscribe: undefined,
          });

          return {
            runnerSessionId,
            capabilities: {
              protocolVersion,
              streaming: true,
              tools: activeGalleryMcpToolNames,
              models: [body.model],
              runtime: 'pi',
            },
          };
        } catch (error) {
          try {
            await newSession?.dispose?.();
          } catch {
            // Preserve the startup error that prevented session ownership.
          }
          if (sessionWorkspace) {
            await rm(sessionWorkspace, { recursive: true, force: true });
          }
          throw new Error(sanitizedErrorMessageWithSecrets(error, [body?.credential?.secret, body?.mcpGateway?.token]));
        }
      });
    },

    async *sendMessage({ runnerSessionId, gallerySessionId, messageId: _messageId, content }) {
      const entry = sessions.get(runnerSessionId);
      if (!entry || entry.gallerySessionId !== gallerySessionId) {
        throw new Error('Runner session not found');
      }
      if (entry.inFlight) {
        throw new Error('Runner session already has an active message stream');
      }
      entry.inFlight = true;

      let sequence = 0;
      const pendingEvents = [];
      let wake;
      let finished = false;
      let aborted = false;
      let promptSettled = false;
      let abortPromise;

      const enqueue = (event) => {
        pendingEvents.push(event);
        wake?.();
        wake = undefined;
      };
      const abortActiveStream = ({ emitError } = { emitError: true }) => {
        if (aborted) {
          return abortPromise;
        }

        aborted = true;
        abortPromise = Promise.resolve()
          .then(() => {
            if (entry.session.abort) {
              return entry.session.abort();
            }

            return entry.session.agent?.abort?.();
          })
          .finally(() => {
            if (emitError) {
              enqueue({
                type: 'runner-error',
                sessionId: gallerySessionId,
                runnerSessionId,
                message: 'Runner session disposed',
              });
              finished = true;
            }
            wake?.();
            wake = undefined;
          });
        return abortPromise;
      };

      let unsubscribe;
      let subscribed = false;
      const releaseSubscription = () => {
        if (!subscribed) {
          return;
        }

        subscribed = false;
        unsubscribe();
      };

      try {
        unsubscribe = entry.session.subscribe((event) => {
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
        subscribed = true;
      } catch (error) {
        entry.inFlight = false;
        throw new Error(sanitizeSessionError(error, entry));
      }

      entry.unsubscribe = releaseSubscription;
      entry.abortActiveStream = abortActiveStream;
      let promptPromise;

      try {
        promptPromise = Promise.resolve()
          .then(() => entry.session.prompt(textPromptFromContent(content)))
          .then(() => {
            if (aborted) {
              return;
            }

            const assistantError = assistantErrorFromSession(entry.session);
            if (assistantError) {
              enqueue({
                type: 'runner-error',
                sessionId: gallerySessionId,
                runnerSessionId,
                message: sanitizeSessionError(assistantError, entry),
              });
              return;
            }

            enqueue({
              type: 'assistant-message-completed',
              sessionId: gallerySessionId,
              runnerSessionId,
              providerMessageId: null,
              content: { blocks: [{ type: 'text', text: assistantTextFromSession(entry.session) }] },
            });
          })
          .catch((error) => {
            if (aborted) {
              return;
            }

            enqueue({
              type: 'runner-error',
              sessionId: gallerySessionId,
              runnerSessionId,
              message: sanitizeSessionError(error, entry),
            });
          })
          .finally(() => {
            promptSettled = true;
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
        let cleanupError;
        if (!promptSettled) {
          try {
            await abortActiveStream({ emitError: false });
          } catch (error) {
            cleanupError = error;
          }
          try {
            await promptPromise;
          } catch (error) {
            cleanupError ??= error;
          }
        }
        try {
          releaseSubscription();
        } catch (error) {
          cleanupError ??= error;
        }
        entry.inFlight = false;
        if (entry.abortActiveStream === abortActiveStream) {
          entry.abortActiveStream = undefined;
        }
        if (entry.unsubscribe === releaseSubscription) {
          entry.unsubscribe = undefined;
        }
        if (cleanupError) {
          throw new Error(sanitizeSessionError(cleanupError, entry));
        }
      }
    },

    async *resumeSession({ runnerSessionId, gallerySessionId }) {
      const entry = sessions.get(runnerSessionId);
      if (!entry || entry.gallerySessionId !== gallerySessionId) {
        throw new Error('Runner session not found');
      }
      if (entry.inFlight) {
        throw new Error('Runner session already has an active message stream');
      }
      entry.inFlight = true;

      let sequence = 0;
      const pendingEvents = [];
      let wake;
      let finished = false;
      let aborted = false;
      let promptSettled = false;
      let abortPromise;

      const enqueue = (event) => {
        pendingEvents.push(event);
        wake?.();
        wake = undefined;
      };
      const abortActiveStream = ({ emitError } = { emitError: true }) => {
        if (aborted) {
          return abortPromise;
        }

        aborted = true;
        abortPromise = Promise.resolve()
          .then(() => {
            if (entry.session.abort) {
              return entry.session.abort();
            }

            return entry.session.agent?.abort?.();
          })
          .finally(() => {
            if (emitError) {
              enqueue({
                type: 'runner-error',
                sessionId: gallerySessionId,
                runnerSessionId,
                message: 'Runner session disposed',
              });
              finished = true;
            }
            wake?.();
            wake = undefined;
          });
        return abortPromise;
      };

      let unsubscribe;
      let subscribed = false;
      const releaseSubscription = () => {
        if (!subscribed) {
          return;
        }

        subscribed = false;
        unsubscribe();
      };

      try {
        unsubscribe = entry.session.subscribe((event) => {
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
        subscribed = true;
      } catch (error) {
        entry.inFlight = false;
        throw new Error(sanitizeSessionError(error, entry));
      }

      entry.unsubscribe = releaseSubscription;
      entry.abortActiveStream = abortActiveStream;
      let promptPromise;

      try {
        promptPromise = Promise.resolve()
          .then(() => {
            const continueTurn = entry.session.continue ?? entry.session.agent?.continue;
            if (typeof continueTurn !== 'function') {
              throw new Error('Runner session cannot continue after approval');
            }

            return continueTurn.call(entry.session.continue ? entry.session : entry.session.agent);
          })
          .then(() => {
            if (aborted) {
              return;
            }

            const assistantError = assistantErrorFromSession(entry.session);
            if (assistantError) {
              enqueue({
                type: 'runner-error',
                sessionId: gallerySessionId,
                runnerSessionId,
                message: sanitizeSessionError(assistantError, entry),
              });
              return;
            }

            enqueue({
              type: 'assistant-message-completed',
              sessionId: gallerySessionId,
              runnerSessionId,
              providerMessageId: null,
              content: { blocks: [{ type: 'text', text: assistantTextFromSession(entry.session) }] },
            });
          })
          .catch((error) => {
            if (aborted) {
              return;
            }

            enqueue({
              type: 'runner-error',
              sessionId: gallerySessionId,
              runnerSessionId,
              message: sanitizeSessionError(error, entry),
            });
          })
          .finally(() => {
            promptSettled = true;
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
        let cleanupError;
        if (!promptSettled) {
          try {
            await abortActiveStream({ emitError: false });
          } catch (error) {
            cleanupError = error;
          }
          try {
            await promptPromise;
          } catch (error) {
            cleanupError ??= error;
          }
        }
        try {
          releaseSubscription();
        } catch (error) {
          cleanupError ??= error;
        }
        entry.inFlight = false;
        if (entry.abortActiveStream === abortActiveStream) {
          entry.abortActiveStream = undefined;
        }
        if (entry.unsubscribe === releaseSubscription) {
          entry.unsubscribe = undefined;
        }
        if (cleanupError) {
          throw new Error(sanitizeSessionError(cleanupError, entry));
        }
      }
    },

    async disposeSession(runnerSessionId) {
      const entry = sessions.get(runnerSessionId);
      if (!entry) {
        return;
      }

      let cleanupError;
      try {
        await entry.abortActiveStream?.();
      } catch (error) {
        cleanupError = error;
      }
      entry.abortActiveStream = undefined;
      try {
        entry.unsubscribe?.();
      } catch (error) {
        cleanupError ??= error;
      }
      entry.unsubscribe = undefined;
      try {
        await entry.session.dispose?.();
      } catch (error) {
        cleanupError ??= error;
      }
      if (entry.sessionWorkspace) {
        try {
          await rm(entry.sessionWorkspace, { recursive: true, force: true });
        } catch (error) {
          cleanupError ??= error;
        }
      }
      sessions.delete(runnerSessionId);
      if (cleanupError) {
        throw new Error(sanitizedErrorMessageWithSecrets(cleanupError, [entry.credentialSecret, entry.mcpToken]));
      }
    },
  };
};
