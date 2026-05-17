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
  createAgentSession,
  getAgentSession,
  getAlbumInfo,
  getAllAlbums,
  getCurrentOperationPlan,
  getToolCalls,
  type AgentOperationPlanApplyResponseDto,
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

const sendAssistantPrompt = async (page: Page, prompt: string) => {
  await page.getByRole('textbox', { name: 'Message' }).fill(prompt);
  await page.getByRole('button', { name: 'Send' }).click();
};

const startAssistantSession = async (page: Page, accessToken: string, providerCredentialId: string, prompt: string) => {
  const session = await createAgentSession(
    {
      agentSessionCreateDto: {
        providerCredentialId,
        model,
        permissionPreset: AgentPermissionPreset.Careful,
        approvalMode: AgentApprovalMode.PlanOnly,
      },
    },
    authOptions(accessToken),
  );

  await page.goto(`/assistant?session=${session.id}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await sendAssistantPrompt(page, prompt);
  return session;
};

test.describe('Assistant album organizer', () => {
  let admin: LoginResponseDto;
  let providerCredentialId: string;

  test.beforeAll(async () => {
    utils.initSdk();
  });

  test.beforeEach(async () => {
    await utils.resetDatabase();
    admin = await utils.adminSetup();
    const credential = await createE2eCredential(admin.accessToken);
    providerCredentialId = credential.id;
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

    const session = await startAssistantSession(
      page,
      admin.accessToken,
      providerCredentialId,
      'Create a Portugal trip album from my loose photos.',
    );

    await expect(page.getByText('I proposed a Portugal Trip album.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Plan review' })).toBeVisible();
    await expect(page.getByText('Create Portugal Trip and add 2 loose assets.')).toBeVisible();
    await expect(page.getByText('1 destination')).toBeVisible();
    await expect(page.getByText('3 selected changes')).toBeVisible();

    const portugalDestination = page
      .getByTestId('agent-session-chat-transcript')
      .getByRole('region', { name: 'Portugal Trip' });
    await expect(portugalDestination).toBeVisible();
    const thumbnailStrip = portugalDestination.getByTestId('agent-plan-thumbnail-strip');
    await expect(thumbnailStrip).toBeVisible();
    await expect(thumbnailStrip.getByTestId('agent-plan-thumbnail-image')).toHaveCount(2);
    await expect(thumbnailStrip.getByText(/\+\d+/)).toHaveCount(0);
    await expect(page.getByText('New album')).toBeVisible();
    await expect(page.getByLabel('Create album "Portugal Trip"')).toBeChecked();
    await expect(page.getByLabel('Add 2 photos')).toBeChecked();
    await expect(page.getByLabel('Set cover photo')).toBeChecked();

    await expect(page.getByText('Create Portugal Trip', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Add selected photos to Portugal Trip')).toHaveCount(0);
    await expect(page.getByText('Use first photo as Portugal Trip cover')).toHaveCount(0);

    const currentPlan = await getCurrentOperationPlan({ id: session.id }, authOptions(admin.accessToken));
    if (!currentPlan) {
      throw new Error('Expected the runner to create an operation plan');
    }
    const proposedAddOperation = currentPlan.operations.find(
      (operation) => operation.type === AgentOperationType.AlbumAddAssets,
    );
    expect(proposedAddOperation?.id).toEqual(expect.any(String));
    const excludedAssetId = proposedAddOperation!.assetIds[1];
    expect(excludedAssetId).toEqual(expect.any(String));

    await expect(page.getByText(proposedAddOperation!.id)).toHaveCount(0);
    await portugalDestination.getByText('Details').nth(1).click();
    await expect(page.getByText(proposedAddOperation!.id)).toBeVisible();

    await portugalDestination.getByRole('checkbox', { name: 'Include photo 2' }).uncheck();
    await expect(page.getByText('1 of 2 photos selected')).toBeVisible();
    await page.getByLabel('Set cover photo').uncheck();
    await expect(page.getByRole('button', { name: 'Apply 2 selected' })).toBeEnabled();

    const applyRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().includes(`/api/agent/sessions/${session.id}/operation-plan/`) &&
        request.url().endsWith('/apply'),
    );
    const applyResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/agent/sessions/${session.id}/operation-plan/`) &&
        response.url().endsWith('/apply') &&
        response.status() === 201,
    );
    await page.getByRole('button', { name: 'Apply 2 selected' }).click();
    const applyRequest = await applyRequestPromise;
    expect(applyRequest.postDataJSON()).toMatchObject({
      operationIds: expect.arrayContaining([proposedAddOperation!.id]),
      itemSelections: {
        [proposedAddOperation!.id]: {
          itemKind: 'asset',
          mode: 'allExcept',
          itemIds: [excludedAssetId],
        },
      },
      planRevision: currentPlan.revision,
    });
    const applyResponse = await applyResponsePromise;
    const { plan: appliedPlan } = (await applyResponse.json()) as AgentOperationPlanApplyResponseDto;

    await expect(page.getByText('Applied 2 operations. 0 failed.')).toBeVisible();
    expect(appliedPlan.status).toBe(AgentOperationPlanStatus.Applied);
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
    expect(album.assetCount).toBe(1);
  });

  test('surfaces and audits a denied runner proposal without creating a plan or album', async ({ context, page }) => {
    await utils.createAsset(admin.accessToken);
    await utils.setAuthCookies(context, admin.accessToken);

    const session = await startAssistantSession(
      page,
      admin.accessToken,
      providerCredentialId,
      'Create a denied test album with an inaccessible photo.',
    );

    await expect(page.getByText(/Gallery denied the album organization request/)).toBeVisible({ timeout: 10_000 });

    await expect
      .poll(async () => await getCurrentOperationPlan({ id: session.id }, authOptions(admin.accessToken)), {
        timeout: 5000,
      })
      .toBeFalsy();

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
