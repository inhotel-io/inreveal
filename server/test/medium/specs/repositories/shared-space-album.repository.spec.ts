import { Kysely } from 'kysely';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

const setup = () => {
  const { ctx } = newMediumService(BaseService, {
    database: defaultDatabase,
    real: [],
    mock: [LoggingRepository],
  });
  return { ctx, sut: ctx.get(SharedSpaceRepository) };
};

const seedSpaceAndAlbum = async (ctx: ReturnType<typeof setup>['ctx']) => {
  const { user } = await ctx.newUser();
  const { space } = await ctx.newSharedSpace({ createdById: user.id });
  const { result: album } = await ctx.newAlbum({ ownerId: user.id, albumName: 'Test Album' });
  return { user, space, album };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe('SharedSpaceRepository — Album Link CRUD', () => {
  it('addAlbum inserts a link and is idempotent on (spaceId, albumId)', async () => {
    const { ctx, sut } = setup();
    const { space, album, user } = await seedSpaceAndAlbum(ctx);

    const first = await sut.addAlbum({ spaceId: space.id, albumId: album.id, addedById: user.id });
    expect(first).toMatchObject({ spaceId: space.id, albumId: album.id, showInTimeline: true });

    const second = await sut.addAlbum({ spaceId: space.id, albumId: album.id, addedById: user.id });
    expect(second).toBeUndefined(); // onConflict doNothing → no row returned

    const links = await sut.getLinkedAlbums(space.id);
    expect(links).toHaveLength(1);
    expect(links[0].showInTimeline).toBe(true);
  });

  it('hasAlbumLink reflects presence; removeAlbum deletes it', async () => {
    const { ctx, sut } = setup();
    const { space, album } = await seedSpaceAndAlbum(ctx);

    await sut.addAlbum({ spaceId: space.id, albumId: album.id, addedById: null });
    expect(await sut.hasAlbumLink(space.id, album.id)).toBe(true);

    await sut.removeAlbum(space.id, album.id);
    expect(await sut.hasAlbumLink(space.id, album.id)).toBe(false);
  });

  it('setAlbumShowInTimeline toggles the flag', async () => {
    const { ctx, sut } = setup();
    const { space, album } = await seedSpaceAndAlbum(ctx);

    await sut.addAlbum({ spaceId: space.id, albumId: album.id, addedById: null });
    await sut.setAlbumShowInTimeline(space.id, album.id, false);

    const links = await sut.getLinkedAlbums(space.id);
    expect(links).toHaveLength(1);
    expect(links[0].showInTimeline).toBe(false);
  });

  it('getLinkedAlbums excludes soft-deleted albums', async () => {
    const { ctx, sut } = setup();
    const { space, album } = await seedSpaceAndAlbum(ctx);

    await sut.addAlbum({ spaceId: space.id, albumId: album.id, addedById: null });
    await ctx.softDeleteAlbum(album.id);

    const links = await sut.getLinkedAlbums(space.id);
    expect(links).toHaveLength(0);
  });

  it('getSpacesLinkedToAlbum returns spaces containing the album', async () => {
    const { ctx, sut } = setup();
    const { space, album } = await seedSpaceAndAlbum(ctx);

    expect(await sut.getSpacesLinkedToAlbum(album.id)).toHaveLength(0);

    await sut.addAlbum({ spaceId: space.id, albumId: album.id, addedById: null });

    const spaces = await sut.getSpacesLinkedToAlbum(album.id);
    expect(spaces.map((s) => s.spaceId)).toContain(space.id);
  });
});
