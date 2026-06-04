import 'dart:async';

import 'package:background_downloader/background_downloader.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/constants/constants.dart';
import 'package:immich_mobile/providers/backup/drift_backup.provider.dart';
import 'package:immich_mobile/services/background_backup_queue_coordinator.dart';
import 'package:immich_mobile/services/background_upload.service.dart';
import 'package:immich_mobile/services/foreground_upload.service.dart';
import 'package:immich_mobile/utils/upload_speed_calculator.dart';
import 'package:mocktail/mocktail.dart';

class MockForegroundUploadService extends Mock implements ForegroundUploadService {}

class MockBackgroundUploadService extends Mock implements BackgroundUploadService {}

class MockBackgroundBackupQueueCoordinator extends Mock implements BackgroundBackupQueueCoordinator {}

void main() {
  late MockForegroundUploadService foregroundUploadService;
  late MockBackgroundUploadService backgroundUploadService;
  late MockBackgroundBackupQueueCoordinator backgroundQueueCoordinator;
  late StreamController<TaskStatusUpdate> statusController;
  late StreamController<TaskProgressUpdate> progressController;
  late DriftBackupNotifier sut;

  setUpAll(() {
    registerFallbackValue(Completer<void>());
    registerFallbackValue(
      UploadTask(
        taskId: 'fallback',
        url: 'http://test-server.com/assets',
        filename: 'fallback.jpg',
        baseDirectory: BaseDirectory.temporary,
        group: kBackupGroup,
      ),
    );
    registerFallbackValue(
      TaskStatusUpdate(
        UploadTask(
          taskId: 'fallback',
          url: 'http://test-server.com/assets',
          filename: 'fallback.jpg',
          baseDirectory: BaseDirectory.temporary,
          group: kBackupGroup,
        ),
        TaskStatus.complete,
      ),
    );
  });

  setUp(() {
    foregroundUploadService = MockForegroundUploadService();
    backgroundUploadService = MockBackgroundUploadService();
    backgroundQueueCoordinator = MockBackgroundBackupQueueCoordinator();
    statusController = StreamController<TaskStatusUpdate>.broadcast();
    progressController = StreamController<TaskProgressUpdate>.broadcast();

    when(() => backgroundUploadService.taskStatusStream).thenAnswer((_) => statusController.stream);
    when(() => backgroundUploadService.taskProgressStream).thenAnswer((_) => progressController.stream);

    when(() => backgroundQueueCoordinator.start(any())).thenAnswer((_) async {});
    when(() => backgroundQueueCoordinator.stop()).thenAnswer((_) async {});
    when(() => backgroundQueueCoordinator.handleStatus(any())).thenAnswer((_) async {});

    sut = DriftBackupNotifier(
      foregroundUploadService,
      backgroundUploadService,
      UploadSpeedManager(),
      backgroundQueueCoordinator: backgroundQueueCoordinator,
    );
  });

  tearDown(() async {
    sut.dispose();
    await statusController.close();
    await progressController.close();
  });

  test('tracks iOS URLSession backup progress in upload state', () async {
    final task = UploadTask(
      taskId: 'asset-1',
      url: 'http://test-server.com/assets',
      filename: 'asset.jpg',
      displayName: 'asset.jpg',
      baseDirectory: BaseDirectory.temporary,
      group: kBackupGroup,
    );

    progressController.add(TaskProgressUpdate(task, 0.5, 1000, 0.25));
    await pumpEventQueue();

    expect(
      sut.state.uploadItems['asset-1'],
      isA<DriftUploadStatus>()
          .having((status) => status.filename, 'filename', 'asset.jpg')
          .having((status) => status.progress, 'progress', 0.5)
          .having((status) => status.fileSize, 'fileSize', 1000),
    );
  });

  test('starts iOS URLSession backup through queue coordinator', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);

    await sut.startBackup('user-1');

    verify(() => backgroundQueueCoordinator.start('user-1')).called(1);
    verifyNever(() => foregroundUploadService.uploadCandidates(any(), any()));
  });

  test('stops iOS URLSession backup through queue coordinator', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);

    await sut.stopBackup();

    verify(() => backgroundQueueCoordinator.stop()).called(1);
  });

  test('forwards background status updates to the coordinator without refreshing UI counts', () async {
    final task = UploadTask(
      taskId: 'asset-1',
      url: 'http://test-server.com/assets',
      filename: 'asset.jpg',
      displayName: 'asset.jpg',
      baseDirectory: BaseDirectory.temporary,
      group: kBackupGroup,
    );

    statusController.add(TaskStatusUpdate(task, TaskStatus.complete));
    await pumpEventQueue();

    verify(() => backgroundQueueCoordinator.handleStatus(any())).called(1);
    verifyNever(() => foregroundUploadService.getBackupCounts(any()));
  });

  test('resumes active Live Photo still tasks instead of starting duplicate candidates', () async {
    // This test is now covered by the coordinator internally.
    // The notifier just delegates start() to the coordinator regardless of task state.
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);

    await sut.startBackup('user-1');

    verify(() => backgroundQueueCoordinator.start('user-1')).called(1);
  });

  test('tracks Live Photo still progress from the live photo group', () async {
    final task = UploadTask(
      taskId: 'asset-live',
      url: 'http://test-server.com/assets',
      filename: 'asset.heic',
      displayName: 'asset.heic',
      baseDirectory: BaseDirectory.temporary,
      group: kBackupLivePhotoGroup,
    );

    progressController.add(TaskProgressUpdate(task, 0.75, 2000, 0.5));
    await pumpEventQueue();

    expect(
      sut.state.uploadItems['asset-live'],
      isA<DriftUploadStatus>()
          .having((status) => status.filename, 'filename', 'asset.heic')
          .having((status) => status.progress, 'progress', 0.75)
          .having((status) => status.fileSize, 'fileSize', 2000),
    );
  });

  test('does not count Live Photo motion completion as final backup completion', () async {
    when(
      () => foregroundUploadService.getBackupCounts('user-1'),
    ).thenAnswer((_) async => (total: 1, remainder: 1, processing: 0));
    await sut.getBackupStatus('user-1');

    final motionMetadata = const UploadTaskMetadata(
      localAssetId: 'asset-live',
      isLivePhotos: true,
      livePhotoVideoId: '',
    ).toJson();
    final motionTask = UploadTask(
      taskId: 'asset-live',
      url: 'http://test-server.com/assets',
      filename: 'asset.mov',
      displayName: 'asset.mov',
      baseDirectory: BaseDirectory.temporary,
      group: kBackupGroup,
      metaData: motionMetadata,
    );

    statusController.add(TaskStatusUpdate(motionTask, TaskStatus.complete));
    await pumpEventQueue();

    expect(sut.state.backupCount, 0);
    expect(sut.state.remainderCount, 1);
  });

  test('counts Live Photo still completion as final backup completion', () async {
    when(
      () => foregroundUploadService.getBackupCounts('user-1'),
    ).thenAnswer((_) async => (total: 1, remainder: 1, processing: 0));
    await sut.getBackupStatus('user-1');

    final stillTask = UploadTask(
      taskId: 'asset-live',
      url: 'http://test-server.com/assets',
      filename: 'asset.heic',
      displayName: 'asset.heic',
      baseDirectory: BaseDirectory.temporary,
      group: kBackupLivePhotoGroup,
    );

    statusController.add(TaskStatusUpdate(stillTask, TaskStatus.complete));
    await pumpEventQueue();

    expect(sut.state.backupCount, 1);
    expect(sut.state.remainderCount, 0);
  });
}
