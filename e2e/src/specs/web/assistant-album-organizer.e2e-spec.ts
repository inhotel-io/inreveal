import {
  AgentApprovalMode,
  AgentOperationPlanStatus,
  AgentOperationStatus,
  AgentOperationType,
  AgentPermissionPreset,
  AgentSessionStatus,
  AgentToolCallStatus,
  AgentToolName,
  ProviderType,
  createAgentProviderCredential,
  getAgentSession,
  getAgentSessions,
  getAlbumInfo,
  getAllAlbums,
  getCurrentOperationPlan,
  getToolCalls,
  type AgentOperationPlanResponseDto,
  type AgentSessionResponseDto,
  type LoginResponseDto,
} from '@immich/sdk';
import { expect, test, type Page } from '@playwright/test';
import { asBearerAuth, utils } from 'src/utils';

const credentialLabel = 'E2E deterministic runner';
const model = 'e2e-album-organizer';

const authOptions = (accessToken: string) => ({ headers: asBearerAuth(accessToken) });

const createE2eCredential = (accessToken: string) =>
  createAgentProviderCredential(
    {
      agentProviderCredentialCreateDto: {
        providerType: ProviderType.OpenaiCompatible,
        label: credentialLabel,
        secret: 'e2e-secret',
        baseUrl: 'http://e2e-provider.invalid/v1',
        models: [model],
        defaultModel: model,
      },
    },
    authOptions(accessToken),
  );

const waitForLatestSession = async (
  accessToken: string,
  expectedStatus: AgentSessionStatus,
): Promise<AgentSessionResponseDto> => {
  let latestSession: AgentSessionResponseDto | undefined;

  await expect
    .poll(
      async () => {
        const sessions = await getAgentSessions(authOptions(accessToken));
        latestSession = sessions.toSorted((first, second) => second.createdAt.localeCompare(first.createdAt))[0];
        return latestSession?.status;
      },
      { timeout: 10_000 },
    )
    .toBe(expectedStatus);

  return latestSession!;
};

const waitForCurrentPlan = async (
  accessToken: string,
  sessionId: string,
  expectedStatus: AgentOperationPlanStatus,
): Promise<AgentOperationPlanResponseDto> => {
  let plan: AgentOperationPlanResponseDto | null = null;

  await expect
    .poll(
      async () => {
        plan = await getCurrentOperationPlan({ id: sessionId }, authOptions(accessToken));
        return plan?.status;
      },
      { timeout: 10_000 },
    )
    .toBe(expectedStatus);

  return plan!;
};

