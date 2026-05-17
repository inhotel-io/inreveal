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
  import { onDestroy, onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import AgentPlanEvidenceLedger from './agent-plan-evidence-ledger.svelte';
  import {
    buildGroupEnabledState,
    buildOperationReviewImpactSummary,
    buildOperationReviewModel,
    buildSelectionPayload,
    buildOperationItemSelectionState,
    createInitialOperationFieldOverrideState,
    createInitialOperationEnabledState,
    createInitialOperationItemSelectionState,
    resetOperationFieldOverride,
    resetOperationItemSelection,
    setOperationFieldOverride,
    toAgentOperationItemSelections,
    type AgentOperationSelectionPayload,
    type OperationEnabledState,
    type OperationFieldOverrideState,
    type OperationItemSelectionState,
    type OperationReviewGroup,
  } from './agent-operation-plan-ui';
  import { applyAgentPlanBulkItemSelection, setAgentPlanOnlyItemSelection } from './agent-plan-large-item-review-ui';

  interface Props {
    session: AgentSessionResponseDto;
    onSelectionChange?: (payload: AgentOperationSelectionPayload) => void;
    variant?: 'standalone' | 'dock';
    hideEmpty?: boolean;
  }

  let { session, onSelectionChange, variant = 'standalone', hideEmpty = false }: Props = $props();

  let plan = $state<AgentOperationPlanResponseDto | null>(null);
  let enabledByOperationId = $state<OperationEnabledState>({});
  let itemSelectionByOperationId = $state<OperationItemSelectionState>({});
  let fieldOverrideByOperationId = $state<OperationFieldOverrideState>({});
  let loading = $state(true);
  let errorMessage = $state<string | null>(null);
  let applying = $state(false);
  let applyMessage = $state<string | null>(null);
  let applyErrorMessage = $state<string | null>(null);
  let planExpanded = $state(true);
  let locallyApplyingPlanId = $state<string | null>(null);
  let pendingLocalApplyEvent = $state<Extract<AgentSessionClientEvent, { type: 'operation-plan-applied' }> | null>(
    null,
  );
  let cleanupWebsocketListener: (() => void) | undefined;
  let loadSequence = 0;
  let destroyed = false;

  const model = $derived(
    plan
      ? buildOperationReviewModel(plan, enabledByOperationId, itemSelectionByOperationId, fieldOverrideByOperationId)
      : null,
  );
  const selectionPayload = $derived(model ? buildSelectionPayload(model) : null);
  const selectedOperationIds = $derived(selectionPayload?.operationIds ?? []);
  const canChangeSelection = $derived(
    model !== null && model.plan.status === AgentOperationPlanStatus.Proposed && !applying,
  );
  const canApply = $derived(canChangeSelection && selectedOperationIds.length > 0 && model.fieldErrors.length === 0);
  const rootClass = $derived(
    variant === 'dock'
      ? 'flex w-full flex-col gap-3 text-black dark:text-white'
      : 'mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-10 text-black dark:text-white md:px-8',
  );
  const passiveRootClass = $derived(
    variant === 'dock'
      ? 'w-full text-sm text-gray-500'
      : 'mx-auto w-full max-w-3xl px-4 pb-10 text-sm text-gray-500 md:px-8',
  );
  const passivePaddedRootClass = $derived(
    variant === 'dock' ? 'w-full text-sm' : 'mx-auto w-full max-w-3xl px-4 pb-10 text-sm md:px-8',
  );
  const cardClass = $derived(
    variant === 'dock'
      ? 'rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-immich-dark-gray'
      : 'rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-immich-dark-gray',
  );
  const headerClass = $derived(variant === 'dock' ? 'flex cursor-pointer list-none flex-col gap-2 p-4' : 'list-none');

  const buildPublishedSelectionPayload = (
    nextPlan: AgentOperationPlanResponseDto,
    nextEnabledByOperationId: OperationEnabledState,
    nextItemSelectionByOperationId: OperationItemSelectionState,
    nextFieldOverrideByOperationId: OperationFieldOverrideState,
  ) => {
    const nextPayload = buildSelectionPayload(
      buildOperationReviewModel(
        nextPlan,
        nextEnabledByOperationId,
        nextItemSelectionByOperationId,
        nextFieldOverrideByOperationId,
      ),
    );
    const fieldOverrides = Object.fromEntries(
      Object.entries(nextFieldOverrideByOperationId).filter(([, fields]) => Object.keys(fields).length > 0),
    );

    return Object.keys(fieldOverrides).length > 0 ? { ...nextPayload, fieldOverrides } : nextPayload;
  };

  const publishSelection = (
    nextPlan: AgentOperationPlanResponseDto,
    nextEnabledByOperationId: OperationEnabledState,
    nextItemSelectionByOperationId: OperationItemSelectionState,
    nextFieldOverrideByOperationId: OperationFieldOverrideState,
  ) => {
    if (destroyed) {
      return;
    }

    onSelectionChange?.(
      buildPublishedSelectionPayload(
        nextPlan,
        nextEnabledByOperationId,
        nextItemSelectionByOperationId,
        nextFieldOverrideByOperationId,
      ),
    );
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
      const nextItemSelectionByOperationId = nextPlan ? createInitialOperationItemSelectionState(nextPlan) : {};
      const nextFieldOverrideByOperationId = nextPlan ? createInitialOperationFieldOverrideState(nextPlan) : {};
      plan = nextPlan;
      enabledByOperationId = nextEnabledByOperationId;
      itemSelectionByOperationId = nextItemSelectionByOperationId;
      fieldOverrideByOperationId = nextFieldOverrideByOperationId;
      planExpanded = true;

      if (nextPlan) {
        publishSelection(
          nextPlan,
          nextEnabledByOperationId,
          nextItemSelectionByOperationId,
          nextFieldOverrideByOperationId,
        );
      }
    } catch (error) {
      if (destroyed || sequence !== loadSequence) {
        return;
      }

      errorMessage = $t('assistant_operation_plan_error');
      planExpanded = true;
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
      model.plan.status === AgentOperationPlanStatus.Applied
    ) {
      return;
    }

    if (event.type === 'operation-plan-applied' && locallyApplyingPlanId === event.planId) {
      pendingLocalApplyEvent = event;
      return;
    }

    void loadPlan();
  };

  const applySelectedOperations = async () => {
    if (!model || !canApply || !selectionPayload) {
      return;
    }

    const applyingPlanId = model.plan.id;
    applying = true;
    locallyApplyingPlanId = applyingPlanId;
    errorMessage = null;
    applyMessage = null;
    applyErrorMessage = null;

    try {
      const itemSelections = toAgentOperationItemSelections(selectionPayload.itemSelections);
      const response = await applyApprovedOperations({
        id: session.id,
        planId: applyingPlanId,
        agentOperationPlanApplyRequestDto: {
          operationIds: selectionPayload.operationIds,
          ...(itemSelections ? { itemSelections } : {}),
          ...(selectionPayload.fieldOverrides ? { fieldOverrides: selectionPayload.fieldOverrides } : {}),
          planRevision: selectionPayload.planRevision,
        },
      });
      plan = response.plan;
      enabledByOperationId = createInitialOperationEnabledState(response.plan);
      itemSelectionByOperationId = createInitialOperationItemSelectionState(response.plan);
      fieldOverrideByOperationId = createInitialOperationFieldOverrideState(response.plan);
      publishSelection(response.plan, enabledByOperationId, itemSelectionByOperationId, fieldOverrideByOperationId);
      applyMessage = $t('assistant_operation_apply_success', {
        values: {
          applied: response.appliedOperationIds.length,
          failed: response.failedOperationIds.length,
        },
      });
    } catch (error) {
      if (pendingLocalApplyEvent?.planId === applyingPlanId) {
        await loadPlan();
        applyMessage = $t('assistant_operation_apply_success', {
          values: {
            applied: pendingLocalApplyEvent.appliedCount,
            failed: pendingLocalApplyEvent.failedCount,
          },
        });
      } else {
        applyErrorMessage = $t('assistant_operation_apply_error');
        planExpanded = true;
        handleError(error, applyErrorMessage);
      }
    } finally {
      applying = false;
      locallyApplyingPlanId = null;
      pendingLocalApplyEvent = null;
    }
  };

  const toggleOperation = (operationId: string, checked: boolean) => {
    if (!plan || !canChangeSelection) {
      return;
    }

    const nextEnabledByOperationId = { ...enabledByOperationId, [operationId]: checked };
    enabledByOperationId = nextEnabledByOperationId;
    publishSelection(plan, nextEnabledByOperationId, itemSelectionByOperationId, fieldOverrideByOperationId);
  };

  const toggleGroup = (group: OperationReviewGroup, checked: boolean) => {
    if (!plan || !canChangeSelection) {
      return;
    }

    const nextEnabledByOperationId = buildGroupEnabledState(enabledByOperationId, group, checked);
    enabledByOperationId = nextEnabledByOperationId;
    publishSelection(plan, nextEnabledByOperationId, itemSelectionByOperationId, fieldOverrideByOperationId);
  };

  const toggleItem = (operationId: string, assetId: string, selected: boolean) => {
    if (!plan || !canChangeSelection) {
      return;
    }

    const nextItemSelectionByOperationId = buildOperationItemSelectionState(
      plan,
      itemSelectionByOperationId,
      operationId,
      assetId,
      selected,
    );
    itemSelectionByOperationId = nextItemSelectionByOperationId;
    publishSelection(plan, enabledByOperationId, nextItemSelectionByOperationId, fieldOverrideByOperationId);
  };

  const resetItemSelection = (operationId: string) => {
    if (!plan || !canChangeSelection) {
      return;
    }

    const nextItemSelectionByOperationId = resetOperationItemSelection(itemSelectionByOperationId, operationId);
    itemSelectionByOperationId = nextItemSelectionByOperationId;
    publishSelection(plan, enabledByOperationId, nextItemSelectionByOperationId, fieldOverrideByOperationId);
  };

  const bulkSetItems = (operationId: string, assetIds: string[], selected: boolean) => {
    if (!plan || !canChangeSelection) {
      return;
    }

    const operation = plan.operations.find((operation) => operation.id === operationId);
    const allAssetIds = operation?.assetIds ?? [];
    const nextItemSelectionByOperationId = applyAgentPlanBulkItemSelection({
      state: itemSelectionByOperationId,
      operationId,
      allAssetIds,
      targetAssetIds: assetIds,
      selected,
    });
    itemSelectionByOperationId = nextItemSelectionByOperationId;
    publishSelection(plan, enabledByOperationId, nextItemSelectionByOperationId, fieldOverrideByOperationId);
  };

  const setOnlyItems = (operationId: string, assetIds: string[]) => {
    if (!plan || !canChangeSelection) {
      return;
    }

    const operation = plan.operations.find((operation) => operation.id === operationId);
    const allAssetIds = operation?.assetIds ?? [];
    const nextItemSelectionByOperationId = setAgentPlanOnlyItemSelection({
      state: itemSelectionByOperationId,
      operationId,
      allAssetIds,
      targetAssetIds: assetIds,
    });
    itemSelectionByOperationId = nextItemSelectionByOperationId;
    publishSelection(plan, enabledByOperationId, nextItemSelectionByOperationId, fieldOverrideByOperationId);
  };

  const setFieldOverride = (operationId: string, fieldKey: string, value: string | undefined) => {
    if (!plan || !canChangeSelection) {
      return;
    }

    const nextFieldOverrideByOperationId = setOperationFieldOverride(
      fieldOverrideByOperationId,
      operationId,
      fieldKey,
      value,
    );
    fieldOverrideByOperationId = nextFieldOverrideByOperationId;
    publishSelection(plan, enabledByOperationId, itemSelectionByOperationId, nextFieldOverrideByOperationId);
  };

  const resetFieldOverride = (operationId: string, fieldKey: string) => {
    if (!plan || !canChangeSelection) {
      return;
    }

    const nextFieldOverrideByOperationId = resetOperationFieldOverride(
      fieldOverrideByOperationId,
      operationId,
      fieldKey,
    );
    fieldOverrideByOperationId = nextFieldOverrideByOperationId;
    publishSelection(plan, enabledByOperationId, itemSelectionByOperationId, nextFieldOverrideByOperationId);
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
  <section class={passiveRootClass}>
    {$t('assistant_operation_plan_loading')}
  </section>
{:else if errorMessage && !model}
  <section class={passivePaddedRootClass}>
    <div
      class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      role="alert"
    >
      {errorMessage}
    </div>
  </section>
{:else if !model}
  {#if applyMessage || !hideEmpty}
    <section class={passivePaddedRootClass}>
      {#if applyMessage}
        <p
          class="rounded-lg border border-green-200 bg-green-50 p-3 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
          role="status"
        >
          {applyMessage}
        </p>
      {:else}
        <p class="text-gray-500">{$t('assistant_operation_plan_empty')}</p>
      {/if}
    </section>
  {/if}
{:else}
  {@const impact = buildOperationReviewImpactSummary(model)}
  <section class={rootClass} aria-label={$t('assistant_operation_plan_review')}>
    <details class={cardClass} bind:open={planExpanded}>
      <summary class={headerClass}>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-semibold">{$t('assistant_operation_plan_review')}</h2>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{model.plan.summary}</p>
            <div class="mt-2 flex flex-wrap gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span class="rounded-md bg-gray-100 px-2 py-1 dark:bg-gray-800">
                {$t('assistant_operation_plan_destination_count', { values: { count: impact.destinationCount } })}
              </span>
              <span class="rounded-md bg-gray-100 px-2 py-1 dark:bg-gray-800">
                {$t('assistant_operation_plan_selected_change_count', {
                  values: { count: impact.selectedOperationCount },
                })}
              </span>
              <span class="rounded-md bg-gray-100 px-2 py-1 dark:bg-gray-800">
                {$t('assistant_operation_plan_selected_asset_count', { values: { count: impact.selectedAssetCount } })}
              </span>
            </div>
          </div>
          <div class="flex flex-col gap-1 text-sm font-medium text-gray-600 dark:text-gray-300 sm:text-right">
            <span>{$t('assistant_operation_plan_no_destructive_changes')}</span>
            <span>{$t('assistant_operation_selected_count', { values: { count: selectedOperationIds.length } })}</span>
          </div>
        </div>
      </summary>

      {#if planExpanded}
        <div class={variant === 'dock' ? 'px-4 pb-4' : ''}>
          <AgentPlanEvidenceLedger
            {model}
            {selectedOperationIds}
            {canChangeSelection}
            {canApply}
            {applying}
            {errorMessage}
            {applyErrorMessage}
            {applyMessage}
            showHeader={false}
            onToggleGroup={toggleGroup}
            onToggleOperation={toggleOperation}
            onToggleItem={toggleItem}
            onBulkSetItems={bulkSetItems}
            onSetOnlyItems={setOnlyItems}
            onResetItemSelection={resetItemSelection}
            onSetFieldOverride={setFieldOverride}
            onResetFieldOverride={resetFieldOverride}
            onApply={applySelectedOperations}
          />
        </div>
      {/if}
    </details>
  </section>
{/if}
