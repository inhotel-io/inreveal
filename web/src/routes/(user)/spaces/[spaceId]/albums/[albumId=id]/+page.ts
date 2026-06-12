import { getAlbumInfo, getMembers, getSharedSpaceAlbums, getSpace } from '@immich/sdk';
import { redirect } from '@sveltejs/kit';
import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

export const load = (async ({ url, params }) => {
  await authenticate(url);
  const [space, members, albums] = await Promise.all([
    getSpace({ id: params.spaceId }),
    getMembers({ id: params.spaceId }),
    getSharedSpaceAlbums({ id: params.spaceId }),
  ]);
  const linked = albums.find((a) => a.albumId === params.albumId);
  if (!linked) {
    redirect(302, `/spaces/${params.spaceId}/albums`);
  }
  const album = await getAlbumInfo({ id: params.albumId });
  return { space, members, album, meta: { title: album.albumName } };
}) satisfies PageLoad;
