import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import { getAgentProviderCredentials, getAgentRunnerStatus } from '@immich/sdk';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  const $t = await getFormatter();
  const [runnerStatus, credentials] = await Promise.all([getAgentRunnerStatus(), getAgentProviderCredentials()]);

  return {
    meta: {
      title: $t('assistant'),
    },
    runnerStatus,
    credentials,
  };
}) satisfies PageLoad;
