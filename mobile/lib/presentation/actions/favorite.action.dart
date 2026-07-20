import 'package:flutter/material.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/generated/translations.g.dart';
import 'package:immich_mobile/presentation/actions/action.dart';
import 'package:immich_mobile/providers/infrastructure/asset.provider.dart';
import 'package:immich_ui/immich_ui.dart';

class FavoriteAction extends AssetAction<RemoteAsset> {
  final bool shouldFavorite;

  // #763 (E32): the direction must derive from the SAME set the action mutates. Candidates are
  // every remote asset in the selection — favorites are per-user, so read access (implied by the
  // asset being in the local mirror) is sufficient; ownership is irrelevant.
  FavoriteAction({required super.assets})
    : shouldFavorite = assets.whereType<RemoteAsset>().any((asset) => !asset.isFavorite);

  @override
  IconData get icon => shouldFavorite ? Icons.favorite_border_rounded : Icons.favorite_rounded;

  @override
  String label(ActionScope scope) => shouldFavorite ? scope.context.t.favorite : scope.context.t.unfavorite;

  @override
  Iterable<RemoteAsset> filter(ActionScope scope) =>
      assets.whereType<RemoteAsset>().where((asset) => asset.isFavorite == !shouldFavorite);

  @override
  bool isVisible(ActionScope scope) => filter(scope).isNotEmpty;

  @override
  Future<void> onAction(ActionScope scope) async {
    final ActionScope(:ref) = scope;
    final assets = filter(scope).map((asset) => asset.id).toList(growable: false);

    await ref.read(assetServiceProvider).updateFavorite(assets, shouldFavorite);
    final message = shouldFavorite
        ? StaticTranslations.instance.favorite_action_prompt(count: assets.length)
        : StaticTranslations.instance.unfavorite_action_prompt(count: assets.length);
    snackbar.success(message);
  }
}
