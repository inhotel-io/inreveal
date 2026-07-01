import { getServerErrorMessage } from '$lib/utils/handle-error';
import { isHttpError, mergeScopedPeople, type MergeScopedPeopleDto } from '@immich/sdk';

/**
 * Machine-readable error codes returned by the server when a scoped people-merge crosses an owner
 * boundary (issue #733). Mirrors `CROSS_OWNER_MERGE_ERROR_CODE` in the server's person service.
 */
export const CrossOwnerMergeErrorCode = {
  /** The merge is not permitted (non-admin, or admin with the instance toggle off). */
  Blocked: 'cross_owner_merge_blocked',
  /** Admin with the toggle on: the merge is permitted but must be explicitly confirmed first. */
  ConfirmationRequired: 'cross_owner_merge_confirmation_required',
} as const;

/** Read the machine-readable cross-owner merge error code from a thrown SDK error, if present. */
export const getCrossOwnerMergeErrorCode = (error: unknown): string | undefined =>
  isHttpError(error) ? (error.data as { code?: string } | undefined)?.code : undefined;

export interface CrossOwnerMergeHandlers {
  /** Ask the admin to confirm a cross-owner merge. Resolves true to proceed. */
  confirmCrossOwner: () => Promise<boolean>;
  /** Surface the server's descriptive "blocked" message (never the raw truncated string). */
  onBlocked: (message: string | undefined) => void;
}

/**
 * Run a scoped people-merge, transparently handling the admin-gated cross-owner boundary
 * (issue #733):
 * - a `blocked` response invokes `onBlocked` with the server's descriptive message;
 * - a `confirmationRequired` response asks `confirmCrossOwner`, and — only if accepted — re-runs the
 *   merge with the admin acknowledgement so the server commits it.
 *
 * Returns `true` when the merge committed, `false` when it was blocked or the admin declined. Any
 * other error propagates to the caller.
 */
export const runScopedMergeWithCrossOwnerConfirmation = async (
  mergeScopedPeopleDto: MergeScopedPeopleDto,
  handlers: CrossOwnerMergeHandlers,
): Promise<boolean> => {
  try {
    await mergeScopedPeople({ mergeScopedPeopleDto });
    return true;
  } catch (error) {
    const code = getCrossOwnerMergeErrorCode(error);

    if (code === CrossOwnerMergeErrorCode.Blocked) {
      handlers.onBlocked(getServerErrorMessage(error));
      return false;
    }

    if (code !== CrossOwnerMergeErrorCode.ConfirmationRequired) {
      throw error;
    }

    if (!(await handlers.confirmCrossOwner())) {
      return false;
    }

    await mergeScopedPeople({ mergeScopedPeopleDto: { ...mergeScopedPeopleDto, confirmCrossOwner: true } });
    return true;
  }
};