const startAssistantSession = async (page: Page, accessToken: string) => {
  await page.goto('/assistant');
  await expect(page.getByTestId('assistant-status-reason')).toHaveText('Runner healthy');
  await expect(page.getByRole('heading', { name: 'Session setup' })).toBeVisible();

  await page.getByLabel('Provider credential').selectOption({ label: credentialLabel });
  await page.getByLabel('Model').fill(model);
  await page.getByLabel('Permission preset', { exact: true }).selectOption(AgentPermissionPreset.Careful);
  await page.getByLabel('Approval mode', { exact: true }).selectOption(AgentApprovalMode.PlanOnly);
  await page.getByRole('button', { name: 'Start session' }).click();

  await expect(page.getByRole('heading', { name: 'Created session' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Chat' })).toBeVisible();
  await expect(page.getByText('No proposed album plan yet.')).toBeVisible();

  return waitForLatestSession(accessToken, AgentSessionStatus.Running);
};

const sendAssistantPrompt = async (page: Page, prompt: string) => {
  await page.getByRole('textbox', { name: 'Message' }).fill(prompt);
  await page.getByRole('button', { name: 'Send' }).click();
};

test.describe('Assistant album organizer', () => {
  let admin: LoginResponseDto;

  test.beforeAll(async () => {
    utils.initSdk();
  });

  test.beforeEach(async () => {
    await utils.resetDatabase();
    admin = await utils.adminSetup();
    await createE2eCredential(admin.accessToken);
  });

  test('proposes album operations, lets the user toggle one off, and applies the approved operations', async ({
    context,
    page,
  }) => {
    await Promise.all([
      utils.createAsset(admin.accessToken, {
        fileCreatedAt: '2026-05-01T10:00:00.000Z',
        fileModifiedAt: '2026-05-01T10:00:00.000Z',
      }),
      utils.createAsset(admin.accessToken, {
        fileCreatedAt: '2026-05-02T10:00:00.000Z',
        fileModifiedAt: '2026-05-02T10:00:00.000Z',
      }),
    ]);
    await utils.setAuthCookies(context, admin.accessToken);

    const session = await startAssistantSession(page, admin.accessToken);
    await sendAssistantPrompt(page, 'Create a Portugal trip album from my loose photos.');

    await expect(page.getByText('I proposed a Portugal Trip album.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Plan review' })).toBeVisible();
    await expect(page.getByText('Create Portugal Trip and add 2 loose assets.')).toBeVisible();
    await expect(page.getByLabel('Create Portugal Trip')).toBeChecked();
    await expect(page.getByLabel('Add selected photos to Portugal Trip')).toBeChecked();
    await expect(page.getByLabel('Use first photo as Portugal Trip cover')).toBeChecked();

    await page.getByLabel('Use first photo as Portugal Trip cover').uncheck();
    await expect(page.getByRole('button', { name: 'Apply 2 selected' })).toBeEnabled();

    const applyResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/agent/sessions/${session.id}/operation-plan/`) &&
        response.url().endsWith('/apply') &&
        response.status() === 201,
    );
    await page.getByRole('button', { name: 'Apply 2 selected' }).click();
    await applyResponse;

    await expect(page.getByRole('status')).toContainText('Applied 2 operations. 0 failed.');
    const appliedPlan = await waitForCurrentPlan(admin.accessToken, session.id, AgentOperationPlanStatus.Applied);
    await expect
      .poll(
        async () => {
          const updatedSession = await getAgentSession({ id: session.id }, authOptions(admin.accessToken));
          return updatedSession.status;
        },
        {
          timeout: 10_000,
        },
      )
      .toBe(AgentSessionStatus.Completed);

    const createOperation = appliedPlan.operations.find(
      (operation) => operation.type === AgentOperationType.AlbumCreate,
    );
    const addOperation = appliedPlan.operations.find(
      (operation) => operation.type === AgentOperationType.AlbumAddAssets,
    );
    const coverOperation = appliedPlan.operations.find(
      (operation) => operation.type === AgentOperationType.AlbumSetCover,
    );

    expect(createOperation?.status).toBe(AgentOperationStatus.Applied);
    expect(addOperation?.status).toBe(AgentOperationStatus.Applied);
    expect(coverOperation?.status).toBe(AgentOperationStatus.Skipped);
    expect(coverOperation?.result).toEqual({ skippedReason: 'Operation was not selected for apply' });

    const albumId = createOperation?.result?.albumId;
    expect(albumId).toEqual(expect.any(String));

    const album = await getAlbumInfo({ id: albumId as string }, authOptions(admin.accessToken));
    expect(album.albumName).toBe('Portugal Trip');
    expect(album.description).toBe('Organized by the deterministic e2e assistant.');
    expect(album.assetCount).toBe(2);
  });

  test('surfaces and audits a denied runner proposal without creating a plan or album', async ({ context, page }) => {
    await utils.createAsset(admin.accessToken);
    await utils.setAuthCookies(context, admin.accessToken);

    const session = await startAssistantSession(page, admin.accessToken);
    await sendAssistantPrompt(page, 'Create a denied test album with an inaccessible photo.');

    await expect(page.getByText(/Gallery denied the album organization request/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No proposed album plan yet.')).toBeVisible();

    await expect
      .poll(async () => await getCurrentOperationPlan({ id: session.id }, authOptions(admin.accessToken)), {
        timeout: 5000,
      })
      .toBeNull();

    const toolCalls = await getToolCalls({ id: session.id }, authOptions(admin.accessToken));
    const proposalToolCall = toolCalls.find((toolCall) => toolCall.toolName === AgentToolName.ProposeAlbumOperations);
    expect(proposalToolCall).toMatchObject({
      status: AgentToolCallStatus.Denied,
      toolName: AgentToolName.ProposeAlbumOperations,
      error: 'One or more assets are not accessible',
    });

    const albums = await getAllAlbums({}, authOptions(admin.accessToken));
    expect(albums.map((album) => album.albumName)).not.toContain('Denied Trip');
  });
});
