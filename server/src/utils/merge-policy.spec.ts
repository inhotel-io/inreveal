import { ConflictException, ForbiddenException } from '@nestjs/common';
import { IdentityMergePropagationPlan } from 'src/services/identity-merge-propagation.service';
import {
  assertCrossOwnerCollapseAllowed,
  createCrossOwnerMergeAuthorizer,
  CROSS_OWNER_MERGE_ERROR_CODE,
} from 'src/utils/merge-policy';

const makePlan = (overrides: Partial<IdentityMergePropagationPlan> = {}): IdentityMergePropagationPlan => ({
  actorUserId: 'actor',
  origin: { type: 'person', targetProfileId: 'target', sourceProfileIds: ['source'], ownerId: 'actor' },
  targetIdentityId: 'identity-t',
  sourceIdentityIds: ['identity-s'],
  personalProfileMerges: [],
  spaceProfileMerges: [],
  profileIdentityUpdates: [],
  affectedOwnerIds: [],
  repointedOwnerIds: [],
  collapsedOwnerIds: [],
  unrepairableSpaceCollapseIds: [],
  affectedSpaceIds: [],
  followUpJobs: [],
  activityEvents: [],
  ...overrides,
});

describe('merge-policy', () => {
  describe('unrepairable space collapse (hard-block, toggle-independent)', () => {
    it('blocks a collapse in a space the actor cannot edit even when the toggle is on and the merge is confirmed', async () => {
      const authorize = createCrossOwnerMergeAuthorizer(() => Promise.resolve({ mergePeopleAcrossOwners: true }), {
        confirmCrossOwner: true,
      });

      await expect(authorize(makePlan({ unrepairableSpaceCollapseIds: ['space-1'] }))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('blocks with the space-specific code, not the cross-owner-toggle code', async () => {
      const authorize = createCrossOwnerMergeAuthorizer(() => Promise.resolve({ mergePeopleAcrossOwners: true }), {
        confirmCrossOwner: true,
      });

      await expect(authorize(makePlan({ unrepairableSpaceCollapseIds: ['space-1'] }))).rejects.toMatchObject({
        response: { code: CROSS_OWNER_MERGE_ERROR_CODE.blockedSpace },
      });
    });

    it('takes precedence over a same-plan personal cross-owner collapse (most restrictive wins)', async () => {
      const getServerConfig = vi.fn(() => Promise.resolve({ mergePeopleAcrossOwners: true }));
      const authorize = createCrossOwnerMergeAuthorizer(getServerConfig, { confirmCrossOwner: true });

      await expect(
        authorize(makePlan({ unrepairableSpaceCollapseIds: ['space-1'], collapsedOwnerIds: ['owner-b'] })),
      ).rejects.toMatchObject({ response: { code: CROSS_OWNER_MERGE_ERROR_CODE.blockedSpace } });
      // The space hard-block short-circuits before the config is ever read.
      expect(getServerConfig).not.toHaveBeenCalled();
    });

    it('does not fire for a repairable-space collapse (empty set)', async () => {
      const authorize = createCrossOwnerMergeAuthorizer(() => Promise.resolve({ mergePeopleAcrossOwners: true }), {});

      await expect(authorize(makePlan({ unrepairableSpaceCollapseIds: [] }))).resolves.toBeUndefined();
    });
  });

  describe('personal cross-owner collapse gate (unchanged)', () => {
    it('allows a plan with no cross-owner collapse without reading the config', async () => {
      const getServerConfig = vi.fn(() => Promise.resolve({ mergePeopleAcrossOwners: false }));
      const authorize = createCrossOwnerMergeAuthorizer(getServerConfig, {});

      await expect(authorize(makePlan())).resolves.toBeUndefined();
      expect(getServerConfig).not.toHaveBeenCalled();
    });

    it('blocks a cross-owner collapse when the toggle is off', () => {
      expect(() =>
        assertCrossOwnerCollapseAllowed(makePlan({ collapsedOwnerIds: ['owner-b'] }), {
          enabled: false,
        }),
      ).toThrow(ForbiddenException);
    });

    it('still blocks when the toggle is off even if the client self-asserts confirmCrossOwner (the toggle is the boundary)', async () => {
      const getServerConfig = vi.fn(() => Promise.resolve({ mergePeopleAcrossOwners: false }));
      const authorize = createCrossOwnerMergeAuthorizer(getServerConfig, { confirmCrossOwner: true });

      await expect(authorize(makePlan({ collapsedOwnerIds: ['owner-b'] }))).rejects.toBeInstanceOf(ForbiddenException);
      expect(getServerConfig).toHaveBeenCalled();
    });

    it('requires confirmation when the toggle is on but the merge is not confirmed', () => {
      expect(() =>
        assertCrossOwnerCollapseAllowed(makePlan({ collapsedOwnerIds: ['owner-b'] }), {
          enabled: true,
          confirmCrossOwner: false,
        }),
      ).toThrow(ConflictException);
    });

    it('permits a cross-owner collapse once the toggle is on and the merge is confirmed', () => {
      expect(() =>
        assertCrossOwnerCollapseAllowed(makePlan({ collapsedOwnerIds: ['owner-b'] }), {
          enabled: true,
          confirmCrossOwner: true,
        }),
      ).not.toThrow();
    });
  });
});
