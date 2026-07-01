import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/person.model.dart';
import 'package:immich_mobile/domain/services/people.service.dart';
import 'package:immich_mobile/infrastructure/repositories/people.repository.dart';
import 'package:immich_mobile/repositories/person_api.repository.dart';
import 'package:mocktail/mocktail.dart';

class MockDriftPeopleRepository extends Mock implements DriftPeopleRepository {}

class MockPersonApiRepository extends Mock implements PersonApiRepository {}

void main() {
  late DriftPeopleService sut;
  late MockDriftPeopleRepository mockRepository;
  late MockPersonApiRepository mockApiRepository;

  DriftPerson person(String id) => DriftPerson(
    id: id,
    createdAt: DateTime(2020),
    updatedAt: DateTime(2020),
    ownerId: 'owner',
    name: 'Alice',
    isFavorite: false,
    isHidden: false,
    color: null,
  );

  setUpAll(() {
    registerFallbackValue(PeopleSortBy.photoCount);
  });

  setUp(() {
    mockRepository = MockDriftPeopleRepository();
    mockApiRepository = MockPersonApiRepository();
    sut = DriftPeopleService(mockRepository, mockApiRepository);

    // The local sync DB never receives faces for assets the viewer does not own, so the
    // drift query comes back empty for a Space-shared asset.
    when(() => mockRepository.getAssetPeople(any())).thenAnswer((_) async => <DriftPerson>[]);
    // The server (like the web app) resolves the Space's people for that asset.
    when(() => mockApiRepository.getAssetPeople(any())).thenAnswer((_) async => [person('space-person')]);
  });

  group('getAssetPeople', () {
    // Regression test for issue #727: web showed faces on Space-shared assets but mobile did not.
    test('fetches people from the server for an asset the viewer does not own', () async {
      final result = await sut.getAssetPeople('shared-asset', ownedByCurrentUser: false);

      expect(result, [person('space-person')]);
      verify(() => mockApiRepository.getAssetPeople('shared-asset')).called(1);
      verifyNever(() => mockRepository.getAssetPeople(any()));
    });

    test('reads people from the local sync DB for the viewer\'s own asset', () async {
      when(() => mockRepository.getAssetPeople(any())).thenAnswer((_) async => [person('local-person')]);

      final result = await sut.getAssetPeople('own-asset', ownedByCurrentUser: true);

      expect(result, [person('local-person')]);
      verify(() => mockRepository.getAssetPeople('own-asset')).called(1);
      verifyNever(() => mockApiRepository.getAssetPeople(any()));
    });

    // The supplementary people strip is best-effort for non-owned assets: a network/server
    // failure must silently hide it (empty list) rather than surface a visible error.
    test('returns no people when the server fetch fails for a non-owned asset', () async {
      when(() => mockApiRepository.getAssetPeople(any())).thenThrow(Exception('network down'));

      final result = await sut.getAssetPeople('shared-asset', ownedByCurrentUser: false);

      expect(result, isEmpty);
    });
  });

  group('getAllPeopleWithSharedSpaces', () {
    // Regression test for the People-page sibling of issue #727: the web People page shows
    // people from Space-shared assets (getAllPeople withSharedSpaces:true), but the mobile
    // People page read only the owner-scoped local Drift DB and so was empty for a viewer
    // who owns no people. The service must surface the server's shared-space-inclusive list.
    test('returns the server shared-space-inclusive people list', () async {
      // The local sync DB is owner-scoped: a viewer who owns no people gets nothing from it.
      when(() => mockRepository.getAllPeople(sortBy: any(named: 'sortBy'))).thenAnswer((_) async => <DriftPerson>[]);
      when(
        () => mockApiRepository.getAllPeopleWithSharedSpaces(sortBy: any(named: 'sortBy')),
      ).thenAnswer((_) async => [person('space-person')]);

      final result = await sut.getAllPeopleWithSharedSpaces(sortBy: PeopleSortBy.photoCount);

      expect(result, [person('space-person')]);
      verify(() => mockApiRepository.getAllPeopleWithSharedSpaces(sortBy: PeopleSortBy.photoCount)).called(1);
    });

    // Offline / server failure must not blank the page: the viewer's own people still render
    // from the owner-scoped local sync DB (their shared-space people are simply unavailable).
    test('falls back to the local sync DB when the server fetch fails', () async {
      when(
        () => mockApiRepository.getAllPeopleWithSharedSpaces(sortBy: any(named: 'sortBy')),
      ).thenThrow(Exception('offline'));
      when(
        () => mockRepository.getAllPeople(sortBy: any(named: 'sortBy')),
      ).thenAnswer((_) async => [person('local-person')]);

      final result = await sut.getAllPeopleWithSharedSpaces(sortBy: PeopleSortBy.name);

      expect(result, [person('local-person')]);
      verify(() => mockRepository.getAllPeople(sortBy: PeopleSortBy.name)).called(1);
    });
  });
}
