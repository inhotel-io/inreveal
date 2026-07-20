import {
  AssetEditAction,
  getAssetInfo,
  updateAsset,
  updateAssetFavorites,
  type AssetEditActionItemDto,
} from '@immich/sdk';
import { modalManager, toastManager } from '@immich/ui';
import { vitest } from 'vitest';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import AssetAddToCollectionModal from '$lib/modals/AssetAddToCollectionModal.svelte';
import {
  getAssetActions,
  getAssetBulkActions,
  handleDownloadAsset,
  mergeRotation,
  normalizeAngle,
} from '$lib/services/asset.service';
import { setSharedLink } from '$lib/utils';
import { getFormatter } from '$lib/utils/i18n';
import { assetFactory } from '@test-data/factories/asset-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';

const { downloadUrlMock } = vitest.hoisted(() => ({
  downloadUrlMock: vitest.fn(),
}));

vitest.mock('@immich/ui', () => ({
  toastManager: {
    primary: vitest.fn(),
    danger: vitest.fn(),
  },
  modalManager: { show: vitest.fn() },
}));

vitest.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({
  assetMultiSelectManager: { assets: [{ id: 'x1' }, { id: 'x2' }] },
}));

vitest.mock('$lib/utils/i18n', () => ({
  getFormatter: vitest.fn(),
  getPreferredLocale: vitest.fn(),
}));

vitest.mock('@immich/sdk', async () => {
  const originalModule = await vitest.importActual<typeof import('@immich/sdk')>('@immich/sdk');
  return {
    ...originalModule,
    getAssetInfo: vitest.fn(),
    updateAsset: vitest.fn(),
    updateAssetFavorites: vitest.fn(),
  };
});

vitest.mock('$lib/managers/asset-viewer-manager.svelte', () => ({
  assetViewerManager: {
    setAsset: vitest.fn(),
  },
}));

vitest.mock('$lib/utils', async () => {
  const originalModule = await vitest.importActual('$lib/utils');
  return {
    ...originalModule,
    sleep: vitest.fn(),
    downloadUrl: downloadUrlMock,
  };
});

vi.mock(import('$lib/managers/feature-flags-manager.svelte'), function () {
  return {
    featureFlagsManager: { init: vi.fn(), loadFeatureFlags: vi.fn(), value: {} } as never,
  };
});

