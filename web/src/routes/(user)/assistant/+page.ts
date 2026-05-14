import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import { getAgentRunnerStatus } from '@immich/sdk';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  const $t = await getFormatter();

  return {
    meta: {
      title: $t('assistant'),
    },
    runnerStatus: await getAgentRunnerStatus(),
  };
}) satisfies PageLoad;
