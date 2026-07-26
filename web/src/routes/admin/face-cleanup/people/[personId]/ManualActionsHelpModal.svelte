<script lang="ts">
  import { Button, Icon, Modal, ModalBody, ModalFooter } from '@immich/ui';
  import { mdiInformationOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { MANUAL_STATE_COLOR, MANUAL_STATE_ICON } from './manual-review.svelte';

  // Manual's OWN help modal (design §6.4 "Reused"/"New" — "manual's action set is different (no owner, no
  // stay; plus keep and Unmark), so it gets its own modal"). Guided's ActionsHelpModal and its "names all six
  // actions" test are LOAD-BEARING and are left untouched — this is a deliberate fork, not a shared component,
  // for the same reason manual-review.svelte.ts forks review.svelte.ts (§6.5: the two modes' state machines
  // are genuinely different, not a superset/subset of each other).
  //
  // THE VISUAL INVERSION (§6.4) drives this modal's structure too: `keep` is the default and writes nothing, so
  // — unlike every action here — it renders with NO colour swatch, signalled by absence, exactly like an
  // untouched tile carries no badge or ribbon. `unmark` returns a face to that same `keep` state, so it gets the
  // same no-swatch treatment: there is no "unmark" tile state for a swatch to represent.
  type Props = { onClose: () => void };
  const { onClose }: Props = $props();

  // One row per action, in the same order the bulk bar renders its buttons (Keep prepended, since it explains
  // the default rather than a button). `color`/`icon` are populated straight FROM MANUAL_STATE_COLOR/ICON — the
  // same tokens the tile badge and bulk-bar button use — so a swatch can never drift from the tile it explains
  // (guided's stated rationale for its own modal, kept true here). Keep and Unmark leave both undefined: neither
  // corresponds to a coloured tile state, so there is nothing for a swatch to match.
  // Every row carries the SAME shape (`color`/`icon` explicitly `undefined` where there is no tile state to
  // match) rather than omitting the keys on some rows — a uniform shape keeps `action.color`/`action.icon`
  // well-typed across the `{#each}` union instead of only existing on some branches.
  const ACTIONS = [
    {
      id: 'keep',
      nameKey: 'admin.face_cleanup_manual_review_help_keep_name',
      bodyKey: 'admin.face_cleanup_manual_review_help_keep_body',
      effectKey: 'admin.face_cleanup_manual_review_help_keep_effect',
      color: undefined,
      icon: undefined,
    },
    {
      id: 'move',
      nameKey: 'admin.face_cleanup_manual_review_bulk_move',
      bodyKey: 'admin.face_cleanup_manual_review_help_move_body',
      effectKey: 'admin.face_cleanup_manual_review_help_move_effect',
      color: MANUAL_STATE_COLOR.move,
      icon: MANUAL_STATE_ICON.move,
    },
    {
      id: 'lock',
      nameKey: 'admin.face_cleanup_manual_review_bulk_lock',
      bodyKey: 'admin.face_cleanup_manual_review_help_lock_body',
      // Reused verbatim — the lock mechanism (an owner-agnostic identity link that survives a merge) is
      // identical in both modes, and guided's effect copy names no guided-only concept.
      effectKey: 'admin.face_cleanup_review_help_lock_effect',
      color: MANUAL_STATE_COLOR.lock,
      icon: MANUAL_STATE_ICON.lock,
    },
    {
      id: 'unknown',
      nameKey: 'admin.face_cleanup_manual_review_bulk_unknown',
      // Reused verbatim — "a real face, not this person, and you don't know whose it is" is exactly the same
      // case and the same server behaviour (parked in a fresh locked cluster) in both modes.
      bodyKey: 'admin.face_cleanup_review_help_unknown_body',
      effectKey: 'admin.face_cleanup_review_help_unknown_effect',
      color: MANUAL_STATE_COLOR.unknown,
      icon: MANUAL_STATE_ICON.unknown,
    },
    {
      id: 'detach',
      // Manual reuses guided's own "Not a face" bulk-bar key on the review page itself, so reusing it here too
      // keeps the modal's heading identical to the button it explains.
      nameKey: 'admin.face_cleanup_review_bulk_detach',
      // Reused verbatim — irreversibility, and pointing at Unknown as the opposite case, are exactly the same
      // warning in both modes.
      bodyKey: 'admin.face_cleanup_review_help_detach_body',
      effectKey: 'admin.face_cleanup_review_help_detach_effect',
      color: MANUAL_STATE_COLOR.detach,
      icon: MANUAL_STATE_ICON.detach,
    },
    {
      id: 'unmark',
      nameKey: 'admin.face_cleanup_manual_review_bulk_unmark',
      bodyKey: 'admin.face_cleanup_manual_review_help_unmark_body',
      effectKey: 'admin.face_cleanup_manual_review_help_unmark_effect',
      color: undefined,
      icon: undefined,
    },
  ] as const;
</script>

<Modal title={$t('admin.face_cleanup_review_help_title')} icon={mdiInformationOutline} {onClose} size="medium">
  <ModalBody>
    <p class="text-sm/relaxed text-gray-600 dark:text-gray-300">
      {$t('admin.face_cleanup_manual_review_help_intro')}
    </p>

    <div class="mt-2 flex flex-col" data-testid="manual-help-actions">
      {#each ACTIONS as action (action.id)}
        <div
          class="flex gap-3.5 border-b border-gray-200 py-4 last:border-b-0 dark:border-gray-700"
          data-testid={`manual-help-row-${action.id}`}
        >
          {#if action.color}
            <span
              class="w-[3px] flex-none rounded-full"
              style="background: {action.color}"
              data-testid="manual-help-swatch"
              data-action={action.id}
            ></span>
          {:else}
            <!-- No colour swatch — signalled by absence (§6.4), mirroring the tile: `keep` never carries a
                 badge/ribbon, and `unmark` only ever returns a face to that same uncoloured state. -->
            <span class="w-[3px] flex-none rounded-full" data-testid="manual-help-no-swatch" data-action={action.id}
            ></span>
          {/if}
          <div>
            <h3 class="flex items-center gap-2 text-sm font-bold">
              {#if action.color && action.icon}
                <Icon icon={action.icon} size="15" color={action.color} />
              {/if}
              {$t(action.nameKey)}
              {#if action.id === 'keep'}
                <span
                  class="text-xs font-normal text-gray-400 dark:text-gray-500"
                  data-testid="manual-help-keep-default"
                >
                  ({$t('admin.face_cleanup_manual_review_help_default_badge')})
                </span>
              {/if}
            </h3>
            <p class="mt-1.5 text-sm/relaxed">
              {$t(action.bodyKey)}
            </p>
            <p
              class="mt-2 border-l-2 border-gray-200 pl-3 text-sm/relaxed text-gray-500 dark:border-gray-700 dark:text-gray-400"
              data-testid="help-effect"
            >
              <b class="font-bold text-gray-700 dark:text-gray-200">
                {$t('admin.face_cleanup_review_help_effect_label')}
              </b>
              {$t(action.effectKey)}
            </p>
          </div>
        </div>
      {/each}
    </div>

    <p class="mt-4 text-xs/relaxed text-gray-500 dark:text-gray-400" data-testid="help-footer">
      {$t('admin.face_cleanup_manual_review_help_footer')}
    </p>
  </ModalBody>

  <ModalFooter>
    <Button shape="round" fullWidth onclick={onClose} data-testid="help-close">{$t('close')}</Button>
  </ModalFooter>
</Modal>