describe('AssetService', () => {
  describe('getAssetActions', () => {
    beforeEach(() => {
      authManager.setPreferences(preferencesFactory.build());
    });

    it('should allow shared link downloads if the user owns the asset and shared link downloads are disabled', () => {
      const ownerId = 'owner';
      const user = userAdminFactory.build({ id: ownerId });
      const asset = assetFactory.build({ ownerId });
      authManager.setUser(user);
      setSharedLink(sharedLinkFactory.build({ allowDownload: false }));
      const assetActions = getAssetActions(() => '', asset);
      expect(assetActions.SharedLinkDownload.$if?.()).toStrictEqual(true);
    });

    it('should not allow shared link downloads if the user does not own the asset and shared link downloads are disabled', () => {
      const ownerId = 'owner';
      const user = userAdminFactory.build({ id: 'non-owner' });
      const asset = assetFactory.build({ ownerId });
      authManager.setUser(user);
      setSharedLink(sharedLinkFactory.build({ allowDownload: false }));
      const assetActions = getAssetActions(() => '', asset);
      expect(assetActions.SharedLinkDownload.$if?.()).toStrictEqual(false);
    });

    it('should allow shared link downloads if shared link downloads are enabled regardless of user', () => {
      const asset = assetFactory.build();
      setSharedLink(sharedLinkFactory.build({ allowDownload: true }));
      const assetActions = getAssetActions(() => '', asset);
      expect(assetActions.SharedLinkDownload.$if?.()).toStrictEqual(true);
    });
  });

  describe('normalizeAngle', () => {
    it('should return 0 for 0', () => {
      expect(normalizeAngle(0)).toBe(0);
    });

    it('should return 90 for 90', () => {
      expect(normalizeAngle(90)).toBe(90);
    });

    it('should convert -90 to 270', () => {
      expect(normalizeAngle(-90)).toBe(270);
    });

    it('should convert 360 to 0', () => {
      expect(normalizeAngle(360)).toBe(0);
    });

    it('should convert 450 to 90', () => {
      expect(normalizeAngle(450)).toBe(90);
    });

    it('should convert -180 to 180', () => {
      expect(normalizeAngle(-180)).toBe(180);
    });
  });

  describe('mergeRotation', () => {
    it('should add rotation to empty edits', () => {
      const result = mergeRotation([], 90);
      expect(result).toEqual([{ action: AssetEditAction.Rotate, parameters: { angle: 90 } }]);
    });

    it('should merge rotation with existing rotation', () => {
      const existing: AssetEditActionItemDto[] = [{ action: AssetEditAction.Rotate, parameters: { angle: 90 } }];
      const result = mergeRotation(existing, 90);
      expect(result).toEqual([{ action: AssetEditAction.Rotate, parameters: { angle: 180 } }]);
    });

    it('should remove rotation when merged angle is 0 (full circle)', () => {
      const existing: AssetEditActionItemDto[] = [{ action: AssetEditAction.Rotate, parameters: { angle: 270 } }];
      const result = mergeRotation(existing, 90);
      expect(result).toEqual([]);
    });

    it('should preserve other edit actions when merging', () => {
      const existing: AssetEditActionItemDto[] = [
        { action: AssetEditAction.Crop, parameters: { x: 0, y: 0, width: 100, height: 100 } },
        { action: AssetEditAction.Rotate, parameters: { angle: 90 } },
      ];
      const result = mergeRotation(existing, 90);
      expect(result).toEqual([
        { action: AssetEditAction.Crop, parameters: { x: 0, y: 0, width: 100, height: 100 } },
        { action: AssetEditAction.Rotate, parameters: { angle: 180 } },
      ]);
    });

    it('should preserve other edit actions when rotation cancels out', () => {
      const existing: AssetEditActionItemDto[] = [
        { action: AssetEditAction.Crop, parameters: { x: 0, y: 0, width: 100, height: 100 } },
        { action: AssetEditAction.Rotate, parameters: { angle: 270 } },
      ];
      const result = mergeRotation(existing, 90);
      expect(result).toEqual([{ action: AssetEditAction.Crop, parameters: { x: 0, y: 0, width: 100, height: 100 } }]);
    });

    it('should handle rotate left (270 degrees)', () => {
      const result = mergeRotation([], 270);
      expect(result).toEqual([{ action: AssetEditAction.Rotate, parameters: { angle: 270 } }]);
    });

    it('should handle 180 degree rotation', () => {
      const result = mergeRotation([], 180);
      expect(result).toEqual([{ action: AssetEditAction.Rotate, parameters: { angle: 180 } }]);
    });

    it('should handle multiple successive rotations correctly', () => {
      let edits: AssetEditActionItemDto[] = [];
      edits = mergeRotation(edits, 90); // 90
      edits = mergeRotation(edits, 90); // 180
      edits = mergeRotation(edits, 90); // 270
      expect(edits).toEqual([{ action: AssetEditAction.Rotate, parameters: { angle: 270 } }]);
      edits = mergeRotation(edits, 90); // 360 -> 0 -> removed
      expect(edits).toEqual([]);
    });
  });

  describe('handleDownloadAsset', () => {
    it('should use the asset originalFileName when showing toasts', async () => {
      const $t = vitest.fn().mockReturnValue('formatter');
      vitest.mocked(getFormatter).mockResolvedValue($t);
      const asset = assetFactory.build({ originalFileName: 'asset.heic' });
      await handleDownloadAsset(asset, { edited: false });
      expect($t).toHaveBeenNthCalledWith(1, 'downloading_asset_filename', { values: { filename: 'asset.heic' } });
      expect(toastManager.primary).toHaveBeenCalledWith('formatter');
    });

    it('should use the motion asset originalFileName when showing toasts', async () => {
      const $t = vitest.fn().mockReturnValue('formatter');
      vitest.mocked(getFormatter).mockResolvedValue($t);
      const motionAsset = assetFactory.build({ originalFileName: 'asset.mov' });
      vitest.mocked(getAssetInfo).mockResolvedValue(motionAsset);
      const asset = assetFactory.build({ originalFileName: 'asset.heic', livePhotoVideoId: '1' });
      await handleDownloadAsset(asset, { edited: false });
      expect($t).toHaveBeenNthCalledWith(1, 'downloading_asset_filename', { values: { filename: 'asset.heic' } });
      expect($t).toHaveBeenNthCalledWith(2, 'downloading_asset_filename', { values: { filename: 'asset-motion.mov' } });
      expect(toastManager.primary).toHaveBeenCalledWith('formatter');
    });

    it('should request attachment disposition for single-asset downloads', async () => {
      downloadUrlMock.mockClear();
      const $t = vitest.fn().mockReturnValue('formatter');
      vitest.mocked(getFormatter).mockResolvedValue($t);
      const asset = assetFactory.build({ id: 'asset-1', originalFileName: 'asset.jpg', thumbhash: 'cache-1' });

      await handleDownloadAsset(asset, { edited: false });

      expect(downloadUrlMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/assets/asset-1/original'),
        'asset.jpg',
      );
      expect(downloadUrlMock.mock.calls[0][0]).toContain('download=true');
      expect(downloadUrlMock.mock.calls[0][0]).toContain('edited=false');
      expect(downloadUrlMock.mock.calls[0][0]).toContain('c=cache-1');
    });
  });
});

