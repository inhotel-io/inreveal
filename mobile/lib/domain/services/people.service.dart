import 'dart:async';

import 'package:immich_mobile/domain/models/person.model.dart';
import 'package:immich_mobile/infrastructure/repositories/people.repository.dart';
import 'package:immich_mobile/repositories/person_api.repository.dart';

class DriftPeopleService {
  final DriftPeopleRepository _repository;
  final PersonApiRepository _personApiRepository;

  const DriftPeopleService(this._repository, this._personApiRepository);

  Future<DriftPerson?> get(String personId) {
    return _repository.get(personId);
  }

  Future<List<DriftPerson>> getAssetPeople(String assetId, {required bool ownedByCurrentUser}) {
    // Faces are only synced into the local DB for assets the viewer owns. For an asset shared
    // with the viewer through a Space, fetch its (Space-resolved) people from the server so the
    // mobile app stays at parity with the web app, which resolves them on demand. See issue #727.
    if (!ownedByCurrentUser) {
      return _personApiRepository.getAssetPeople(assetId);
    }
    return _repository.getAssetPeople(assetId);
  }

  Future<List<DriftPerson>> getAllPeople({PeopleSortBy sortBy = PeopleSortBy.photoCount}) {
    return _repository.getAllPeople(sortBy: sortBy);
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
