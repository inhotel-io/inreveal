import 'dart:async';
import 'dart:convert';

import 'package:background_downloader/background_downloader.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/constants/constants.dart';
import 'package:immich_mobile/repositories/upload.repository.dart';

import '../test_utils.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  TestUtils.init();

  group('UploadRepository', () {
    test('updateNotification posts the backup group notification without waiting for the native reply', () async {
      final calls = <({String method, Object? arguments})>[];
      final nativeReply = Completer<void>();

      final repository = UploadRepository.forTesting(
        backgroundDownloaderMethodInvoker: (method, arguments) {
          calls.add((method: method, arguments: arguments));
          return nativeReply.future;
        },
      );
      final task = UploadTask(
        taskId: 'asset-1',
        url: 'http://test-server.com/assets',
        filename: 'asset.jpg',
        baseDirectory: BaseDirectory.temporary,
        group: kBackupLivePhotoGroup,
      );

      final returned = repository.updateNotification(task, TaskStatus.enqueued);

      try {
        await returned.timeout(const Duration(milliseconds: 100));
      } finally {
        if (!nativeReply.isCompleted) {
          nativeReply.complete();
        }
      }
      await Future<void>.delayed(Duration.zero);

      expect(calls, hasLength(1));
      expect(calls.single.method, 'updateNotification');

      final args = calls.single.arguments as List<Object?>;
      expect(jsonDecode(args[0]! as String)['taskId'], 'asset-1');
      expect(jsonDecode(args[1]! as String)['groupNotificationId'], kBackupGroup);
      expect(args[2], TaskStatus.enqueued.index);
    });
  });
}
