import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/ocr.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_overlay.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/ocr_overlay.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/ocr_overlay_switcher.widget.dart';
import 'package:immich_mobile/providers/infrastructure/live_text.provider.dart';
import 'package:immich_mobile/providers/infrastructure/ocr.provider.dart';
import 'package:immich_mobile/widgets/photo_view/photo_view.dart';

import '../../../fixtures/asset.stub.dart';
import '../../../test_utils.dart';
import '../../../unit/factories/remote_asset_factory.dart';
import '../../../widget_tester_extensions.dart';

void main() {
  late Drift db;

  final remoteAsset = RemoteAssetFactory.create(id: 'asset-1');
  final otherRemoteAsset = RemoteAssetFactory.create(id: 'asset-2');
  final localAsset = LocalAssetStub.image1;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    TestUtils.init();
    db = Drift(drift.DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    await StoreService.init(storeRepository: DriftStoreRepository(db), listenUpdates: false);
  });

  setUp(() async {
    await Store.clear();
    await Store.put(StoreKey.serverEndpoint, 'http://localhost:0');
  });

  tearDownAll(() async {
    await db.close();
  });

  Widget subject(BaseAsset asset, {PhotoViewControllerBase? controller}) => OcrOverlaySwitcher(
    asset: asset,
    imageSize: const Size(400, 800),
    viewportSize: const Size(400, 800),
    controller: controller,
  );

  Future<void> pump(WidgetTester tester, {required bool supported, BaseAsset? asset}) async {
    final target = asset ?? remoteAsset;
    await tester.pumpConsumerWidgetRaw(
      subject(target),
      overrides: [
        liveTextSupportedProvider.overrideWith((ref) async => supported),
        // Keep the upstream overlay away from a real database.
        ocrAssetProvider(target is RemoteAsset ? target.id : '').overrideWith((ref) async => <Ocr>[]),
      ],
    );
    await tester.pumpAndSettle();
  }

  group('OcrOverlaySwitcher', () {
    testWidgets('uses the server OCR overlay when Live Text is unsupported', (tester) async {
      await pump(tester, supported: false);

      expect(find.byType(OcrOverlay), findsOneWidget);
      expect(find.byType(LiveTextOverlay), findsNothing);
    });

    testWidgets('uses the Live Text overlay when supported', (tester) async {
      await pump(tester, supported: true);

      expect(find.byType(LiveTextOverlay), findsOneWidget);
      expect(find.byType(OcrOverlay), findsNothing);
    });

    testWidgets('falls back to the server overlay while support is still resolving', (tester) async {
      await tester.pumpConsumerWidgetRaw(
        subject(remoteAsset),
        overrides: [
          liveTextSupportedProvider.overrideWith((ref) async {
            await Future<void>.delayed(const Duration(seconds: 1));
            return true;
          }),
          ocrAssetProvider(remoteAsset.id).overrideWith((ref) async => <Ocr>[]),
        ],
      );
      await tester.pump();

      expect(find.byType(OcrOverlay), findsOneWidget);

      await tester.pumpAndSettle(const Duration(seconds: 2));
    });

    testWidgets('falls back to the server overlay when the support probe errors', (tester) async {
      await tester.pumpConsumerWidgetRaw(
        subject(remoteAsset),
        overrides: [
          liveTextSupportedProvider.overrideWith((ref) async => throw Exception('boom')),
          ocrAssetProvider(remoteAsset.id).overrideWith((ref) async => <Ocr>[]),
        ],
      );
      await tester.pumpAndSettle();

      expect(find.byType(OcrOverlay), findsOneWidget);
    });

    testWidgets('uses the server overlay for non-remote assets even when supported', (tester) async {
      await pump(tester, supported: true, asset: localAsset);

      expect(find.byType(OcrOverlay), findsOneWidget);
      expect(find.byType(LiveTextOverlay), findsNothing);
    });

    testWidgets('falls back to the server overlay when Live Text finds no text', (tester) async {
      await pump(tester, supported: true);
      expect(find.byType(LiveTextOverlay), findsOneWidget);

      tester.widget<LiveTextOverlay>(find.byType(LiveTextOverlay)).onAnalysisComplete(false);
      await tester.pumpAndSettle();

      expect(find.byType(OcrOverlay), findsOneWidget);
      expect(find.byType(LiveTextOverlay), findsNothing);
    });

    testWidgets('keeps the Live Text overlay when it finds text', (tester) async {
      await pump(tester, supported: true);

      tester.widget<LiveTextOverlay>(find.byType(LiveTextOverlay)).onAnalysisComplete(true);
      await tester.pumpAndSettle();

      expect(find.byType(LiveTextOverlay), findsOneWidget);
    });

    testWidgets('builds the preview url for the asset', (tester) async {
      await pump(tester, supported: true);

      final overlay = tester.widget<LiveTextOverlay>(find.byType(LiveTextOverlay));

      expect(overlay.previewUrl, contains('asset-1'));
      expect(overlay.previewUrl, contains('preview'));
    });

    testWidgets('forwards the photo view controller to the Live Text overlay', (tester) async {
      final controller = PhotoViewController();
      addTearDown(controller.dispose);

      await tester.pumpConsumerWidgetRaw(
        subject(remoteAsset, controller: controller),
        overrides: [
          liveTextSupportedProvider.overrideWith((ref) async => true),
          ocrAssetProvider(remoteAsset.id).overrideWith((ref) async => <Ocr>[]),
        ],
      );
      await tester.pumpAndSettle();

      expect(tester.widget<LiveTextOverlay>(find.byType(LiveTextOverlay)).controller, same(controller));
    });

    testWidgets('retries Live Text after paging to a different asset', (tester) async {
      // Riverpod's ProviderContainer fixes its override *set* at construction
      // (the first pump); a later pump can only update values for origins
      // already known, not add an override for a different `ocrAssetProvider`
      // family member. Register both assets' overrides up front — via the
      // same `overrides` list reused for both pumps — so re-pumping with the
      // second asset doesn't throw. Only one is ever actually watched.
      final overrides = [
        liveTextSupportedProvider.overrideWith((ref) async => true),
        ocrAssetProvider(remoteAsset.id).overrideWith((ref) async => <Ocr>[]),
        ocrAssetProvider(otherRemoteAsset.id).overrideWith((ref) async => <Ocr>[]),
      ];

      await tester.pumpConsumerWidgetRaw(subject(remoteAsset), overrides: overrides);
      await tester.pumpAndSettle();

      // This asset has no Live Text results, so we drop to the server overlay.
      tester.widget<LiveTextOverlay>(find.byType(LiveTextOverlay)).onAnalysisComplete(false);
      await tester.pumpAndSettle();
      expect(find.byType(OcrOverlay), findsOneWidget);

      // Swiping to a new asset must re-arm Live Text rather than stay latched.
      await tester.pumpConsumerWidgetRaw(subject(otherRemoteAsset), overrides: overrides);
      await tester.pumpAndSettle();

      expect(find.byType(LiveTextOverlay), findsOneWidget);
      expect(find.byType(OcrOverlay), findsNothing);
    });
  });
}
