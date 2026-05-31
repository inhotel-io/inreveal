import 'dart:async';

import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/services/search.service.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';

class PhotosFilterSearchState {
  final List<BaseAsset> assets;
  final int? nextPage;
  final bool isLoading;
  const PhotosFilterSearchState({this.assets = const [], this.nextPage = 1, this.isLoading = false});

  PhotosFilterSearchState copyWith({
    List<BaseAsset>? assets,
    int? nextPage,
    bool? isLoading,
    bool clearNextPage = false,
  }) => PhotosFilterSearchState(
    assets: assets ?? this.assets,
    nextPage: clearNextPage ? null : (nextPage ?? this.nextPage),
    isLoading: isLoading ?? this.isLoading,
  );
}

class PhotosFilterSearchNotifier extends StateNotifier<PhotosFilterSearchState> {
  final SearchService _search;
  final SearchFilter _filter;
  final _countController = StreamController<int>.broadcast();
  final _ids = <String>{};
  bool _disposed = false;

  /// Resolves when the page-1 load kicked in the constructor settles.
  late final Future<void> firstLoad;

  PhotosFilterSearchNotifier({required SearchService search, required SearchFilter filter})
    : _search = search,
      _filter = filter,
      super(const PhotosFilterSearchState()) {
    firstLoad = loadMore();
  }

  Stream<int> get count => _countController.stream;
  List<BaseAsset> getAssets() => List.unmodifiable(state.assets);

  Future<void> loadMore() async {
    if (state.nextPage == null || state.isLoading || _disposed) return;
    state = state.copyWith(isLoading: true);

    final result = await _search.search(_filter, state.nextPage!);
    if (_disposed) return;

    if (result == null) {
      // Empty results or an error — stop paging (no page-1 retry loop).
      state = state.copyWith(isLoading: false, clearNextPage: true);
      return;
    }

    final fresh = result.assets.where((a) => _ids.add(_assetKey(a))).toList(growable: false);
    final assets = [...state.assets, ...fresh];
    state = PhotosFilterSearchState(assets: assets, nextPage: result.nextPage, isLoading: false);
    if (!_countController.isClosed) _countController.add(assets.length);
  }

  /// Returns a stable unique key for deduplication.
  /// Search results are always RemoteAssets, so remoteId is non-null in practice.
  String _assetKey(BaseAsset a) => a.remoteId ?? a.heroTag;

  @override
  void dispose() {
    _disposed = true;
    _countController.close();
    super.dispose();
  }
}