describe('add to album/space entry points', () => {
  beforeEach(() => vitest.mocked(modalManager.show).mockClear());

  it('timeline bulk "+" opens the unified collection modal with the selected ids', () => {
    const action = getAssetBulkActions(((k: string) => k) as never).AddToAlbum;
    action.onAction(action);
    expect(modalManager.show).toHaveBeenCalledWith(AssetAddToCollectionModal, {
      assetIds: ['x1', 'x2'],
      restrictToSpaceId: undefined,
    });
  });

  it('bulk "+" carries the space restriction through to the modal when the selection is not all-owned', () => {
    const action = getAssetBulkActions(((k: string) => k) as never, { restrictToSpaceId: 'space-1' }).AddToAlbum;
    action.onAction(action);
    expect(modalManager.show).toHaveBeenCalledWith(AssetAddToCollectionModal, {
      assetIds: ['x1', 'x2'],
      restrictToSpaceId: 'space-1',
    });
  });

  it('single-photo viewer "+" opens the unified collection modal with the one id', () => {
    const asset = assetFactory.build({ id: 'single-1' });
    const action = getAssetActions(() => '', asset).AddToAlbum;
    action.onAction(action);
    expect(modalManager.show).toHaveBeenCalledWith(AssetAddToCollectionModal, { assetIds: ['single-1'] });
  });
});

