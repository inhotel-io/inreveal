import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/widgets/settings/asset_list_settings/asset_list_group_settings.dart';

import '../../test_utils.dart';
import '../../widget_tester_extensions.dart';

void main() {
  late Drift db;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    TestUtils.init();
    db = Drift(drift.DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    await StoreService.init(storeRepository: DriftStoreRepository(db), listenUpdates: false);
  });

  setUp(() async {
    await Store.clear();
  });

  tearDownAll(() async {
    await Store.clear();
    await db.close();
  });

  testWidgets('renders grouping choices without none', (tester) async {
    await tester.pumpConsumerWidget(const GroupSettings());
    await tester.pumpAndSettle();

    expect(find.text('year'), findsOneWidget);
    expect(find.text('month'), findsOneWidget);
    expect(find.text('asset_list_layout_settings_group_by_month_day'), findsOneWidget);
    expect(find.text('asset_list_layout_settings_group_automatically'), findsOneWidget);
    expect(find.text('none'), findsNothing);
  });

  testWidgets('selecting year persists selected grouping', (tester) async {
    await tester.pumpConsumerWidget(const GroupSettings());
    await tester.pumpAndSettle();

    await tester.tap(find.text('year'));
    await tester.pumpAndSettle();

    expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.year.index);
  });

  testWidgets('selecting month from year persists selected grouping', (tester) async {
    await Store.put(StoreKey.groupAssetsBy, GroupAssetsBy.year.index);

    await tester.pumpConsumerWidget(const GroupSettings());
    await tester.pumpAndSettle();

    await tester.tap(find.text('month'));
    await tester.pumpAndSettle();

    expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.month.index);
  });
}
