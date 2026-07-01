import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/person.model.dart';
import 'package:immich_mobile/domain/services/people.service.dart';
import 'package:immich_mobile/infrastructure/repositories/people.repository.dart';
import 'package:immich_mobile/providers/infrastructure/db.provider.dart';
import 'package:immich_mobile/providers/user.provider.dart';
import 'package:immich_mobile/repositories/person_api.repository.dart';

final driftPeopleRepositoryProvider = Provider<DriftPeopleRepository>(
  (ref) => DriftPeopleRepository(ref.watch(driftProvider)),
);

final driftPeopleServiceProvider = Provider<DriftPeopleService>(
  (ref) => DriftPeopleService(ref.watch(driftPeopleRepositoryProvider), ref.watch(personApiRepositoryProvider)),
);

final driftPeopleAssetProvider = FutureProvider.family<List<DriftPerson>, ({String id, String ownerId})>((
  ref,
  key,
) async {
  final service = ref.watch(driftPeopleServiceProvider);
  final currentUserId = ref.watch(currentUserProvider.select((user) => user?.id));
  return service.getAssetPeople(key.id, ownedByCurrentUser: key.ownerId == currentUserId);
});

final driftGetAllPeopleProvider = FutureProvider.family<List<DriftPerson>, PeopleSortBy>((ref, sortBy) async {
  final service = ref.watch(driftPeopleServiceProvider);
  return service.getAllPeople(sortBy: sortBy);
});

/// People for the global People page — the viewer's own people plus people on Space-shared
/// assets, matching the web People page. Kept distinct from [driftGetAllPeopleProvider] so
/// the owner-scoped, local-first people picker and library card stay local. See issue #727.
final driftGetAllPeopleWithSharedSpacesProvider = FutureProvider.family<List<DriftPerson>, PeopleSortBy>((
  ref,
  sortBy,
) async {
  final service = ref.watch(driftPeopleServiceProvider);
  return service.getAllPeopleWithSharedSpaces(sortBy: sortBy);
});
