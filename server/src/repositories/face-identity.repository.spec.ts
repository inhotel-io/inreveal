import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';

describe(FaceIdentityRepository.name, () => {
  describe('getMergePropagationProfiles', () => {
    it('rejects mixed profile and identity lookup modes', async () => {
      const sut = new FaceIdentityRepository({} as never);

      await expect(
        sut.getMergePropagationProfiles({
          mode: 'profiles',
          personIds: ['person-1'],
          identityIds: ['identity-1'],
        } as never),
      ).rejects.toThrow('Cannot lookup merge propagation profiles by profile ids and identity ids in the same call');
    });
  });
});
