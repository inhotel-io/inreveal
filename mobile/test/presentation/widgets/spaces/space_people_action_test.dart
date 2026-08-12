import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/presentation/widgets/spaces/space_people_action.widget.dart';
import 'package:openapi/api.dart' as api;

import '../../../test_utils.dart';
import '../../../widget_tester_extensions.dart';

api.SharedSpaceResponseDto _space({
  api.Optional<bool?> faceRecognitionEnabled = const api.Optional.absent(),
}) => api.SharedSpaceResponseDto(
  id: 'space-1',
  name: 'Family Trip',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  createdById: 'user-1',
  faceRecognitionEnabled: faceRecognitionEnabled,
);

void main() {
  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    TestUtils.init();
  });

  testWidgets('renders the action when face recognition is enabled', (tester) async {
    await tester.pumpConsumerWidget(
      SpacePeopleAction(space: _space(faceRecognitionEnabled: const api.Optional.present(true)), onTap: () {}),
    );

    expect(find.byKey(const Key('space-people-action')), findsOneWidget);
  });

  testWidgets('hides the action when face recognition is explicitly disabled', (tester) async {
    await tester.pumpConsumerWidget(
      SpacePeopleAction(space: _space(faceRecognitionEnabled: const api.Optional.present(false)), onTap: () {}),
    );

    expect(find.byKey(const Key('space-people-action')), findsNothing);
  });

  testWidgets('renders the action when the flag is absent, without reading Optional.value', (tester) async {
    // Absent.value throws StateError, so a regression that reaches for `.value` fails loudly
    // here rather than crashing the space detail page in production.
    await tester.pumpConsumerWidget(SpacePeopleAction(space: _space(), onTap: () {}));

    expect(find.byKey(const Key('space-people-action')), findsOneWidget);
  });

  testWidgets('invokes onTap exactly once when tapped', (tester) async {
    var taps = 0;
    await tester.pumpConsumerWidget(
      SpacePeopleAction(
        space: _space(faceRecognitionEnabled: const api.Optional.present(true)),
        onTap: () => taps++,
      ),
    );

    await tester.tap(find.byKey(const Key('space-people-action')));
    await tester.pumpAndSettle();

    expect(taps, 1);
  });
}
