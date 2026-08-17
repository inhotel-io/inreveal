import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/memory.model.dart';
import 'package:immich_mobile/extensions/asset_extensions.dart';
import 'package:immich_mobile/providers/api.provider.dart';
import 'package:immich_mobile/repositories/api.repository.dart';
import 'package:immich_mobile/services/api.service.dart';
import 'package:openapi/api.dart';

final memoryApiRepositoryProvider = Provider((ref) => MemoryApiRepository(ref.watch(apiServiceProvider)));

class MemoryApiRepository extends ApiRepository {
  final ApiService _apiService;

  MemoryApiRepository(this._apiService);

  MemoriesApi get _api => _apiService.memoriesApi;

  /// Fetches the memory lane from the server, including memories built from photos shared
  /// with the viewer through a Space, exactly like the web memory lane (`searchMemories`).
  ///
  /// Memories are generated per owner and the `memory` / `memory_asset` sync streams are
  /// owner-scoped, so the local sync DB can never hold another user's memory. The server
  /// endpoint is RBAC-projected (it widens the memory set to anything the viewer can see,
  /// then filters each memory's assets down to the ones the viewer may view and drops the
  /// memories left empty), so reading it keeps mobile at parity with web. See issue #997.
  Future<List<DriftMemory>> getMemoryLane() async {
    // Deliberately no `for` filter: the endpoint requires a YYYY-MM-DD date, and the
    // generated Dart client serialises DateTime query params as a full ISO timestamp,
    // which the server rejects. Without `for` the server applies `showAt` against now but
    // not `hideAt`, so the show/hide window is applied here instead — the same window the
    // local Drift query applies.
    final dtos = await checkNull(_api.searchMemories());
    final now = DateTime.now();
    final localUtc = DateTime.utc(now.year, now.month, now.day);

    return dtos
        .where((dto) => _isVisibleAt(dto, localUtc))
        .map(_toDriftMemory)
        // The lane card renders assets.first; the local query drops asset-less memories via
        // an inner join, so keep the same guarantee for the server-sourced list.
        .where((memory) => memory.assets.isNotEmpty)
        .toList(growable: false);
  }

  static bool _isVisibleAt(MemoryResponseDto dto, DateTime at) {
    final showAt = dto.showAt.orElse(null);
    final hideAt = dto.hideAt.orElse(null);
    return (showAt == null || !showAt.isAfter(at)) && (hideAt == null || !hideAt.isBefore(at));
  }

  static DriftMemory _toDriftMemory(MemoryResponseDto dto) => DriftMemory(
    id: dto.id,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt.orElse(null),
    ownerId: dto.ownerId,
    type: _toMemoryType(dto.type),
    // `title` / `subtitle` on the DTO are mirrored straight out of `data` by the server
    // (see mapMemory), so the raw map alone carries everything the lane renders.
    data: MemoryData(Map<String, dynamic>.from(dto.data)),
    isSaved: dto.isSaved,
    memoryAt: dto.memoryAt,
    seenAt: dto.seenAt.orElse(null),
    showAt: dto.showAt.orElse(null),
    hideAt: dto.hideAt.orElse(null),
    assets: dto.assets.map((asset) => asset.toDto()).toList(growable: false),
  );

  static MemoryTypeEnum _toMemoryType(MemoryType type) => switch (type) {
    MemoryType.onThisDay => MemoryTypeEnum.onThisDay,
    MemoryType.rule => MemoryTypeEnum.rule,
  };
}