describe('favorite actions — per-user, un-gated from ownership (#763 slice 5)', () => {
  let emitSpy: ReturnType<typeof vitest.spyOn>;

  beforeEach(() => {
    authManager.reset();
    setSharedLink(undefined);
    emitSpy = vitest.spyOn(eventManager, 'emit');
  });

  afterEach(() => {
    emitSpy.mockRestore();
    authManager.reset();
    setSharedLink(undefined);
  });

  it('shows Favorite to an authenticated NON-OWNER when not yet favorited by them', () => {
    const ownerId = 'owner';
    const user = userAdminFactory.build({ id: 'non-owner' });
    authManager.setPreferences(preferencesFactory.build());
    authManager.setUser(user);
    const asset = assetFactory.build({ ownerId, isFavorite: false });

    const assetActions = getAssetActions(() => '', asset);

    expect(assetActions.Favorite.$if?.()).toBe(true);
    expect(assetActions.Unfavorite.$if?.()).toBe(false);
  });

  it('shows Unfavorite to a non-owner who HAS favorited (viewer state, not owner state)', () => {
    const ownerId = 'owner';
    const user = userAdminFactory.build({ id: 'non-owner' });
    authManager.setPreferences(preferencesFactory.build());
    authManager.setUser(user);
    const asset = assetFactory.build({ ownerId, isFavorite: true });

    const assetActions = getAssetActions(() => '', asset);

    expect(assetActions.Unfavorite.$if?.()).toBe(true);
    expect(assetActions.Favorite.$if?.()).toBe(false);
  });

  it('owner behavior unchanged (regression)', () => {
    const ownerId = 'owner';
    const user = userAdminFactory.build({ id: ownerId });
    authManager.setPreferences(preferencesFactory.build());
    authManager.setUser(user);

    const notFavorited = assetFactory.build({ ownerId, isFavorite: false });
    const notFavoritedActions = getAssetActions(() => '', notFavorited);
    expect(notFavoritedActions.Favorite.$if?.()).toBe(true);
    expect(notFavoritedActions.Unfavorite.$if?.()).toBe(false);

    const favorited = assetFactory.build({ ownerId, isFavorite: true });
    const favoritedActions = getAssetActions(() => '', favorited);
    expect(favoritedActions.Favorite.$if?.()).toBe(false);
    expect(favoritedActions.Unfavorite.$if?.()).toBe(true);
  });

  it('shared-link session: neither action available (and thus the f shortcut is inert)', () => {
    const user = userAdminFactory.build();
    authManager.setPreferences(preferencesFactory.build());
    authManager.setUser(user);
    setSharedLink(sharedLinkFactory.build());

    const notFavorited = assetFactory.build({ ownerId: user.id, isFavorite: false });
    const notFavoritedActions = getAssetActions(() => '', notFavorited);
    expect(notFavoritedActions.Favorite.$if?.()).toBe(false);
    expect(notFavoritedActions.Unfavorite.$if?.()).toBe(false);

    const favorited = assetFactory.build({ ownerId: user.id, isFavorite: true });
    const favoritedActions = getAssetActions(() => '', favorited);
    expect(favoritedActions.Favorite.$if?.()).toBe(false);
    expect(favoritedActions.Unfavorite.$if?.()).toBe(false);
  });

  it('handleFavorite calls the canonical endpoint and emits a flipped AssetUpdate', async () => {
    const $t = vitest.fn().mockReturnValue('formatter');
    vitest.mocked(getFormatter).mockResolvedValue($t);
    vitest.mocked(updateAssetFavorites).mockResolvedValue(undefined as never);

    const ownerId = 'owner';
    const user = userAdminFactory.build({ id: 'non-owner' });
    authManager.setPreferences(preferencesFactory.build());
    authManager.setUser(user);
    const asset = assetFactory.build({ id: 'asset-1', ownerId, isFavorite: false });

    const assetActions = getAssetActions(() => '', asset);
    await assetActions.Favorite.onAction(assetActions.Favorite);

    expect(updateAssetFavorites).toHaveBeenCalledWith({
      assetFavoriteUpdateDto: { ids: [asset.id], isFavorite: true },
    });
    expect(emitSpy).toHaveBeenCalledWith('AssetUpdate', expect.objectContaining({ id: asset.id, isFavorite: true }));
    expect(updateAsset).not.toHaveBeenCalled();
  });

  it('handleUnfavorite mirrors with isFavorite: false', async () => {
    const $t = vitest.fn().mockReturnValue('formatter');
    vitest.mocked(getFormatter).mockResolvedValue($t);
    vitest.mocked(updateAssetFavorites).mockResolvedValue(undefined as never);

    const ownerId = 'owner';
    const user = userAdminFactory.build({ id: 'non-owner' });
    authManager.setPreferences(preferencesFactory.build());
    authManager.setUser(user);
    const asset = assetFactory.build({ id: 'asset-1', ownerId, isFavorite: true });

    const assetActions = getAssetActions(() => '', asset);
    await assetActions.Unfavorite.onAction(assetActions.Unfavorite);

    expect(updateAssetFavorites).toHaveBeenCalledWith({
      assetFavoriteUpdateDto: { ids: [asset.id], isFavorite: false },
    });
    expect(emitSpy).toHaveBeenCalledWith('AssetUpdate', expect.objectContaining({ id: asset.id, isFavorite: false }));
    expect(updateAsset).not.toHaveBeenCalled();
  });

  it('on endpoint error, no AssetUpdate is emitted (state untouched)', async () => {
    const $t = vitest.fn().mockReturnValue('formatter');
    vitest.mocked(getFormatter).mockResolvedValue($t);
    vitest.mocked(updateAssetFavorites).mockRejectedValue(new Error('network error'));

    const ownerId = 'owner';
    const user = userAdminFactory.build({ id: 'non-owner' });
    authManager.setPreferences(preferencesFactory.build());
    authManager.setUser(user);
    const asset = assetFactory.build({ id: 'asset-1', ownerId, isFavorite: false });

    const assetActions = getAssetActions(() => '', asset);
    await assetActions.Favorite.onAction(assetActions.Favorite);

    expect(emitSpy).not.toHaveBeenCalledWith('AssetUpdate', expect.anything());
  });
});
