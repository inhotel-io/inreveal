import 'dart:async';

import 'package:immich_mobile/domain/models/person.model.dart';
import 'package:immich_mobile/infrastructure/repositories/people.repository.dart';
import 'package:immich_mobile/repositories/person_api.repository.dart';
import 'package:logging/logging.dart';

class DriftPeopleService {
  final DriftPeopleRepository _repository;
  final PersonApiRepository _personApiRepository;
  final _log = Logger("DriftPeopleService");

  DriftPeopleService(this._repository, this._personApiRepository);

  Future<DriftPerson?> get(String personId) {
    return _repository.get(personId);
  }

  Future<List<DriftPerson>> getAssetPeople(String assetId, {required bool ownedByCurrentUser}) async {
    // Faces are only synced into the local DB for assets the viewer owns. For an asset shared
    // with the viewer through a Space, fetch its (Space-resolved) people from the server so the
    // mobile app stays at parity with the web app, which resolves them on demand. See issue #727.
    if (!ownedByCurrentUser) {
      // The supplementary people strip is best-effort for non-owned assets: a transient
      // network/server failure should silently hide it (as the prior local-Drift lookup did)
      // rather than surface a visible error, so swallow the failure and return no people.
      try {
        return await _personApiRepository.getAssetPeople(assetId);
      } catch (error, stackTrace) {
        _log.warning("Failed to fetch people for non-owned asset $assetId", error, stackTrace);
        return const [];
      }
    }
    return _repository.getAssetPeople(assetId);
  }

  Future<List<DriftPerson>> getAllPeople({PeopleSortBy sortBy = PeopleSortBy.photoCount}) {
    return _repository.getAllPeople(sortBy: sortBy);
  }

  /// People for the global People page: the viewer's own people AND people on assets shared
  /// with them through a Space, matching the web People page (which calls the server with
  /// withSharedSpaces:true). The local sync DB is owner-scoped and never receives
  /// shared-space people, so this reads the server's unified, RBAC-projected list. This is
  /// the People-page sibling of issue #727.
  ///
  /// Kept separate from [getAllPeople] so the owner-scoped, local-first surfaces (the photos
  /// filter people picker, the library people card) are unaffected.
  Future<List<DriftPerson>> getAllPeopleWithSharedSpaces({PeopleSortBy sortBy = PeopleSortBy.photoCount}) async {
    try {
      return await _personApiRepository.getAllPeopleWithSharedSpaces(sortBy: sortBy);
    } catch (error, stackTrace) {
      // Offline / server failure: fall back to the owner-scoped local list so the viewer's
      // own people still render (their shared-space people are unavailable offline).
      _log.warning("Failed to fetch people from the server; using the local sync DB", error, stackTrace);
      return _repository.getAllPeople(sortBy: sortBy);
    }
  }

  Future<int> updateName(String personId, String name) async {
    await _personApiRepository.update(personId, name: name);
    return _repository.updateName(personId, name);
  }

  Future<int> updateBrithday(String personId, DateTime birthday) async {
    await _personApiRepository.update(personId, birthday: birthday);
    return _repository.updateBirthday(personId, birthday);
  }
}
