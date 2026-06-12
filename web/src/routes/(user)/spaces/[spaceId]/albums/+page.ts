import { getMembers, getSharedSpaceAlbums, getSpace } from '@immich/sdk';
import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

export const load = (async ({ url, params }) => {
  await authenticate(url);
  const [space, members, albums] = await Promise.all([
    getSpace({ id: params.spaceId }),
    getMembers({ id: params.spaceId }),
    getSharedSpaceAlbums({ id: params.spaceId }),
  ]);
  return { space, members, albums, meta: { title: `${space.name} - Albums` } };
}) satisfies PageLoad;
