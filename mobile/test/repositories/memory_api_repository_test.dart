import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/constants/errors.dart';
import 'package:immich_mobile/domain/models/memory.model.dart';
import 'package:immich_mobile/repositories/memory_api.repository.dart';
import 'package:immich_mobile/services/api.service.dart';
import 'package:mocktail/mocktail.dart';
import 'package:openapi/api.dart' as api;

class MockMemoriesApi extends Mock implements api.MemoriesApi {}

class MockApiService extends Mock implements ApiService {}

void main() {
  late MockMemoriesApi mockApi;
  late MockApiService mockApiService;
  late MemoryApiRepository sut;

  api.AssetResponseDto assetDto(String id, {String ownerId = 'other-user'}) => api.AssetResponseDto(
    id: id,
    ownerId: ownerId,
    checksum: 'checksum-$id',
    createdAt: DateTime.utc(2020, 5, 1),
    fileCreatedAt: DateTime.utc(2019, 8, 17),
    fileModifiedAt: DateTime.utc(2019, 8, 17),
    localDateTime: DateTime.utc(2019, 8, 17),
    updatedAt: DateTime.utc(2020, 5, 1),
    duration: null,
    hasMetadata: true,
    height: 1080,
    width: 1920,
    isArchived: false,
    isEdited: false,
    isFavorite: false,
    isOffline: false,
    isTrashed: false,
    originalFileName: '$id.jpg',
    originalPath: '/upload/$id.jpg',
    thumbhash: 'hash-$id',
    type: api.AssetTypeEnum.IMAGE,
    visibility: api.AssetVisibility.timeline,
  );

  api.MemoryResponseDto memoryDto(
    String id, {
    String ownerId = 'other-user',
    List<api.AssetResponseDto> assets = const [],
    DateTime? showAt,
    DateTime? hideAt,
    api.MemoryType type = api.MemoryType.onThisDay,
    Map<String, Object> data = const {'year': 2019},
  }) => api.MemoryResponseDto(
    id: id,
    ownerId: ownerId,
    assets: assets,
    createdAt: DateTime.utc(2026),
    updatedAt: DateTime.utc(2026),
    memoryAt: DateTime.utc(2019, 8, 17),
    isSaved: false,
    type: type,
    data: data,
    showAt: showAt == null ? const api.Optional.absent() : api.Optional.present(showAt),
    hideAt: hideAt == null ? const api.Optional.absent() : api.Optional.present(hideAt),
  );

  void stubSearchMemories(List<api.MemoryResponseDto>? memories) {
    when(() => mockApi.searchMemories()).thenAnswer((_) async => memories);
  }

  setUp(() {
    mockApi = MockMemoriesApi();
    mockApiService = MockApiService();
    when(() => mockApiService.memoriesApi).thenReturn(mockApi);
    sut = MemoryApiRepository(mockApiService);
  });

  group('getMemoryLane', () {
    // Regression test for issue #997: the web memory lane showed memories built from
    // Space-shared photos but the mobile one did not, because mobile read the
    // owner-scoped local sync DB. The server endpoint is RBAC-projected and returns
    // memories owned by other users when their assets are shared with the viewer.
    test('keeps a memory owned by another user', () async {
      stubSearchMemories([
        memoryDto('shared-memory', ownerId: 'space-owner', assets: [assetDto('shared-asset')]),
      ]);

      final result = await sut.getMemoryLane();

      expect(result.map((memory) => memory.id), ['shared-memory']);
      expect(result.single.ownerId, 'space-owner');
      expect(result.single.assets.map((asset) => asset.id), ['shared-asset']);
    });

    test('maps the memory fields the lane renders', () async {
      stubSearchMemories([
        memoryDto(
          'rule-memory',
          type: api.MemoryType.rule,
          data: const {'ruleId': 'pets', 'title': 'Your pets'},
          assets: [assetDto('a')],
        ),
      ]);

      final result = await sut.getMemoryLane();

      expect(result.single.type, MemoryTypeEnum.rule);
      expect(result.single.data.title, 'Your pets');
      expect(result.single.data.ruleId, 'pets');
      expect(result.single.memoryAt, DateTime.utc(2019, 8, 17));
      expect(result.single.isSaved, false);
    });

    // The lane query is a "what should be on screen today" query. The local Drift query
    // applies the show/hide window itself; the server only applies `hideAt` when a `for`
    // date is supplied, and the generated Dart client cannot send one (it serialises
    // DateTime as a full ISO timestamp while the endpoint requires YYYY-MM-DD), so the
    // window has to be applied client-side to keep parity.
    test('excludes a memory whose hideAt is in the past', () async {
      final now = DateTime.now().toUtc();
      stubSearchMemories([
        memoryDto(
          'expired',
          assets: [assetDto('a')],
          showAt: now.subtract(const Duration(days: 20)),
          hideAt: now.subtract(const Duration(days: 10)),
        ),
        memoryDto(
          'current',
          assets: [assetDto('b')],
          showAt: now.subtract(const Duration(days: 1)),
          hideAt: now.add(const Duration(days: 1)),
        ),
      ]);

      final result = await sut.getMemoryLane();

      expect(result.map((memory) => memory.id), ['current']);
    });

    test('excludes a memory whose showAt is in the future', () async {
      final now = DateTime.now().toUtc();
      stubSearchMemories([
        memoryDto(
          'upcoming',
          assets: [assetDto('a')],
          showAt: now.add(const Duration(days: 10)),
          hideAt: now.add(const Duration(days: 20)),
        ),
      ]);

      final result = await sut.getMemoryLane();

      expect(result, isEmpty);
    });

    test('includes a memory with no show/hide window', () async {
      stubSearchMemories([
        memoryDto('always', assets: [assetDto('a')]),
      ]);

      final result = await sut.getMemoryLane();

      expect(result.map((memory) => memory.id), ['always']);
    });

    // The lane card renders assets.first, so a memory with no assets would crash it.
    // The local query drops those via an inner join; keep the same guarantee here.
    test('excludes a memory with no assets', () async {
      stubSearchMemories([
        memoryDto('empty'),
        memoryDto('full', assets: [assetDto('a')]),
      ]);

      final result = await sut.getMemoryLane();

      expect(result.map((memory) => memory.id), ['full']);
    });

    test('throws when the server returns no body', () async {
      stubSearchMemories(null);

      await expectLater(sut.getMemoryLane(), throwsA(isA<NoResponseDtoError>()));
    });
  });
}
