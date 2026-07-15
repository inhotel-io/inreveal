<script lang="ts">
  import { Button, Icon, Modal, ModalBody, ModalFooter } from '@immich/ui';
  import { mdiInformationOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { STATE_COLOR, STATE_ICON, type FaceState } from './review.svelte';

  type Props = { onClose: () => void };
  const { onClose }: Props = $props();

  // The six terminal actions, in the order the bulk bar renders them. The NAME is not re-declared here — each
  // action reuses its own bulk-bar key, so a translated heading can never drift from its translated button.
  // Only the explanation (`_body`: what it means / when to use it) and the consequence (`_effect`: what it does
  // on apply) are new strings.
  // `as const` (rather than a `nameKey: string` annotation) keeps each key a string LITERAL: svelte-i18n's `$t`
  // takes the generated key union, and a widened `string` is not assignable to it.
  const ACTIONS = [
    { state: 'owner', nameKey: 'admin.face_cleanup_review_bulk_owner' },
    { state: 'stay', nameKey: 'admin.face_cleanup_review_bulk_stay' },
    { state: 'lock', nameKey: 'admin.face_cleanup_review_bulk_lock' },
    { state: 'other', nameKey: 'admin.face_cleanup_review_bulk_other' },
    { state: 'unknown', nameKey: 'admin.face_cleanup_review_bulk_unknown' },
    { state: 'detach', nameKey: 'admin.face_cleanup_review_bulk_detach' },
  ] as const satisfies readonly { state: FaceState; nameKey: string }[];
</script>

<Modal title={$t('admin.face_cleanup_review_help_title')} icon={mdiInformationOutline} {onClose} size="medium">
  <ModalBody>
    <p class="text-sm/relaxed text-gray-600 dark:text-gray-300">
      {$t('admin.face_cleanup_review_help_intro')}
    </p>

    <div class="mt-2 flex flex-col" data-testid="help-actions">
      {#each ACTIONS as action (action.state)}
        <div class="flex gap-3.5 border-b border-gray-200 py-4 last:border-b-0 dark:border-gray-700">
          <span class="w-[3px] flex-none rounded-full" style="background: {STATE_COLOR[action.state]}"></span>
          <div>
            <!-- The state's own icon, the same glyph the tile badge and bulk button carry — that's what ties an
                 explanation here back to the thing it explains out there. -->
            <h3 class="flex items-center gap-2 text-sm font-bold">
              <Icon icon={STATE_ICON[action.state]} size="15" color={STATE_COLOR[action.state]} />
              {$t(action.nameKey)}
            </h3>
            <p class="mt-1.5 text-sm/relaxed">
              {$t(`admin.face_cleanup_review_help_${action.state}_body`)}
            </p>
            <p
              class="mt-2 border-l-2 border-gray-200 pl-3 text-sm/relaxed text-gray-500 dark:border-gray-700 dark:text-gray-400"
              data-testid="help-effect"
            >
              <b class="font-bold text-gray-700 dark:text-gray-200">
                {$t('admin.face_cleanup_review_help_effect_label')}
              </b>
              {$t(`admin.face_cleanup_review_help_${action.state}_effect`)}
            </p>
          </div>
        </div>
      {/each}
    </div>

    <p class="mt-4 text-xs/relaxed text-gray-500 dark:text-gray-400" data-testid="help-footer">
      {$t('admin.face_cleanup_review_help_footer')}
    </p>
  </ModalBody>

  <ModalFooter>
    <Button shape="round" fullWidth onclick={onClose} data-testid="help-close">{$t('close')}</Button>
  </ModalFooter>
</Modal>
