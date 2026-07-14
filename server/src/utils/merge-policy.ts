import { ConflictException, ForbiddenException } from '@nestjs/common';
import { IdentityMergePropagationPlan, MergeAuthorizer } from 'src/services/identity-merge-propagation.service';

/**
 * Machine-readable error codes for the cross-owner merge boundary (issue #733). Returned in the exception body
 * so the web client can render descriptive UX (an enable hint, or a strong confirmation) instead of echoing a
 * raw server string at the user.
 */
export const CROSS_OWNER_MERGE_ERROR_CODE = {
  /** The merge would combine two of another user's people and the instance toggle is off. */
  blocked: 'cross_owner_merge_blocked',
  /** The toggle is on: the merge is permitted, but must be explicitly confirmed before it commits. */
  confirmationRequired: 'cross_owner_merge_confirmation_required',
  /**
   * The merge would combine two people in a shared space the actor cannot edit. This is refused outright — a
   * space carries its own owner/editor/viewer model, and the instance-wide cross-owner toggle does not override
   * it. Unlike `blocked`, no toggle can enable this; the actor must ask a space editor.
   */
  blockedSpace: 'cross_owner_merge_blocked_space',
} as const;

/**
 * The one cross-owner merge policy, applied by every merge entry point (issue #733).
 *
 * Merging identities reaches into other users' libraries in two very different ways, and only one of them is
 * destructive:
 *
 * - **Re-point**: another owner holds a single person on the identity set, and it is simply re-pointed at the
 *   surviving identity. Their row keeps its name, faces and thumbnail. The recognition job already does this
 *   unattended every time it fuses identities across libraries, so gating it manually would be theatre.
 *
 * - **Collapse**: another owner holds people on BOTH identities, so committing the merge merges two of *their*
 *   people — one row deleted, its faces moved. Irreversible, and done to someone who never asked. The automatic
 *   paths explicitly refuse to do this.
 *
 * Only the collapse is gated: it needs the instance toggle AND an explicit acknowledgement from the user.
 */
/**
 * Refuse a merge whose fan-out would collapse two profiles in a shared space the actor cannot edit (issue #733
 * follow-up). Merging a space's people is an editor-only action; a merge must not reach the same destructive
 * result through propagation just because the actor happens to own personal people on the same identities. This
 * is toggle-independent on purpose — a space's roles are not something an instance-wide switch may override.
 */
export const assertSpaceCollapseAllowed = (
  plan: Pick<IdentityMergePropagationPlan, 'unrepairableSpaceCollapseIds'>,
): void => {
  if (plan.unrepairableSpaceCollapseIds.length === 0) {
    return;
  }

  throw new ForbiddenException({
    code: CROSS_OWNER_MERGE_ERROR_CODE.blockedSpace,
    message:
      'This merge would regroup people in a shared space you do not have permission to edit. Ask a space editor to merge them.',
  });
};

export const assertCrossOwnerCollapseAllowed = (
  plan: Pick<IdentityMergePropagationPlan, 'collapsedOwnerIds'>,
  input: { enabled: boolean; confirmCrossOwner?: boolean },
): void => {
  if (plan.collapsedOwnerIds.length === 0) {
    return;
  }

  if (!input.enabled) {
    throw new ForbiddenException({
      code: CROSS_OWNER_MERGE_ERROR_CODE.blocked,
      message:
        'This merge would combine two people that belong to another user, which cannot be undone. An administrator can enable cross-owner merges in the server settings.',
    });
  }

  if (!input.confirmCrossOwner) {
    throw new ConflictException({
      code: CROSS_OWNER_MERGE_ERROR_CODE.confirmationRequired,
      message:
        'This merge will combine two people that belong to another user, and cannot be undone. Confirm to continue.',
      impactedOwnerCount: plan.collapsedOwnerIds.length,
    });
  }
};

/**
 * Builds the authorizer every merge entry point hands to the planner. The instance config is read lazily — only
 * a plan that would actually destroy another owner's data needs the toggle, so an ordinary merge costs no
 * config lookup.
 */
export const createCrossOwnerMergeAuthorizer = (
  getServerConfig: () => Promise<{ mergePeopleAcrossOwners: boolean }>,
  dto: { confirmCrossOwner?: boolean },
): MergeAuthorizer => {
  return async (plan) => {
    // Toggle-independent, and checked first: a space collapse the actor cannot authorize is the most
    // restrictive outcome, so it short-circuits before any config read.
    assertSpaceCollapseAllowed(plan);

    if (plan.collapsedOwnerIds.length === 0) {
      return;
    }

    const server = await getServerConfig();
    assertCrossOwnerCollapseAllowed(plan, {
      enabled: server.mergePeopleAcrossOwners,
      confirmCrossOwner: dto.confirmCrossOwner,
    });
  };
};
