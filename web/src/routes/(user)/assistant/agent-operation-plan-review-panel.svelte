<script lang="ts">
  import { websocketEvents, type AgentSessionClientEvent } from '$lib/stores/websocket';
  import { handleError } from '$lib/utils/handle-error';
  import {
    AgentOperationPlanStatus,
    applyApprovedOperations,
    getCurrentOperationPlan,
    type AgentOperationPlanResponseDto,
    type AgentSessionResponseDto,
  } from '@immich/sdk';
  import { Button } from '@immich/ui';
  import { onDestroy, onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import {
    buildGroupEnabledState,
    buildOperationReviewModel,
    buildSelectionPayload,
    createInitialOperationEnabledState,
    type AgentOperationSelectionPayload,
    type OperationEnabledState,
    type OperationReviewGroup,
  } from './agent-operation-plan-ui';

  interface Props {
    session: AgentSessionResponseDto;
    onSelectionChange?: (payload: AgentOperationSelectionPayload) => void;
  }

  let { session, onSelectionChange }: Props = $props();

  let plan = $state<AgentOperationPlanResponseDto | null>(null);
  let enabledByOperationId = $state<OperationEnabledState>({});
  let loading = $state(true);
  let errorMessage = $state<string | null>(null);
  let applying = $state(false);
  let applyMessage = $state<string | null>(null);
  let applyErrorMessage = $state<string | null>(null);
  let locallyApplyingPlanId = $state<string | null>(null);
  let cleanupWebsocketListener: (() => void) | undefined;
  let loadSequence = 0;
  let destroyed = false;

  const model = $derived(plan ? buildOperationReviewModel(plan, enabledByOperationId) : null);
  const selectedOperationIds = $derived(model ? buildSelectionPayload(model).operationIds : []);
  const canChangeSelection = $derived(
    model !== null && model.plan.status === AgentOperationPlanStatus.Proposed && !applying,
  );
  const canApply = $derived(
    canChangeSelection && selectedOperationIds.length > 0,
  );

  const publishSelection = (
    nextPlan: AgentOperationPlanResponseDto,
    nextEnabledByOperationId: OperationEnabledState,
  ) => {
    if (destroyed) {
      return;
    }

    onSelectionChange?.(buildSelectionPayload(buildOperationReviewModel(nextPlan, nextEnabledByOperationId)));
  };

  const getGroupSelectionState = (group: OperationReviewGroup) => {
    const enabledOperationCount = group.operations.filter((operation) => operation.enabled).length;

    return {
      checked: enabledOperationCount === group.operations.length,
      mixed: enabledOperationCount > 0 && enabledOperationCount < group.operations.length,
    };
  };

  const setMixedCheckbox = (node: HTMLInputElement, state: { checked: boolean; mixed: boolean }) => {
    const update = ({ checked, mixed }: { checked: boolean; mixed: boolean }) => {
      node.indeterminate = mixed;
      node.setAttribute('aria-checked', mixed ? 'mixed' : String(checked));
    };

    update(state);

    return { update };
  };

  const loadPlan = async () => {
    const sequence = ++loadSequence;
    loading = true;
    errorMessage = null;
    applyMessage = null;
    applyErrorMessage = null;

    try {
      const nextPlan = await getCurrentOperationPlan({ id: session.id });
      if (destroyed || sequence !== loadSequence) {
        return;
      }

      const nextEnabledByOperationId = nextPlan ? createInitialOperationEnabledState(nextPlan) : {};
      plan = nextPlan;
      enabledByOperationId = nextEnabledByOperationId;

      if (nextPlan) {
        publishSelection(nextPlan, nextEnabledByOperationId);
      }
    } catch (error) {
      if (destroyed || sequence !== loadSequence) {
        return;
      }

      errorMessage = $t('assistant_operation_plan_error');
      handleError(error, errorMessage);
    } finally {
      if (!destroyed && sequence === loadSequence) {
        loading = false;
      }
    }
  };

  const handleSessionEvent = (event: AgentSessionClientEvent) => {
    if (
      (event.type !== 'operation-plan-ready' && event.type !== 'operation-plan-applied') ||
      event.sessionId !== session.id
    ) {
      return;
    }

    if (
      event.type === 'operation-plan-applied' &&
      model?.plan.id === event.planId &&
      (model.plan.status === AgentOperationPlanStatus.Applied || locallyApplyingPlanId === event.planId)
    ) {
      return;
    }

    void loadPlan();
  };

  const applySelectedOperations = async () => {
    if (!model || !canApply) {
      return;
    }

    const applyingPlanId = model.plan.id;
    applying = true;
    locallyApplyingPlanId = applyingPlanId;
    errorMessage = null;
    applyMessage = null;
    applyErrorMessage = null;

    try {
      const response = await applyApprovedOperations({
        id: session.id,
        planId: applyingPlanId,
        agentOperationPlanApplyRequestDto: { operationIds: selectedOperationIds },
      });
      plan = response.plan;
      enabledByOperationId = createInitialOperationEnabledState(response.plan);
      applyMessage = $t('assistant_operation_apply_success', {
        values: {
          applied: response.appliedOperationIds.length,
          failed: response.failedOperationIds.length,
        },
      });
    } catch (error) {
      applyErrorMessage = $t('assistant_operation_apply_error');
      handleError(error, applyErrorMessage);
    } finally {
      applying = false;
      locallyApplyingPlanId = null;
    }
  };

  const toggleOperation = (operationId: string, checked: boolean) => {
    if (!plan || !canChangeSelection) {
      return;
    }

    const nextEnabledByOperationId = { ...enabledByOperationId, [operationId]: checked };
    enabledByOperationId = nextEnabledByOperationId;
    publishSelection(plan, nextEnabledByOperationId);
  };

  const toggleGroup = (group: OperationReviewGroup, checked: boolean) => {
    if (!plan || !canChangeSelection) {
      return;
    }

    const nextEnabledByOperationId = buildGroupEnabledState(enabledByOperationId, group, checked);
    enabledByOperationId = nextEnabledByOperationId;
    publishSelection(plan, nextEnabledByOperationId);
  };

  onMount(() => {
    cleanupWebsocketListener = websocketEvents.on('on_agent_session_event', handleSessionEvent);
    void loadPlan();
  });

  onDestroy(() => {
    destroyed = true;
    loadSequence += 1;
    cleanupWebsocketListener?.();
  });
</script>

{#if loading && !model}
  <section class="mx-auto w-full max-w-3xl px-4 pb-10 text-sm text-gray-500 md:px-8">
    {$t('assistant_operation_plan_loading')}
  </section>
{:else if errorMessage && !model}
  <section class="mx-auto w-full max-w-3xl px-4 pb-10 md:px-8">
    <div
      class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      role="alert"
    >
      {errorMessage}
    </div>
  </section>
{:else if !model}
  <section class="mx-auto w-full max-w-3xl px-4 pb-10 text-sm text-gray-500 md:px-8">
    {$t('assistant_operation_plan_empty')}
  </section>
{:else}
  <section
    class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-10 text-black dark:text-white md:px-8"
    aria-labelledby="assistant-operation-plan-title"
  >
    <div class="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-immich-dark-gray">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="assistant-operation-plan-title" class="text-lg font-semibold">
            {$t('assistant_operation_plan_review')}
          </h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{model.plan.summary}</p>
        </div>
        <div class="text-sm font-medium text-gray-600 dark:text-gray-300">
          {$t('assistant_operation_selected_count', { values: { count: selectedOperationIds.length } })}
        </div>
      </div>

      <div class="mt-5 flex flex-col gap-4">
        {#each model.groups as group (group.id)}
          {@const groupSelectionState = getGroupSelectionState(group)}
          <section class="rounded-lg border border-gray-200 p-4 dark:border-gray-700" aria-label={group.title}>
            <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div class="flex gap-3">
                <input
                  class="mt-1 size-4"
                  type="checkbox"
                  aria-label={group.title}
                  checked={groupSelectionState.checked}
                  disabled={!canChangeSelection}
                  use:setMixedCheckbox={groupSelectionState}
                  onchange={(event) => toggleGroup(group, event.currentTarget.checked)}
                />
                <div>
                  <h3 class="font-medium">{group.title}</h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400">{group.subtitle}</p>
                </div>
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {$t('assistant_operation_asset_count', { values: { count: group.assetCount } })}
              </div>
            </div>

            <div class="mt-3 flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
              {#each group.operations as item (item.id)}
                <label class="flex gap-3 py-3">
                  <input
                    class="mt-1 size-4"
                    type="checkbox"
                    aria-label={item.operation.summary}
                    checked={item.enabled}
                    disabled={!canChangeSelection || item.blocked}
                    onchange={(event) => toggleOperation(item.id, event.currentTarget.checked)}
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block font-medium">{item.operation.summary}</span>
                    <span class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                      <span>{$t(item.typeLabelKey)}</span>
                      <span>{$t(item.riskLabelKey)}</span>
                      {#if item.assetCount > 0}
                        <span>{$t('assistant_operation_asset_count', { values: { count: item.assetCount } })}</span>
                      {/if}
                    </span>
                    {#if item.blocked}
                      <span class="mt-1 block text-sm text-amber-700 dark:text-amber-300">
                        {$t('assistant_operation_blocked_by', { values: { dependencies: item.blockedBy.join(', ') } })}
                      </span>
                    {/if}
                  </span>
                </label>
              {/each}
            </div>
          </section>
        {/each}
      </div>

      {#if errorMessage}
        <p
          class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          role="alert"
        >
          {errorMessage}
        </p>
      {/if}

      {#if applyErrorMessage}
        <p
          class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          role="alert"
        >
          {applyErrorMessage}
        </p>
      {/if}

      {#if applyMessage}
        <p
          class="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
          role="status"
        >
          {applyMessage}
        </p>
      {/if}

      <div class="mt-5">
        <Button type="button" disabled={!canApply} onclick={applySelectedOperations}>
          {applying
            ? $t('assistant_operation_apply_applying')
            : $t('assistant_operation_apply_selected', { values: { count: selectedOperationIds.length } })}
        </Button>
      </div>
    </div>
  </section>
{/if}
